import fs from "fs";
import path from "path";
import type {
  MineruParseRequest,
  MineruParseResult,
  MineruApiBlock,
  MineruBlockType,
  ConvertedBlock,
  MineruApiResponse,
} from "@/types/mineru";

/**
 * MinerU API 客户端
 *
 * 基于 MinerU 官方 API 规范实现
 * API 文档: http://127.0.0.1:8000/docs
 *
 * 支持的解析后端:
 * - pipeline: 通用，支持多语言，无幻觉
 * - vlm-auto-engine: 本地高精度，仅支持中英文
 * - hybrid-auto-engine: 新一代本地高精度，支持多语言（默认）
 * - hybrid-http-client/vlm-http-client: 远程计算高精度
 *
 * 使用方式:
 * 1. 本地部署 MinerU: https://github.com/opendatalab/MinerU
 * 2. 启动 API 服务: python app.py
 * 3. 配置环境变量: MINERU_API_URL=http://127.0.0.1:8000
 */
export class MineruClient {
  private baseUrl: string;
  private apiKey: string | undefined;
  private timeout: number;
  private backend: string;

  constructor() {
    // MinerU API 基础 URL（本地部署地址）
    this.baseUrl = process.env.MINERU_API_URL || "http://127.0.0.1:8000";
    // API Key（可选，部分部署可能需要）
    this.apiKey = process.env.MINERU_API_KEY;
    // 请求超时时间（秒）- 默认 30 分钟
    this.timeout = parseInt(process.env.MINERU_TIMEOUT || "1800", 10) * 1000;
    // 解析后端
    this.backend = process.env.MINERU_BACKEND || "hybrid-auto-engine";

    console.log(`[MinerU] 客户端初始化, baseUrl: ${this.baseUrl}, backend: ${this.backend}`);
  }

  /**
   * 解析文档（同步方式）
   *
   * @param params 解析请求参数
   * @returns 解析结果
   */
  async parseDocument(params: MineruParseRequest): Promise<MineruParseResult> {
    console.log(`[MinerU] 开始解析文档: ${params.filePath}`);

    // 检查文件是否存在
    if (!fs.existsSync(params.filePath)) {
      console.warn(`[MinerU] 文件不存在: ${params.filePath}, 使用模拟数据`);
      return this.mockParseResult(params);
    }

    // 读取文件
    const fileBuffer = fs.readFileSync(params.filePath);
    const fileName = params.fileName || path.basename(params.filePath);

    // 构建 FormData（MinerU 使用 files 参数，支持多文件）
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: params.mimeType });
    formData.append("files", blob, fileName);

    // 解析选项（根据 MinerU API 规范）
    const options = params.options || {};

    // 语言设置（中文文档）
    formData.append("lang_list", "ch");

    // 解析后端
    formData.append("backend", this.backend);

    // 解析方法
    formData.append("parse_method", options.parseMethod || "auto");

    // 启用表格和公式解析
    formData.append("table_enable", "true");
    formData.append("formula_enable", "true");

    // 返回格式设置
    formData.append("return_md", "true");              // 返回 Markdown
    formData.append("return_middle_json", "true");     // 返回中间 JSON（包含区块信息）
    formData.append("return_content_list", "true");    // 返回内容列表

    // 不返回图片和 ZIP
    formData.append("return_images", "false");
    formData.append("response_format_zip", "false");

    try {
      // 调用 MinerU API（同步解析）
      const response = await fetch(`${this.baseUrl}/file_parse`, {
        method: "POST",
        headers: this.apiKey
          ? { Authorization: `Bearer ${this.apiKey}` }
          : {},
        body: formData,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MinerU] API 错误: ${response.status} - ${errorText}`);
        throw new Error(`MinerU API 错误: ${response.status}`);
      }

      const apiResult = await response.json();
      console.log(`[MinerU] 解析完成, 结果类型: ${typeof apiResult}`);

      // 转换 API 响应为内部格式
      return this.convertApiResponse(apiResult, params);
    } catch (error) {
      console.error("[MinerU] 解析失败:", error);

      // 如果 API 不可用，使用模拟数据
      if (
        error instanceof TypeError ||
        (error instanceof Error && error.message.includes("fetch"))
      ) {
        console.warn("[MinerU] API 连接失败，使用模拟数据");
        return this.mockParseResult(params);
      }

      throw error;
    }
  }

  /**
   * 异步解析（提交任务）
   * 适用于大文件或长时间解析
   */
  async submitParseTask(
    params: MineruParseRequest
  ): Promise<string> {
    console.log(`[MinerU] 提交异步解析任务: ${params.filePath}`);

    if (!fs.existsSync(params.filePath)) {
      throw new Error(`文件不存在: ${params.filePath}`);
    }

    const fileBuffer = fs.readFileSync(params.filePath);
    const fileName = params.fileName || path.basename(params.filePath);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: params.mimeType });
    formData.append("files", blob, fileName);

    // 语言设置（数组格式）
    formData.append("lang_list", "ch");

    // 解析后端
    formData.append("backend", this.backend);

    // 解析方法
    const options = params.options || {};
    formData.append("parse_method", options.parseMethod || "auto");

    // 启用表格和公式解析
    formData.append("table_enable", "true");
    formData.append("formula_enable", "true");

    // 返回格式设置
    formData.append("return_md", "true");
    formData.append("return_middle_json", "true");
    formData.append("return_content_list", "true");

    // 是否返回图片（通过 options 配置）
    const returnImages = options.returnImages ?? false;
    formData.append("return_images", returnImages ? "true" : "false");
    formData.append("response_format_zip", "false");

    console.log(`[MinerU] 异步任务参数: return_images=${returnImages}`);

    const response = await fetch(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers: this.apiKey
        ? { Authorization: `Bearer ${this.apiKey}` }
        : {},
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MinerU] 提交任务失败: ${response.status} - ${errorText}`);
      throw new Error(`提交任务失败: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[MinerU] 任务已提交, taskId: ${result.task_id || result.taskId}`);
    return result.task_id || result.taskId;
  }

  /**
   * 获取异步任务状态
   */
  async getTaskStatus(taskId: string): Promise<{
    status: "pending" | "processing" | "completed" | "failed";
    progress?: number;
    error?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
      headers: this.apiKey
        ? { Authorization: `Bearer ${this.apiKey}` }
        : {},
    });

    if (!response.ok) {
      throw new Error(`获取状态失败: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[MinerU] 任务状态原始返回: ${JSON.stringify(result)}`);

    // MinerU的任务API没有progress字段，需要根据时间估算
    let progress: number | undefined;

    if (result.status === "completed") {
      progress = 100;
    } else if (result.status === "pending") {
      progress = 0;
    } else if (result.status === "processing") {
      // 估算进度：基于started_at时间，假设最长10分钟
      const startedAt = new Date(result.started_at || result.created_at);
      const elapsed = (Date.now() - startedAt.getTime()) / 1000; // 秒
      const estimatedDuration = 600; // 假设10分钟
      progress = Math.min(99, Math.floor((elapsed / estimatedDuration) * 100));
      console.log(`[MinerU] 估算进度: elapsed=${elapsed}s, progress=${progress}%`);
    }

    return {
      status: result.status || "pending",
      progress,
      error: result.error,
    };
  }

  /**
   * 获取异步解析结果
   */
  async getParseResult(taskId: string): Promise<MineruParseResult> {
    console.log(`[MinerU] 获取解析结果: ${taskId}`);

    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/result`, {
      headers: this.apiKey
        ? { Authorization: `Bearer ${this.apiKey}` }
        : {},
    });

    if (!response.ok) {
      throw new Error(`获取结果失败: ${response.status}`);
    }

    const apiResult = await response.json();

    if (apiResult.status === "pending" || apiResult.status === "processing") {
      return {
        taskId,
        status: apiResult.status as "pending" | "processing",
        totalPages: 0,
        fullText: "",
        structured: {},
        blocks: [],
        tables: [],
        images: [],
        equations: [],
        raw: apiResult,
      };
    }

    if (apiResult.status === "failed") {
      throw new Error(apiResult.error || "解析失败");
    }

    return this.convertApiResponse(apiResult, { filePath: "", mimeType: "" }, taskId);
  }

  /**
   * 检查 API 服务状态
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      const result = await response.json();
      console.log(`[MinerU] 健康检查: ${JSON.stringify(result)}`);
      return response.ok;
    } catch (error) {
      console.error(`[MinerU] 健康检查失败: ${error}`);
      return false;
    }
  }

  /**
   * 转换 API 响应为内部格式
   *
   * MinerU 实际返回格式 (hybrid-auto-engine 后端):
   * {
   *   "status": "completed",
   *   "results": {
   *     "文件名": {
   *       "md_content": "Markdown内容...",
   *       "middle_json": { "pdf_info": [...] },  // 可选
   *       "content_list": [...]                   // 可选
   *     }
   *   }
   * }
   */
  private convertApiResponse(
    apiResult: Record<string, unknown>,
    params: MineruParseRequest,
    taskId?: string
  ): MineruParseResult {
    const blocks: ConvertedBlock[] = [];
    const tables: MineruParseResult["tables"] = [];
    const images: MineruParseResult["images"] = [];
    const equations: MineruParseResult["equations"] = [];

    console.log("[MinerU] 开始转换 API 响应, 响应字段:", Object.keys(apiResult));

    // 提取结果数据 - MinerU 的数据在 results 对象中
    let resultData: Record<string, unknown> = apiResult;
    let markdown = "";

    // 新格式：results 字段包含文件名 -> 解析结果的映射
    if (apiResult.results && typeof apiResult.results === "object") {
      const results = apiResult.results as Record<string, Record<string, unknown>>;
      // 获取第一个文件的解析结果
      const fileNames = Object.keys(results);
      console.log("[MinerU] results 包含文件:", fileNames);

      if (fileNames.length > 0) {
        const firstFile = fileNames[0];
        resultData = results[firstFile];
        console.log("[MinerU] 使用文件结果:", firstFile, "字段:", Object.keys(resultData));

        // md_content 是实际字段名
        markdown = (resultData.md_content || resultData.markdown || resultData.md || "") as string;
      }
    } else {
      // 旧格式或直接返回
      markdown = (apiResult.markdown || apiResult.md || apiResult.md_content || "") as string;
    }

    console.log("[MinerU] markdown 长度:", markdown.length);

    // 提取全文
    const fullText = markdown || this.extractFullText(resultData);

    // ===== 处理 middle_json =====
    // 注意：MinerU 的 middle_json 和 content_list 是 JSON 字符串，需要解析！
    let middleJsonParsed: Record<string, unknown> | null = null;
    let contentListParsed: Array<Record<string, unknown>> | null = null;

    // 解析 middle_json
    if (resultData.middle_json) {
      const mj = resultData.middle_json;
      if (typeof mj === "string") {
        try {
          middleJsonParsed = JSON.parse(mj);
          console.log("[MinerU] middle_json 解析成功");
        } catch (e) {
          console.log("[MinerU] middle_json 解析失败:", e);
        }
      } else if (typeof mj === "object") {
        middleJsonParsed = mj as Record<string, unknown>;
      }
    }

    // 解析 content_list（注意：MinerU 可能返回字符串数组形式的 JSON）
    if (resultData.content_list) {
      const cl = resultData.content_list;
      if (typeof cl === "string") {
        try {
          contentListParsed = JSON.parse(cl);
          console.log("[MinerU] content_list 解析成功, 数量:", contentListParsed?.length);
        } catch (e) {
          console.log("[MinerU] content_list 解析失败:", e);
        }
      } else if (Array.isArray(cl)) {
        // 可能是字符串数组（每个字符是一个元素）或正常数组
        if (cl.length > 0 && typeof cl[0] === "string" && cl[0].length === 1) {
          // 字符串数组，需要拼接后解析
          try {
            const combined = cl.join("");
            contentListParsed = JSON.parse(combined);
            console.log("[MinerU] content_list (拼接后) 解析成功, 数量:", contentListParsed?.length);
          } catch (e) {
            console.log("[MinerU] content_list 拼接解析失败:", e);
            contentListParsed = null;
          }
        } else {
          contentListParsed = cl as Array<Record<string, unknown>>;
        }
      }
    }

    // ===== 解析 images 对象 =====
    // MinerU 返回格式: { "hash.jpg": "data:image/jpeg;base64,...", ... }
    const imagesData: Record<string, string> = {};
    if (resultData.images && typeof resultData.images === "object") {
      const imgObj = resultData.images as Record<string, string>;
      for (const [filename, base64Data] of Object.entries(imgObj)) {
        if (typeof base64Data === "string" && base64Data.startsWith("data:")) {
          imagesData[filename] = base64Data;
        }
      }
      console.log("[MinerU] 解析到", Object.keys(imagesData).length, "张图片");
    }

    // ===== 优先使用 content_list（bbox 信息完整）=====
    if (contentListParsed && contentListParsed.length > 0) {
      console.log("[MinerU] 使用 content_list 提取区块, 数量:", contentListParsed.length);
      const items = contentListParsed.slice(0, 2000); // 限制2000条
      let blockIndex = 0;

      for (const item of items) {
        // 页码从 page_idx 获取，转换为从1开始
        const pageNumber = ((item.page_idx ?? item.page_no ?? item.page ?? 0) as number) + 1;
        const type = (item.type ?? "text") as string;
        const blockType = this.normalizeBlockType(type);

        // bbox 格式：[x0, y0, x1, y1]
        const bboxRaw = item.bbox;
        let bbox: { x0: number; y0: number; x1: number; y1: number } | null = null;
        if (bboxRaw && Array.isArray(bboxRaw) && bboxRaw.length >= 4) {
          bbox = {
            x0: bboxRaw[0] as number,
            y0: bboxRaw[1] as number,
            x1: bboxRaw[2] as number,
            y1: bboxRaw[3] as number,
          };
        }

        // 根据类型提取不同内容
        let content = "";
        let imagePath: string | undefined;

        if (blockType === "image") {
          // image 类型：提取图片路径
          imagePath = (item.image_path ?? item.img_path ?? item.path) as string | undefined;
          content = imagePath || `[图片 第${pageNumber}页]`;

          // 同时添加到 images 数组
          if (imagePath) {
            images.push({
              id: `img_${blockIndex}`,
              pageNumber,
              bbox: bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
              imagePath,
            });
          }
        } else {
          // 其他类型：提取文字内容
          content = (item.text ?? item.content ?? "") as string;
        }

        const level = (item.text_level ?? item.level) as number | undefined;

        blocks.push({
          id: `cl_block_${blockIndex}`,
          pageNumber,
          index: blockIndex,
          type: blockType,
          content,
          bbox,
          level,
          imagePath,
        });

        blockIndex++;
      }

      console.log("[MinerU] 从 content_list 提取了", blocks.length, "个区块");
      console.log("[MinerU] 其中图片区块:", blocks.filter(b => b.type === "image").length);

      // 统计有效 bbox 数量
      const validBboxCount = blocks.filter(b => b.bbox && (b.bbox.x0 !== 0 || b.bbox.y0 !== 0)).length;
      console.log("[MinerU] 有效 bbox 区块数:", validBboxCount);
    } else {
      console.log("[MinerU] content_list 为空或不存在，尝试使用 middle_json");
    }

    // ===== 处理 middle_json（备用，提取表格等详细信息）=====
    if (!blocks.length && middleJsonParsed) {
      console.log("[MinerU] middle_json 字段:", Object.keys(middleJsonParsed));

      if (middleJsonParsed.pdf_info) {
        const pdfInfo = middleJsonParsed.pdf_info as Array<Record<string, unknown>>;
        console.log("[MinerU] pdf_info 页数:", pdfInfo.length);
        this.processPdfInfo(pdfInfo, blocks, tables, equations);
      }
    }

    // 如果还是没有区块，从 markdown 生成基本区块
    if (!blocks.length && markdown) {
      console.log("[MinerU] 从 markdown 生成区块");
      blocks.push(...this.extractBlocksFromMarkdown(markdown, 500)); // 限制500个区块
    }

    // 提取标题
    const titleBlock = blocks.find((b) => b.type === "title");

    // 提取章节结构
    const sections = this.extractSections(blocks);

    // 计算 totalPages - 使用循环避免栈溢出
    let maxPage = 1;
    for (const block of blocks) {
      if (block.pageNumber > maxPage) {
        maxPage = block.pageNumber;
      }
    }

    console.log(`[MinerU] 转换完成: ${blocks.length} 个区块, ${tables.length} 个表格, ${equations.length} 个公式, ${maxPage} 页, ${Object.keys(imagesData).length} 张图片`);

    return {
      taskId: taskId || `parse_${Date.now()}`,
      status: "completed",
      totalPages: maxPage,
      fullText,
      markdown,
      structured: {
        title: titleBlock?.content || params.fileName || "未知标题",
        sections,
      },
      blocks,
      tables,
      images,
      equations,
      imagesData,
      raw: {
        status: "success",
        ...apiResult,
      } as MineruApiResponse,
    };
  }

  /**
   * 处理 pdf_info 结构
   */
  private processPdfInfo(
    pdfInfo: Array<Record<string, unknown>>,
    blocks: ConvertedBlock[],
    tables: MineruParseResult["tables"],
    equations: MineruParseResult["equations"]
  ): void {
    let blockIndex = 0;

    for (const pageInfo of pdfInfo) {
      const pageIndex = (pageInfo.page_idx || pageInfo.page_no || pageInfo.pageIndex || pageInfo.page || 0) as number;
      const pageNumber = pageIndex + 1; // 转换为从1开始
      const pageBlocks = (pageInfo.blocks || pageInfo.preproc_blocks || pageInfo.blockList || pageInfo.items || []) as Array<Record<string, unknown>>;

      for (const block of pageBlocks) {
        const convertedBlock = this.convertMiddleJsonBlock(block, pageNumber, blockIndex);
        if (convertedBlock) {
          blocks.push(convertedBlock);
          blockIndex++;

          if (convertedBlock.type === "table" && convertedBlock.tableData) {
            const bbox = convertedBlock.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
            tables.push({
              id: convertedBlock.id,
              pageNumber: convertedBlock.pageNumber,
              bbox,
              rows: convertedBlock.tableData.map((row) => ({
                cells: row.map((cell) => ({ content: cell, bbox })),
              })),
            });
          }

          if (convertedBlock.type === "equation" && convertedBlock.latex) {
            equations.push({
              id: convertedBlock.id,
              pageNumber: convertedBlock.pageNumber,
              bbox: convertedBlock.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
              latex: convertedBlock.latex,
              text: convertedBlock.content,
            });
          }
        }
      }
    }
  }

  /**
   * 转换 middle_json 区块
   */
  private convertMiddleJsonBlock(
    block: Record<string, unknown>,
    pageNumber: number,
    index: number
  ): ConvertedBlock | null {
    const type = (block.type || block.block_type || "text") as string;

    // 提取内容 - 支持多种结构
    let content = "";

    // 1. 直接的 text 或 content 字段
    if (block.text) {
      content = block.text as string;
    } else if (block.content) {
      content = block.content as string;
    } else if (block.lines) {
      // 2. MinerU实际结构：lines[].spans[].content（嵌套）
      const lines = block.lines as Array<Record<string, unknown>>;
      for (const line of lines) {
        if (line.spans) {
          const spans = line.spans as Array<Record<string, unknown>>;
          for (const span of spans) {
            if (span.content) {
              content += (span.content as string) + " ";
            }
          }
        }
        if (line.text) {
          content += (line.text as string) + " ";
        }
      }
      content = content.trim();
    }

    // 提取边界框
    const bboxRaw = block.bbox || block.box;
    let bbox: { x0: number; y0: number; x1: number; y1: number } | null = null;
    if (bboxRaw && Array.isArray(bboxRaw) && bboxRaw.length >= 4) {
      bbox = {
        x0: bboxRaw[0] as number,
        y0: bboxRaw[1] as number,
        x1: bboxRaw[2] as number,
        y1: bboxRaw[3] as number,
      };
    }

    // 表格数据
    const tableBodyRaw = block.table_body || block.table_body_list;
    const tableBody = Array.isArray(tableBodyRaw)
      ? (tableBodyRaw as string[][])
      : undefined;

    // 公式 LaTeX
    const latex = block.latex as string | undefined;

    return {
      id: `block_${pageNumber}_${index}`,
      pageNumber,
      index,
      type: this.normalizeBlockType(type),
      content,
      bbox,
      level: (block.level as number) || undefined,
      tableData: tableBody,
      latex,
      imagePath: (block.image_path as string) || undefined,
    };
  }

  /**
   * 转换 content_list 项目
   */
  private convertContentListItem(
    item: Record<string, unknown>,
    pageNumber: number,
    index: number
  ): ConvertedBlock | null {
    const type = (item.type || "text") as string;
    const content = (item.text || item.content || "") as string;

    const bboxRaw = item.bbox;
    let bbox: { x0: number; y0: number; x1: number; y1: number } | null = null;
    if (bboxRaw && Array.isArray(bboxRaw) && bboxRaw.length >= 4) {
      bbox = {
        x0: bboxRaw[0] as number,
        y0: bboxRaw[1] as number,
        x1: bboxRaw[2] as number,
        y1: bboxRaw[3] as number,
      };
    }

    return {
      id: `block_${pageNumber}_${index}`,
      pageNumber,
      index,
      type: this.normalizeBlockType(type),
      content,
      bbox,
    };
  }

  /**
   * 标准化区块类型
   */
  private normalizeBlockType(type: string): MineruBlockType {
    const typeMap: Record<string, MineruBlockType> = {
      "text": "text",
      "title": "title",
      "header": "title",
      "paragraph": "paragraph",
      "para": "paragraph",
      "table": "table",
      "table_body": "table",
      "image": "image",
      "figure": "image",
      "equation": "equation",
      "formula": "equation",
      "interline_equation": "equation",
      "list": "list",
      "footer": "footer",
      "footnote": "footnote",
      "code": "code",
    };
    return typeMap[type.toLowerCase()] || "text";
  }

  /**
   * 从 Markdown 提取区块（当 middle_json 不可用时的备用方案）
   */
  private extractBlocksFromMarkdown(markdown: string, limit: number = 500): ConvertedBlock[] {
    const blocks: ConvertedBlock[] = [];
    const lines = markdown.split("\n").slice(0, limit); // 限制处理行数
    let blockIndex = 0;
    let pageNumber = 1;

    for (const line of lines) {
      // 空行跳过
      if (!line.trim()) continue;

      let blockType: MineruBlockType = "text";
      let content = line.trim();
      let level: number | undefined = undefined;

      // 标题检测
      if (line.startsWith("#")) {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          blockType = "title";
          content = match[2];
          level = match[1].length;
        }
      }
      // 表格检测
      else if (line.startsWith("|") && line.includes("|")) {
        blockType = "table";
      }
      // 列表检测
      else if (line.match(/^[-*+]\s+/) || line.match(/^\d+\.\s+/)) {
        blockType = "list";
      }

      blocks.push({
        id: `md_block_${blockIndex}`,
        pageNumber,
        index: blockIndex,
        type: blockType,
        content,
        bbox: null,
        level,
      });

      blockIndex++;

      // 每 20 个区块算一页（简化处理）
      if (blockIndex % 20 === 0) {
        pageNumber++;
      }
    }

    console.log(`[MinerU] 从 markdown 提取了 ${blocks.length} 个区块`);
    return blocks;
  }

  /**
   * 从 API 结果提取全文
   */
  private extractFullText(apiResult: Record<string, unknown>): string {
    // 尝试多种可能的字段
    const fields = ["full_text", "text", "content"];
    for (const field of fields) {
      if (apiResult[field] && typeof apiResult[field] === "string") {
        return apiResult[field] as string;
      }
    }
    return "";
  }

  /**
   * 提取章节结构
   */
  private extractSections(blocks: ConvertedBlock[]): MineruParseResult["structured"]["sections"] {
    const sections: MineruParseResult["structured"]["sections"] = [];

    for (const block of blocks) {
      if (block.type === "title" && block.level && block.level <= 3) {
        sections.push({
          id: block.id,
          title: block.content,
          content: "",
          pageNumber: block.pageNumber,
          level: block.level || 1,
        });
      } else if (
        (block.type === "text" || block.type === "paragraph") &&
        sections.length > 0 &&
        block.content
      ) {
        // 将文本内容关联到上一个章节
        const lastSection = sections[sections.length - 1];
        if (lastSection.content) {
          lastSection.content += "\n" + block.content;
        } else {
          lastSection.content = block.content;
        }
      }
    }

    return sections;
  }

  /**
   * 模拟解析结果（开发环境使用）
   */
  private mockParseResult(params: MineruParseRequest): MineruParseResult {
    console.log("[MinerU] 生成模拟解析结果");

    const mockBlocks: ConvertedBlock[] = [
      {
        id: "block_1",
        pageNumber: 1,
        index: 0,
        type: "title" as MineruBlockType,
        content: "招标文件示例标题",
        bbox: { x0: 100, y0: 50, x1: 500, y1: 100 },
        level: 1,
      },
      {
        id: "block_2",
        pageNumber: 1,
        index: 1,
        type: "paragraph" as MineruBlockType,
        content:
          "本招标文件为示例文档，用于测试文档解析功能。请投标方仔细阅读招标要求，确保投标文件符合所有规定。",
        bbox: { x0: 100, y0: 120, x1: 500, y1: 200 },
      },
      {
        id: "block_3",
        pageNumber: 1,
        index: 2,
        type: "title" as MineruBlockType,
        content: "投标人资格要求",
        bbox: { x0: 100, y0: 250, x1: 500, y1: 280 },
        level: 2,
      },
      {
        id: "block_4",
        pageNumber: 2,
        index: 0,
        type: "text" as MineruBlockType,
        content:
          "1. 投标人须具备相关行业资质证书，具有三年以上相关经验。\n2. 投标人须具有良好的财务状况和履约能力。\n3. 投标人须无重大违法记录。",
        bbox: { x0: 100, y0: 50, x1: 500, y1: 200 },
      },
      {
        id: "block_5",
        pageNumber: 2,
        index: 1,
        type: "table" as MineruBlockType,
        content: "",
        bbox: { x0: 100, y0: 250, x1: 500, y1: 400 },
        tableData: [
          ["项目", "要求", "备注"],
          ["资质等级", "甲级", "必备"],
          ["注册资本", "500万元以上", "必备"],
          ["业绩要求", "3个同类项目", "加分项"],
        ],
      },
      {
        id: "block_6",
        pageNumber: 3,
        index: 0,
        type: "title" as MineruBlockType,
        content: "投标文件要求",
        bbox: { x0: 100, y0: 50, x1: 500, y1: 80 },
        level: 2,
      },
      {
        id: "block_7",
        pageNumber: 3,
        index: 1,
        type: "list" as MineruBlockType,
        content: "投标文件应包含以下内容：",
        bbox: { x0: 100, y0: 100, x1: 500, y1: 150 },
      },
      {
        id: "block_8",
        pageNumber: 3,
        index: 2,
        type: "text" as MineruBlockType,
        content:
          "- 投标函及投标函附录\n- 法定代表人身份证明或授权委托书\n- 投标保证金银行保函\n- 已标价的工程量清单\n- 施工组织设计\n- 项目管理机构配置",
        bbox: { x0: 100, y0: 160, x1: 500, y1: 300 },
      },
    ];

    const fullText = mockBlocks
      .filter((b) => b.content)
      .map((b) => b.content)
      .join("\n\n");

    return {
      taskId: `mock_${Date.now()}`,
      status: "completed",
      totalPages: 3,
      fullText,
      markdown: `# 招标文件示例标题\n\n本招标文件为示例文档，用于测试文档解析功能。请投标方仔细阅读招标要求，确保投标文件符合所有规定。\n\n## 投标人资格要求\n\n1. 投标人须具备相关行业资质证书，具有三年以上相关经验。\n2. 投标人须具有良好的财务状况和履约能力。\n3. 投标人须无重大违法记录。\n\n| 项目 | 要求 | 备注 |\n|------|------|------|\n| 资质等级 | 甲级 | 必备 |\n| 注册资本 | 500万元以上 | 必备 |\n| 业绩要求 | 3个同类项目 | 加分项 |\n\n## 投标文件要求\n\n投标文件应包含以下内容：\n\n- 投标函及投标函附录\n- 法定代表人身份证明或授权委托书\n- 投标保证金银行保函\n- 已标价的工程量清单\n- 施工组织设计\n- 项目管理机构配置`,
      structured: {
        title: "招标文件示例标题",
        sections: [
          {
            id: "section_1",
            title: "投标人资格要求",
            content:
              "1. 投标人须具备相关行业资质证书，具有三年以上相关经验。\n2. 投标人须具有良好的财务状况和履约能力。\n3. 投标人须无重大违法记录。",
            pageNumber: 2,
            level: 2,
          },
          {
            id: "section_2",
            title: "投标文件要求",
            content:
              "投标文件应包含以下内容：\n- 投标函及投标函附录\n- 法定代表人身份证明或授权委托书\n- 投标保证金银行保函\n- 已标价的工程量清单\n- 施工组织设计\n- 项目管理机构配置",
            pageNumber: 3,
            level: 2,
          },
        ],
      },
      blocks: mockBlocks,
      tables: [
        {
          id: "table_1",
          pageNumber: 2,
          bbox: { x0: 100, y0: 250, x1: 500, y1: 400 },
          rows: [
            { cells: [{ content: "项目", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }, { content: "要求", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }, { content: "备注", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }] },
            { cells: [{ content: "资质等级", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }, { content: "甲级", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }, { content: "必备", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }] },
            { cells: [{ content: "注册资本", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }, { content: "500万元以上", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }, { content: "必备", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }] },
            { cells: [{ content: "业绩要求", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }, { content: "3个同类项目", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }, { content: "加分项", bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } }] },
          ],
        },
      ],
      images: [],
      equations: [],
      raw: {
        status: "success",
        totalPages: 3,
      },
    };
  }
}

// 导出单例实例
export const mineruClient = new MineruClient();
import fs from "fs";
import path from "path";
import type {
  MineruParseRequest,
  MineruParseResult,
  MineruBlockType,
  ConvertedBlock,
  MineruApiResponse,
} from "@/types/mineru";

/**
 * MinerU API 客户端（简化版）
 *
 * 基于 MinerU 实际 API 返回格式实现
 * API 文档: http://127.0.0.1:8000/docs
 *
 * MinerU 返回格式:
 * {
 *   "md_content": "Markdown内容...",
 *   "middle_json": { "pdf_info": [...] },  // 不使用，结构复杂
 *   "content_list": [                       // 主要数据源，扁平数组
 *     { type, bbox, page_idx, img_path/text, ... }
 *   ]
 * }
 */
export class MineruClient {
  private baseUrl: string;
  private apiKey: string | undefined;
  private timeout: number;
  private backend: string;

  constructor() {
    this.baseUrl = process.env.MINERU_API_URL || "http://127.0.0.1:8000";
    this.apiKey = process.env.MINERU_API_KEY;
    this.timeout = parseInt(process.env.MINERU_TIMEOUT || "1800", 10) * 1000;
    this.backend = process.env.MINERU_BACKEND || "hybrid-auto-engine";

    console.log(`[MinerU] 客户端初始化, baseUrl: ${this.baseUrl}, backend: ${this.backend}`);
  }

  /**
   * 解析文档（同步方式）
   */
  async parseDocument(params: MineruParseRequest): Promise<MineruParseResult> {
    console.log(`[MinerU] 开始解析文档: ${params.filePath}`);

    if (!fs.existsSync(params.filePath)) {
      throw new Error(`文件不存在: ${params.filePath}`);
    }

    const fileBuffer = fs.readFileSync(params.filePath);
    const fileName = params.fileName || path.basename(params.filePath);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: params.mimeType });
    formData.append("files", blob, fileName);

    formData.append("lang_list", "ch");
    formData.append("backend", this.backend);
    formData.append("parse_method", "auto");
    formData.append("table_enable", "true");
    formData.append("formula_enable", "true");
    formData.append("return_md", "true");
    formData.append("return_middle_json", "true");
    formData.append("return_content_list", "true");
    formData.append("return_images", "false");
    formData.append("response_format_zip", "false");

    const response = await fetch(`${this.baseUrl}/file_parse`, {
      method: "POST",
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      body: formData,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MinerU] API 错误: ${response.status} - ${errorText}`);
      throw new Error(`MinerU API 错误: ${response.status}`);
    }

    const apiResult = await response.json();
    console.log(`[MinerU] 解析完成`);

    return this.convertApiResponse(apiResult, params);
  }

  /**
   * 异步解析（提交任务）
   */
  async submitParseTask(params: MineruParseRequest): Promise<string> {
    console.log(`[MinerU] 提交异步解析任务: ${params.filePath}`);

    if (!fs.existsSync(params.filePath)) {
      throw new Error(`文件不存在: ${params.filePath}`);
    }

    const fileBuffer = fs.readFileSync(params.filePath);
    const fileName = params.fileName || path.basename(params.filePath);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: params.mimeType });
    formData.append("files", blob, fileName);
    formData.append("lang_list", "ch");
    formData.append("backend", this.backend);
    formData.append("parse_method", "auto");
    formData.append("table_enable", "true");
    formData.append("formula_enable", "true");
    formData.append("return_md", "true");
    formData.append("return_middle_json", "true");
    formData.append("return_content_list", "true");

    const returnImages = params.options?.returnImages ?? false;
    formData.append("return_images", returnImages ? "true" : "false");
    formData.append("response_format_zip", "false");

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/tasks`, {
        method: "POST",
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        body: formData,
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const causeMsg =
        e instanceof Error && "cause" in e && e.cause instanceof Error
          ? e.cause.message
          : "";
      const looksLikeNetwork =
        msg === "fetch failed" ||
        causeMsg.includes("ECONNREFUSED") ||
        causeMsg.includes("ENOTFOUND") ||
        causeMsg.includes("ETIMEDOUT");
      const hint = looksLikeNetwork
        ? "（通常为 MinerU 未启动或 MINERU_API_URL 不可达，请启动 MinerU 并核对环境变量，默认 http://127.0.0.1:8000）"
        : "";
      const inner = causeMsg ? `: ${causeMsg}` : msg ? `: ${msg}` : "";
      throw new Error(`无法连接 MinerU ${this.baseUrl}/tasks${inner}${hint}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`提交任务失败: ${response.status} ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();
    console.log(`[MinerU] 任务已提交, taskId: ${result.task_id}`);
    return result.task_id;
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
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
    });

    if (!response.ok) {
      throw new Error(`获取状态失败: ${response.status}`);
    }

    const result = await response.json();

    // MinerU 没有 progress 字段，需要估算
    let progress: number | undefined;
    if (result.status === "completed") {
      progress = 100;
    } else if (result.status === "pending") {
      progress = 0;
    } else if (result.status === "processing") {
      const startedAt = new Date(result.started_at || result.created_at);
      const elapsed = (Date.now() - startedAt.getTime()) / 1000;
      progress = Math.min(99, Math.floor((elapsed / 600) * 100));
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
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
    });

    if (!response.ok) {
      throw new Error(`获取结果失败: ${response.status}`);
    }

    const apiResult = await response.json();

    if (apiResult.status === "pending" || apiResult.status === "processing") {
      return {
        taskId,
        status: apiResult.status,
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
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 转换 API 响应为内部格式
   *
   * MinerU 返回格式:
   * {
   *   "results": {
   *     "文件名": {
   *       "md_content": "...",
   *       "content_list": [...]
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
    const images: MineruParseResult["images"] = [];

    console.log("[MinerU] 开始转换 API 响应");

    // 提取文件结果
    let resultData: Record<string, unknown> = apiResult;
    let markdown = "";

    if (apiResult.results && typeof apiResult.results === "object") {
      const results = apiResult.results as Record<string, Record<string, unknown>>;
      const fileNames = Object.keys(results);
      if (fileNames.length > 0) {
        resultData = results[fileNames[0]];
      }
    }

    // 提取 markdown 内容
    markdown = (resultData.md_content as string) || (apiResult.md_content as string) || "";

    // 解析 images 数据（MinerU return_images=true 时返回，可能是 JSON 字符串）
    let imagesData: Record<string, string> | undefined;
    const imagesRaw = resultData.images ?? apiResult.images;
    if (imagesRaw) {
      if (typeof imagesRaw === "string") {
        try {
          imagesData = JSON.parse(imagesRaw);
        } catch {
          console.warn("[MinerU] images JSON 解析失败");
        }
      } else if (typeof imagesRaw === "object" && !Array.isArray(imagesRaw)) {
        imagesData = imagesRaw as Record<string, string>;
      }
    }

    if (imagesData && Object.keys(imagesData).length > 0) {
      console.log(`[MinerU] 提取到 ${Object.keys(imagesData).length} 张图片`);
    }

    // 解析 content_list（MinerU 返回的是 JSON 字符串，需要解析）
    const contentListRaw = resultData.content_list ?? apiResult.content_list;
    let contentList: Array<Record<string, unknown>> | null = null;

    if (contentListRaw) {
      if (typeof contentListRaw === "string") {
        try {
          contentList = JSON.parse(contentListRaw);
        } catch {
          console.warn("[MinerU] content_list JSON 解析失败，跳过区块提取");
        }
      } else if (Array.isArray(contentListRaw)) {
        contentList = contentListRaw;
      }
    }

    if (contentList && contentList.length > 0) {
      console.log("[MinerU] 使用 content_list 提取区块, 数量:", contentList.length);

      let blockIndex = 0;
      let maxPage = 0;

      for (const item of contentList) {
        const type = (item.type as string) || "text";

        // 跳过 page_number 等元数据类型
        if (type === "page_number") {
          continue;
        }

        const pageNumber = ((item.page_idx as number) || 0) + 1;
        const bboxRaw = item.bbox as [number, number, number, number] | undefined;

        maxPage = Math.max(maxPage, pageNumber);

        let bbox: { x0: number; y0: number; x1: number; y1: number } | null = null;
        if (bboxRaw && bboxRaw.length >= 4) {
          bbox = { x0: bboxRaw[0], y0: bboxRaw[1], x1: bboxRaw[2], y1: bboxRaw[3] };
        }

        let content = "";
        let imagePath: string | undefined;

        if (type === "image") {
          imagePath = (item.img_path as string)?.replace("images/", "");
          content = (item.content as string) || "";
          if (imagePath) {
            images.push({
              id: `img_${blockIndex}`,
              pageNumber,
              bbox: bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
              imagePath,
            });
          }
        } else if (type === "table") {
          imagePath = (item.img_path as string)?.replace("images/", "");
          content = (item.table_body as string) || "";
        } else if (type === "text") {
          content = (item.text as string) || "";
        }

        blocks.push({
          id: `block_${blockIndex}`,
          pageNumber,
          index: blockIndex,
          type: this.normalizeBlockType(type),
          content,
          bbox,
          level: (item.text_level as number) || undefined,
          imagePath,
        });

        blockIndex++;
      }

      console.log(`[MinerU] 转换完成: ${blocks.length} 个区块, ${images.length} 个图片, ${maxPage} 页`);
    }

    // 提取标题
    const titleBlock = blocks.find((b) => b.type === "title");
    const sections = this.extractSections(blocks);

    return {
      taskId: taskId || `parse_${Date.now()}`,
      status: "completed",
      totalPages: blocks.length > 0 ? Math.max(...blocks.map(b => b.pageNumber)) : 1,
      fullText: markdown,
      markdown,
      structured: {
        title: titleBlock?.content || params.fileName || "未知标题",
        sections,
      },
      blocks,
      tables: [],
      images,
      imagesData,
      equations: [],
      raw: { status: "success", ...apiResult } as MineruApiResponse,
    };
  }

  /**
   * 标准化区块类型
   */
  private normalizeBlockType(type: string): MineruBlockType {
    const typeMap: Record<string, MineruBlockType> = {
      "text": "text",
      "title": "title",
      "paragraph": "paragraph",
      "table": "table",
      "image": "image",
      "equation": "equation",
      "list": "list",
      "footer": "footer",
      "footnote": "footnote",
      "code": "code",
    };
    return typeMap[type.toLowerCase()] || "text";
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
          level: block.level,
        });
      } else if (
        (block.type === "text" || block.type === "paragraph") &&
        sections.length > 0 &&
        block.content
      ) {
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
}

export const mineruClient = new MineruClient();
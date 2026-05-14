// 图片风险分析服务
// 调用 imageReviewAgent 分析图片内容，识别潜在风险
import fs from "fs";
import path from "path";
import { db } from "@/lib/db/client";
import { imageRiskAnalysis } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { imageReviewAgent } from "@/mastra/agents/image-review-agent";
import { getImagesDir } from "@/lib/storage/image-storage";

// 并发控制配置
const MAX_CONCURRENT = 2; // 最大并发数
const REQUEST_DELAY_MS = 1000; // 每次请求之间的延迟（毫秒）

/**
 * 图片风险分析结果（从 Agent 返回的 JSON）
 */
interface ImageRiskResult {
  hasRisk: boolean;
  riskType?: string;
  riskText?: string;
  confidence?: number;
}

/**
 * 并发限制器 - 控制同时执行的任务数量
 */
class ConcurrencyLimiter {
  private running: number = 0;
  private queue: Array<() => Promise<void>> = [];
  private maxConcurrent: number;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    // 如果达到最大并发数，等待
    while (this.running >= this.maxConcurrent) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.running++;
    try {
      const result = await task();
      return result;
    } finally {
      this.running--;
      // 添加延迟，避免请求过快
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }
  }
}

const limiter = new ConcurrencyLimiter(MAX_CONCURRENT);

/**
 * 分析单个图片
 */
export async function analyzeSingleImage(image: {
  id: string;
  documentId: string;
  imagePath: string;
}): Promise<{ success: boolean; hasRisk: boolean; error?: string }> {
  try {
    // 更新状态为 processing
    await db
      .update(imageRiskAnalysis)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(imageRiskAnalysis.id, image.id));

    // 读取图片文件（路径格式: {documentId}/{filename}）
    const fullPath = path.join(getImagesDir(), image.documentId, image.imagePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`[ImageAnalyzer] 图片文件不存在: ${fullPath}`);
      await db
        .update(imageRiskAnalysis)
        .set({
          status: "failed",
          error: "图片文件不存在",
          updatedAt: new Date(),
        })
        .where(eq(imageRiskAnalysis.id, image.id));
      return { success: false, hasRisk: false, error: "图片文件不存在" };
    }

    const imageBuffer = fs.readFileSync(fullPath);
    const mimeType = getMimeType(fullPath);

    console.log(
      `[ImageAnalyzer] 分析图片: ${image.imagePath} (${imageBuffer.length} bytes)`
    );

    // 调用 Agent 分析
    const agentResult = await imageReviewAgent.generate([
      {
        role: "user",
        content: [
          { type: "image", image: imageBuffer, mimeType },
          {
            type: "text",
            text: "分析这张图片是否存在招标审查风险，输出结构化JSON结果。",
          },
        ],
      },
    ]);

    // 解析 JSON 结果
    const textContent = agentResult.text;
    const jsonResult = parseAgentResponse(textContent);

    if (!jsonResult) {
      console.error(`[ImageAnalyzer] 无法解析 Agent 返回结果`);
      await db
        .update(imageRiskAnalysis)
        .set({
          status: "failed",
          error: "无法解析分析结果",
          rawResponse: { raw: textContent },
          updatedAt: new Date(),
        })
        .where(eq(imageRiskAnalysis.id, image.id));
      return { success: false, hasRisk: false, error: "无法解析分析结果" };
    }

    // 更新分析结果
    await db
      .update(imageRiskAnalysis)
      .set({
        status: "completed",
        hasRisk: jsonResult.hasRisk,
        riskType: jsonResult.riskType,
        riskText: jsonResult.riskText,
        confidence: jsonResult.confidence?.toString(),
        rawResponse: jsonResult,
        updatedAt: new Date(),
      })
      .where(eq(imageRiskAnalysis.id, image.id));

    console.log(
      `[ImageAnalyzer] 图片分析完成: ${image.imagePath}, 有风险: ${jsonResult.hasRisk}`
    );

    return { success: true, hasRisk: jsonResult.hasRisk };
  } catch (error) {
    console.error(`[ImageAnalyzer] 分析图片失败:`, error);
    await db
      .update(imageRiskAnalysis)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : "分析失败",
        updatedAt: new Date(),
      })
      .where(eq(imageRiskAnalysis.id, image.id));
    return {
      success: false,
      hasRisk: false,
      error: error instanceof Error ? error.message : "分析失败",
    };
  }
}

/**
 * 分析单个文档的所有待处理图片（带并发控制）
 */
export async function analyzeDocumentImages(documentId: string): Promise<{
  analyzed: number;
  hasRisk: number;
  errors: number;
}> {
  console.log(`[ImageAnalyzer] 开始分析文档 ${documentId} 的图片`);

  const result = {
    analyzed: 0,
    hasRisk: 0,
    errors: 0,
  };

  // 查询 pending 状态的图片记录
  const pendingImages = await db.query.imageRiskAnalysis.findMany({
    where: and(
      eq(imageRiskAnalysis.documentId, documentId),
      eq(imageRiskAnalysis.status, "pending")
    ),
  });

  if (pendingImages.length === 0) {
    console.log(`[ImageAnalyzer] 没有待处理的图片`);
    return result;
  }

  console.log(
    `[ImageAnalyzer] 发现 ${pendingImages.length} 张待分析图片，并发限制: ${MAX_CONCURRENT}`
  );

  // 使用并发限制器处理图片
  const promises = pendingImages.map((image) =>
    limiter.run(async () => {
      const result = await analyzeSingleImage({
        id: image.id,
        documentId: image.documentId,
        imagePath: image.imagePath,
      });
      return result;
    })
  );

  // 等待所有任务完成
  const results = await Promise.all(promises);

  // 统计结果
  for (const r of results) {
    if (r.success) {
      result.analyzed++;
      if (r.hasRisk) {
        result.hasRisk++;
      }
    } else {
      result.errors++;
    }
  }

  console.log(
    `[ImageAnalyzer] 文档 ${documentId} 分析完成: ${result.analyzed} 张分析, ${result.hasRisk} 张有风险, ${result.errors} 张失败`
  );

  return result;
}

/**
 * 分析所有待处理的图片（用于定时任务）
 */
export async function analyzeAllPendingImages(): Promise<{
  documents: number;
  analyzed: number;
  hasRisk: number;
  errors: number;
}> {
  console.log("[ImageAnalyzer] 开始分析所有待处理图片");

  // 查询有 pending 图片的文档
  const documentsWithPendingImages = await db.execute<{
    document_id: string;
    count: number;
  }>(
    `SELECT document_id, COUNT(*) as count
     FROM image_risk_analysis
     WHERE status = 'pending'
     GROUP BY document_id`
  );

  if (documentsWithPendingImages.length === 0) {
    console.log("[ImageAnalyzer] 没有待处理的图片");
    return { documents: 0, analyzed: 0, hasRisk: 0, errors: 0 };
  }

  console.log(
    `[ImageAnalyzer] 发现 ${documentsWithPendingImages.length} 个文档有待处理图片`
  );

  const totalResult = {
    documents: documentsWithPendingImages.length,
    analyzed: 0,
    hasRisk: 0,
    errors: 0,
  };

  // 逐个文档处理（避免同时处理多个文档导致过多并发）
  for (const row of documentsWithPendingImages) {
    const docResult = await analyzeDocumentImages(row.document_id);
    totalResult.analyzed += docResult.analyzed;
    totalResult.hasRisk += docResult.hasRisk;
    totalResult.errors += docResult.errors;

    // 文档之间添加延迟
    if (docResult.analyzed > 0) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }
  }

  console.log(
    `[ImageAnalyzer] 全部分析完成: ${totalResult.documents} 个文档, ${totalResult.analyzed} 张分析, ${totalResult.hasRisk} 张有风险, ${totalResult.errors} 张失败`
  );

  return totalResult;
}

/**
 * 解析 Agent 返回的 JSON 结果
 */
function parseAgentResponse(text: string): ImageRiskResult | null {
  try {
    // 尝试直接解析 JSON
    const json = JSON.parse(text);
    return {
      hasRisk: json.hasRisk ?? false,
      riskType: json.riskType,
      riskText: json.riskText,
      confidence: json.confidence,
    };
  } catch {
    // 尝试从文本中提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const json = JSON.parse(jsonMatch[0]);
        return {
          hasRisk: json.hasRisk ?? false,
          riskType: json.riskType,
          riskText: json.riskText,
          confidence: json.confidence,
        };
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 获取图片 MIME 类型
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    default:
      return "image/jpeg";
  }
}
import { db } from "@/lib/db/client";
import {
  documents,
  documentParsedResults,
  documentBlocks,
} from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { mineruClient } from "@/lib/ai/mineru-client";
import { saveImages } from "@/lib/storage/image-storage";
import type { MineruParseResult } from "@/types/mineru";

/**
 * 文档解析状态检查器
 *
 * 定期检查 processing 状态的文档，查询 MinerU 任务状态并更新数据库
 */

const TIMEOUT_MINUTES = 30;

type CheckResult = {
  checked: number;
  completed: number;  // MinerU 完成，成功存储结果
  failed: number;     // MinerU 失败或超时
  skipped: number;    // 仍在处理中
};

type TaskStatus = {
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
  error?: string;
};

/**
 * 检查所有 processing 状态的文档
 */
export async function checkProcessingDocuments(): Promise<CheckResult> {
  console.log("[Checker] 开始检查 processing 文档...");

  const result: CheckResult = {
    checked: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  // 查询所有 processing 状态且有 taskId 的文档
  const processingDocs = await db.query.documents.findMany({
    where: and(
      eq(documents.parseStatus, "processing"),
      isNotNull(documents.mineruTaskId)
    ),
    orderBy: (documents, { desc }) => [desc(documents.taskSubmittedAt)],
  });

  console.log(`[Checker] 发现 ${processingDocs.length} 个待检查文档`);
  result.checked = processingDocs.length;

  for (const doc of processingDocs) {
    const taskResult = await checkSingleDocument(doc);

    switch (taskResult) {
      case "completed":
        result.completed++;
        break;
      case "failed":
        result.failed++;
        break;
      case "skipped":
        result.skipped++;
        break;
    }
  }

  console.log(
    `[Checker] 检查完成: ${result.checked}个检查, ${result.completed}个完成, ${result.failed}个失败, ${result.skipped}个跳过`
  );

  return result;
}

/**
 * 检查单个文档的状态
 *
 * 返回: completed | failed | skipped
 */
async function checkSingleDocument(doc: {
  id: string;
  name: string;
  mineruTaskId: string | null;
  taskSubmittedAt: Date | null;
  taskProgress: number | null;
}): Promise<"completed" | "failed" | "skipped"> {
  const taskId = doc.mineruTaskId!;
  console.log(`[Checker] 检查文档: ${doc.name} (${doc.id}), taskId: ${taskId}`);

  try {
    // 1. 查询 MinerU 任务状态
    const taskStatus = await mineruClient.getTaskStatus(taskId);
    console.log(`[Checker] MinerU 状态: ${taskStatus.status}, 进度: ${taskStatus.progress ?? 0}%`);

    // 2. 只在进度变化时更新数据库
    const currentProgress = doc.taskProgress ?? 0;
    const newProgress = taskStatus.progress ?? 0;

    if (newProgress !== currentProgress) {
      await db
        .update(documents)
        .set({
          taskProgress: newProgress,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, doc.id));
      console.log(`[Checker] 进度更新: ${currentProgress}% -> ${newProgress}%`);
    }

    // 3. 处理不同状态
    switch (taskStatus.status) {
      case "completed":
        return await handleCompleted(doc, taskId);

      case "failed":
        return await handleFailed(doc, taskStatus.error);

      case "pending":
        // 检查超时
        if (isTimeout(doc.taskSubmittedAt)) {
          return await handleTimeout(doc);
        }
        console.log(`[Checker] 任务 pending，等待处理`);
        return "skipped";

      case "processing":
        // 检查超时
        if (isTimeout(doc.taskSubmittedAt)) {
          return await handleTimeout(doc);
        }
        console.log(`[Checker] 任务 processing，下次继续检查`);
        return "skipped";

      default:
        console.log(`[Checker] 未知状态: ${taskStatus.status}`);
        return "skipped";
    }
  } catch (error) {
    return await handleError(doc, error);
  }
}

/**
 * 处理完成的任务
 */
async function handleCompleted(
  doc: { id: string; name: string },
  taskId: string
): Promise<"completed" | "failed" | "skipped"> {
  console.log(`[Checker] 任务完成，获取解析结果`);

  try {
    const parseResult = await mineruClient.getParseResult(taskId);

    // 检查结果是否有效
    if (parseResult.status === "pending" || parseResult.status === "processing") {
      console.log(`[Checker] 结果尚未就绪，状态: ${parseResult.status}`);
      return "skipped";
    }

    await storeParseResult(doc.id, parseResult);
    console.log(`[Checker] 解析结果已存储`);
    return "completed";
  } catch (error) {
    console.error(`[Checker] 获取解析结果失败:`, error);

    // 结果获取失败，标记为 failed
    await db
      .update(documents)
      .set({
        parseStatus: "failed",
        parseError: `获取解析结果失败: ${error instanceof Error ? error.message : "未知错误"}`,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, doc.id));

    return "failed";
  }
}

/**
 * 处理失败的任务
 */
async function handleFailed(
  doc: { id: string },
  error?: string
): Promise<"failed"> {
  console.log(`[Checker] MinerU 任务失败`);

  await db
    .update(documents)
    .set({
      parseStatus: "failed",
      parseError: error || "MinerU 解析失败",
      updatedAt: new Date(),
    })
    .where(eq(documents.id, doc.id));

  return "failed";
}

/**
 * 处理超时任务
 */
async function handleTimeout(doc: { id: string }): Promise<"failed"> {
  console.log(`[Checker] 任务超时，标记为 failed`);

  await db
    .update(documents)
    .set({
      parseStatus: "failed",
      parseError: `任务超时（超过 ${TIMEOUT_MINUTES} 分钟未完成）`,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, doc.id));

  return "failed";
}

/**
 * 处理检查过程中的错误
 */
async function handleError(
  doc: { id: string; taskSubmittedAt: Date | null },
  error: unknown
): Promise<"skipped" | "failed"> {
  console.error(`[Checker] 检查文档失败:`, error);

  // 网络错误/API 不可用 - 不立即标记失败，下次重试
  if (error instanceof TypeError || (error instanceof Error && error.message.includes("fetch"))) {
    console.log(`[Checker] MinerU 服务不可用，下次重试`);
    return "skipped";
  }

  // 获取状态失败 - 检查是否超时
  if (isTimeout(doc.taskSubmittedAt)) {
    return await handleTimeout(doc);
  }

  // 其他错误，下次重试
  console.log(`[Checker] 未知错误，下次重试`);
  return "skipped";
}

/**
 * 存储解析结果到数据库（使用事务）
 */
async function storeParseResult(
  documentId: string,
  parseResult: MineruParseResult
): Promise<void> {
  console.log(
    `[Checker] 存储结果: ${parseResult.totalPages} 页, ${parseResult.blocks.length} 区块`
  );

  // 1. 保存图片到文件系统（在事务外执行）
  let savedImages: Record<string, string> = {};
  if (parseResult.imagesData && Object.keys(parseResult.imagesData).length > 0) {
    console.log(`[Checker] 保存 ${Object.keys(parseResult.imagesData).length} 张图片`);
    savedImages = await saveImages(documentId, parseResult.imagesData);
  }

  // 2. 使用事务确保数据一致性
  await db.transaction(async (tx) => {
    // 检查是否已存在解析结果（防止重复插入）
    const existing = await tx.query.documentParsedResults.findFirst({
      where: eq(documentParsedResults.documentId, documentId),
    });

    if (existing) {
      console.log(`[Checker] 解析结果已存在，跳过插入`);
      return;
    }

    // 插入解析结果
    const [parsedResultRecord] = await tx
      .insert(documentParsedResults)
      .values({
        documentId,
        totalPages: parseResult.totalPages,
        fullText: parseResult.fullText,
        structuredContent: parseResult.structured,
        mineruRawData: parseResult.raw,
      })
      .returning();

    console.log(`[Checker] 解析结果 ID: ${parsedResultRecord.id}`);

    // 批量插入 blocks
    if (parseResult.blocks.length > 0) {
      const blocks = parseResult.blocks.map((block) => ({
        parsedResultId: parsedResultRecord.id,
        pageNumber: block.pageNumber,
        blockIndex: block.index,
        blockType: block.type,
        content: block.content,
        bbox: block.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
      }));

      // 每批 100 条
      const batchSize = 100;
      for (let i = 0; i < blocks.length; i += batchSize) {
        const batch = blocks.slice(i, i + batchSize);
        await tx.insert(documentBlocks).values(batch);
      }

      console.log(`[Checker] 已插入 ${blocks.length} 个区块`);
    }

    // 更新文档状态为 completed
    await tx
      .update(documents)
      .set({
        parseStatus: "completed",
        parsedAt: new Date(),
        taskProgress: 100,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    console.log(`[Checker] 文档状态已更新为 completed`);
  });
}

/**
 * 检查是否超时
 */
function isTimeout(taskSubmittedAt: Date | null): boolean {
  if (!taskSubmittedAt) return false;

  const elapsedMinutes = (Date.now() - taskSubmittedAt.getTime()) / (1000 * 60);
  return elapsedMinutes > TIMEOUT_MINUTES;
}
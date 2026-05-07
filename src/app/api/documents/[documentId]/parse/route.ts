import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import {
  documents,
  documentParsedResults,
  documentBlocks,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mineruClient } from "@/lib/ai/mineru-client";
import { saveImages } from "@/lib/storage/image-storage";
import fs from "fs";

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

/**
 * POST: 提交文档解析任务（异步）
 *
 * 提交异步解析任务到MinerU，立即返回taskId，不等待完成
 */
export async function POST(
  request: Request,
  context: RouteContext
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;

  try {
    // 获取文档信息
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });

    if (!doc) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    // 验证文件存在（关键！防止假数据）
    if (!fs.existsSync(doc.storagePath)) {
      console.error(`[Parse] 文件不存在: ${doc.storagePath}`);
      return NextResponse.json(
        { error: "文件不存在，请重新上传" },
        { status: 400 }
      );
    }

    // 检查状态
    if (doc.parseStatus === "completed") {
      return NextResponse.json(
        { error: "文档已解析，请查看解析结果" },
        { status: 400 }
      );
    }

    // processing状态 - 返回现有taskId
    if (doc.parseStatus === "processing") {
      return NextResponse.json({
        taskId: doc.mineruTaskId,
        status: "processing",
        progress: doc.taskProgress || 0,
        message: "文档正在解析中",
      });
    }

    // failed状态 - 清理旧解析结果
    if (doc.parseStatus === "failed") {
      console.log(`[Parse] 清理失败的解析结果: ${documentId}`);

      const oldResults = await db.query.documentParsedResults.findMany({
        where: eq(documentParsedResults.documentId, documentId),
      });

      for (const result of oldResults) {
        await db.delete(documentBlocks).where(eq(documentBlocks.parsedResultId, result.id));
        await db.delete(documentParsedResults).where(eq(documentParsedResults.id, result.id));
      }

      console.log(`[Parse] 已清理 ${oldResults.length} 条旧解析结果`);
    }

    // 更新状态为processing
    await db
      .update(documents)
      .set({
        parseStatus: "processing",
        taskProgress: 0,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    console.log(`[Parse] 提交解析任务: ${doc.name}, storagePath: ${doc.storagePath}`);

    // 提交MinerU异步任务
    const mineruTaskId = await mineruClient.submitParseTask({
      filePath: doc.storagePath,
      mimeType: doc.mimeType,
      fileName: doc.originalName,
      options: {
        returnImages: true, // 返回图片信息
      },
    });

    // 存储taskId
    await db
      .update(documents)
      .set({
        mineruTaskId: mineruTaskId,
        taskSubmittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    console.log(`[Parse] 任务已提交, taskId: ${mineruTaskId}`);

    // 立即返回（不等待完成）
    return NextResponse.json({
      taskId: mineruTaskId,
      status: "processing",
      progress: 0,
      message: "解析任务已提交，请轮询查询状态",
    });
  } catch (error) {
    console.error("[Parse] 提交任务失败:", error);

    // 更新状态为failed
    const errorMessage = error instanceof Error ? error.message : "提交任务失败";

    await db
      .update(documents)
      .set({
        parseStatus: "failed",
        parseError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json(
      { error: "提交解析任务失败", details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET: 查询文档解析状态和结果（支持轮询）
 *
 * processing状态时查询MinerU任务状态，完成时获取结果并存储
 */
export async function GET(
  request: Request,
  context: RouteContext
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;

  try {
    // 获取文档信息
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
      with: {
        parsedResult: {
          with: {
            blocks: true,
          },
        },
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    // processing状态 - 查询MinerU任务状态
    if (doc.parseStatus === "processing" && doc.mineruTaskId) {
      console.log(`[Parse] 检查任务状态: ${doc.mineruTaskId}`);

      try {
        // 查询MinerU任务状态
        const taskStatus = await mineruClient.getTaskStatus(doc.mineruTaskId);

        console.log(`[Parse] MinerU状态: ${taskStatus.status}, 进度: ${taskStatus.progress || 0}%`);

        // 更新进度
        await db
          .update(documents)
          .set({
            taskProgress: taskStatus.progress || 0,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId));

        // 完成时获取结果
        if (taskStatus.status === "completed") {
          console.log(`[Parse] 任务完成，获取结果: ${doc.mineruTaskId}`);

          // 获取结果
          const parseResult = await mineruClient.getParseResult(doc.mineruTaskId);

          console.log(`[Parse] 结果获取完成: ${parseResult.totalPages}页, ${parseResult.blocks.length}区块`);

          // 保存图片到文件系统
          if (parseResult.imagesData && Object.keys(parseResult.imagesData).length > 0) {
            console.log(`[Parse] 保存 ${Object.keys(parseResult.imagesData).length} 张图片`);
            await saveImages(documentId, parseResult.imagesData);
          }

          // 存储解析结果
          const [parsedResultRecord] = await db
            .insert(documentParsedResults)
            .values({
              documentId,
              totalPages: parseResult.totalPages,
              fullText: parseResult.fullText,
              structuredContent: parseResult.structured,
              mineruRawData: parseResult.raw,
            })
            .returning();

          // 存储blocks
          const blocks = parseResult.blocks.map((block) => ({
            parsedResultId: parsedResultRecord.id,
            pageNumber: block.pageNumber,
            blockIndex: block.index,
            blockType: block.type,
            content: block.content,
            bbox: block.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
          }));

          if (blocks.length > 0) {
            const batchSize = 100;
            for (let i = 0; i < blocks.length; i += batchSize) {
              const batch = blocks.slice(i, i + batchSize);
              await db.insert(documentBlocks).values(batch);
              console.log(`[Parse] 已插入批次 ${Math.floor(i / batchSize) + 1}`);
            }
          }

          // 更新完成状态
          await db
            .update(documents)
            .set({
              parseStatus: "completed",
              parsedAt: new Date(),
              taskProgress: 100,
              updatedAt: new Date(),
            })
            .where(eq(documents.id, documentId));

          console.log(`[Parse] 结果存储完成`);

          // 返回完成结果
          return NextResponse.json({
            document: {
              id: doc.id,
              parseStatus: "completed",
              parsedAt: new Date(),
              taskProgress: 100,
            },
            parsedResult: {
              id: parsedResultRecord.id,
              totalPages: parseResult.totalPages,
              fullText: parseResult.fullText,
              blocksCount: parseResult.blocks.length,
              blocks: blocks.slice(0, 100), // 返回前100个blocks作为preview
            },
            taskCompleted: true,
          });
        }

        // 失败状态
        if (taskStatus.status === "failed") {
          console.log(`[Parse] 任务失败`);

          await db
            .update(documents)
            .set({
              parseStatus: "failed",
              parseError: taskStatus.error || "MinerU解析失败",
              updatedAt: new Date(),
            })
            .where(eq(documents.id, documentId));

          return NextResponse.json({
            document: {
              id: doc.id,
              parseStatus: "failed",
              parseError: taskStatus.error || "MinerU解析失败",
            },
            taskCompleted: false,
          });
        }

        // 返回processing状态
        return NextResponse.json({
          document: {
            id: doc.id,
            parseStatus: "processing",
            taskProgress: taskStatus.progress || 0,
            mineruTaskId: doc.mineruTaskId,
          },
          parsedResult: null,
          taskCompleted: false,
        });

      } catch (mineruError) {
        console.error("[Parse] 查询MinerU状态失败:", mineruError);

        // MinerU不可用 - 返回缓存状态
        return NextResponse.json({
          document: {
            id: doc.id,
            parseStatus: "processing",
            taskProgress: doc.taskProgress || 0,
            mineruTaskId: doc.mineruTaskId,
            warning: "无法连接MinerU服务，请稍后再试",
          },
          parsedResult: null,
          taskCompleted: false,
        });
      }
    }

    // 其他状态直接返回
    return NextResponse.json({
      document: {
        id: doc.id,
        name: doc.name,
        originalName: doc.originalName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        docType: doc.docType,
        parseStatus: doc.parseStatus,
        parseError: doc.parseError,
        parsedAt: doc.parsedAt,
        taskProgress: doc.taskProgress || 0,
      },
      parsedResult: doc.parsedResult
        ? {
            id: doc.parsedResult.id,
            totalPages: doc.parsedResult.totalPages,
            fullText: doc.parsedResult.fullText,
            structuredContent: doc.parsedResult.structuredContent,
            blocks: doc.parsedResult.blocks.slice(0, 100),
          }
        : null,
      taskCompleted: doc.parseStatus === "completed",
    });
  } catch (error) {
    console.error("[Parse] 获取状态失败:", error);
    return NextResponse.json(
      { error: "获取解析状态失败" },
      { status: 500 }
    );
  }
}
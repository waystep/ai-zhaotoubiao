// 文档读取工具 - 根据projectId和docType查询文档及其解析blocks
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { documents, documentParsedResults, documentBlocks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const documentReaderTool = createTool({
  id: "document-reader",
  description: "读取项目文档及其解析区块信息，支持按projectId和docType查询",
  inputSchema: z.object({
    projectId: z.string().uuid().describe("项目ID"),
    docType: z.enum(["tender_doc", "legal_doc", "bid_doc"]).optional().describe("文档类型（可选）"),
    documentId: z.string().uuid().optional().describe("特定文档ID（可选，优先级高于docType）"),
  }),
  outputSchema: z.object({
    documents: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        docType: z.enum(["tender_doc", "legal_doc", "bid_doc", "review_report"]),
        parseStatus: z.enum(["pending", "processing", "completed", "failed"]),
        totalPages: z.number().int().nonnegative(), // 允许0，某些文档可能没有解析结果
        blocks: z.array(
          z.object({
            id: z.string().uuid(),
            pageNumber: z.number().int().positive(),
            blockIndex: z.number().int().nonnegative(),
            blockType: z.string().optional(),
            content: z.string(),
            bbox: z
              .object({
                x0: z.number(),
                y0: z.number(),
                x1: z.number(),
                y1: z.number(),
              })
              .optional(),
          })
        ),
      })
    ),
    summary: z.string().optional(),
  }),
  execute: async ({ projectId, docType, documentId }) => {
    try {
      // 查询条件构建
      let whereClause;
      if (documentId) {
        // 查询特定文档
        whereClause = and(eq(documents.projectId, projectId), eq(documents.id, documentId));
      } else if (docType) {
        // 按docType过滤
        whereClause = and(eq(documents.projectId, projectId), eq(documents.docType, docType));
      } else {
        // 查询项目所有文档
        whereClause = eq(documents.projectId, projectId);
      }

      // 查询文档及其解析结果
      const docs = await db.query.documents.findMany({
        where: whereClause,
        with: {
          parsedResult: {
            with: {
              blocks: {
                orderBy: [documentBlocks.pageNumber, documentBlocks.blockIndex],
              },
            },
          },
        },
      });

      // 格式化输出
      const formattedDocs = docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        docType: doc.docType,
        parseStatus: doc.parseStatus || "pending",
        totalPages: doc.parsedResult?.totalPages || 0,
        blocks:
          doc.parsedResult?.blocks.map((b) => ({
            id: b.id,
            pageNumber: b.pageNumber,
            blockIndex: b.blockIndex,
            blockType: b.blockType || undefined,
            content: b.content,
            bbox: (b.bbox as { x0: number; y0: number; x1: number; y1: number }) || undefined,
          })) || [],
      }));

      // 生成摘要信息
      const summary = `查询到 ${formattedDocs.length} 个文档，共 ${formattedDocs.reduce((sum, d) => sum + d.blocks.length, 0)} 个blocks`;

      return {
        documents: formattedDocs,
        summary,
      };
    } catch (error) {
      console.error("文档读取失败:", error);
      // 返回空但有效的结构，避免workflow出现undefined错误
      return {
        documents: [],
        summary: `文档读取失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});
// 文档读取工具 — 精简版，只返回提取所需的字段
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { documents, documentBlocks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const documentReaderTool = createTool({
  id: "document-reader",
  description: "读取项目文档及其解析区块。支持分页参数（startPage/endPage）用于大文档分批审查。每个 block 返回提取所需的字段：id, pageNumber, blockIndex, content。",
  inputSchema: z.object({
    projectId: z.string().uuid().describe("项目ID"),
    documentId: z.string().uuid().optional().describe("特定文档ID"),
    startPage: z.number().int().positive().optional().describe("起始页码"),
    endPage: z.number().int().positive().optional().describe("结束页码"),
  }),
  outputSchema: z.object({
    documents: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        docType: z.string(),
        totalPages: z.number().int().nonnegative(),
        blocks: z.array(
          z.object({
            id: z.string().uuid(),
            pageNumber: z.number().int().positive(),
            blockIndex: z.number().int().nonnegative(),
            content: z.string(),
          })
        ),
      })
    ),
    blockCount: z.number().int().nonnegative(),
    summary: z.string().optional(),
  }),
  execute: async ({ projectId, documentId, startPage, endPage }) => {
    try {
      const whereClause = documentId
        ? and(eq(documents.projectId, projectId), eq(documents.id, documentId))
        : eq(documents.projectId, projectId);

      const docs = await db.query.documents.findMany({
        where: whereClause,
        with: {
          parsedResult: {
            with: { blocks: { orderBy: [documentBlocks.pageNumber, documentBlocks.blockIndex] } },
          },
        },
      });

      let totalBlockCount = 0;

      const formattedDocs = docs.map((doc) => {
        let blocks = doc.parsedResult?.blocks || [];
        const totalPages = doc.parsedResult?.totalPages || 0;

        if (startPage !== undefined || endPage !== undefined) {
          blocks = blocks.filter((b) => {
            if (startPage !== undefined && b.pageNumber < startPage) return false;
            if (endPage !== undefined && b.pageNumber > endPage) return false;
            return true;
          });
        }

        totalBlockCount += blocks.length;

        return {
          id: doc.id,
          name: doc.name,
          docType: doc.docType,
          totalPages,
          blocks: blocks.map((b) => ({
            id: b.id,
            pageNumber: b.pageNumber,
            blockIndex: b.blockIndex,
            content: b.content,
          })),
        };
      });

      const pageRangeStr =
        startPage !== undefined || endPage !== undefined
          ? `（页${startPage || 1}-${endPage || "末"}）`
          : "";
      const summary = `${formattedDocs.length} 个文档${pageRangeStr}，共 ${totalBlockCount} 个 blocks`;

      return { documents: formattedDocs, blockCount: totalBlockCount, summary };
    } catch (error) {
      console.error("文档读取失败:", error);
      return {
        documents: [],
        blockCount: 0,
        summary: `读取失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});

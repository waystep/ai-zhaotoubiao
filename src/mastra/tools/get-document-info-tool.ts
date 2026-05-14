// 获取文档信息工具 - 用于获取文档的基本信息（名称、类型、提取状态等）
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const getDocumentInfoTool = createTool({
  id: "get-document-info",
  description: "获取文档的基本信息，包括名称、类型、解析状态、提取状态、审查项数量、响应项数量等。用于了解文档处理进度。",
  inputSchema: z.object({
    documentId: z.string().uuid().optional().describe("文档ID（可选，如果不提供则获取项目所有文档）"),
    projectId: z.string().uuid().optional().describe("项目ID（可选，与documentId二选一）"),
    docType: z.string().optional().describe("文档类型筛选（可选，如：tender_doc/legal_doc/bid_doc）"),
    extractionStatus: z.string().optional().describe("提取状态筛选（可选，如：pending/processing/completed/failed）"),
  }),
  outputSchema: z.object({
    documents: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string().describe("文档名称"),
        originalName: z.string().describe("原始文件名"),
        docType: z.string().describe("文档类型"),
        fileSize: z.number().describe("文件大小（字节）"),
        mimeType: z.string().describe("文件MIME类型"),
        parseStatus: z.string().describe("解析状态"),
        extractionStatus: z.string().optional().describe("提取状态"),
        extractedAt: z.string().optional().nullable().describe("提取完成时间"),
        extractionItemsCount: z.number().optional().describe("审查项数量"),
        extractionError: z.string().optional().nullable().describe("提取错误信息"),
        createdAt: z.string().describe("创建时间"),
      })
    ),
    total: z.number().int().nonnegative().describe("文档总数"),
    summary: z.string().optional().describe("摘要信息"),
    extractionStats: z.object({
      pending: z.number().optional(),
      processing: z.number().optional(),
      completed: z.number().optional(),
      failed: z.number().optional(),
    }).optional().describe("提取状态统计"),
  }),
  execute: async ({ documentId, projectId, docType, extractionStatus }) => {
    try {
      const whereConditions = [];

      if (documentId) whereConditions.push(eq(documents.id, documentId));
      if (projectId) whereConditions.push(eq(documents.projectId, projectId));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (docType) whereConditions.push(eq(documents.docType, docType as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (extractionStatus) whereConditions.push(eq(documents.extractionStatus, extractionStatus as any));

      const docs = await db.query.documents.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        orderBy: [documents.createdAt],
      });

      // 统计提取状态分布
      const extractionStats = {
        pending: docs.filter(d => d.extractionStatus === "pending").length,
        processing: docs.filter(d => d.extractionStatus === "processing").length,
        completed: docs.filter(d => d.extractionStatus === "completed").length,
        failed: docs.filter(d => d.extractionStatus === "failed").length,
      };

      const summary = `获取到 ${docs.length} 个文档，其中 ${extractionStats.completed} 个已完成提取，${extractionStats.pending} 个待提取，${extractionStats.failed} 个提取失败`;

      return {
        documents: docs.map(doc => ({
          id: doc.id,
          name: doc.name,
          originalName: doc.originalName,
          docType: doc.docType,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          parseStatus: doc.parseStatus || "pending",
          extractionStatus: doc.extractionStatus || "pending",
          extractedAt: doc.extractedAt ? doc.extractedAt.toISOString() : undefined,
          extractionItemsCount: doc.extractionItemsCount || 0,
          extractionError: doc.extractionError || undefined,
          createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
        })),
        total: docs.length,
        summary,
        extractionStats,
      };
    } catch (error) {
      console.error("获取文档信息失败:", error);
      return {
        documents: [],
        total: 0,
        summary: `获取文档信息失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});
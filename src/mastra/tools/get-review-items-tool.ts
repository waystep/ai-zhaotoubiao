// 获取审查项工具 - 查询统一的 extractionItems 表
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { extractionItems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const getReviewItemsTool = createTool({
  id: "get-review-items",
  description: "获取项目的审查项列表，用于审查投标文件是否合规。审查项按 section（技术标/商务标）和 title（完整性/关键信息一致性/质量目标等）组织。",
  inputSchema: z.object({
    projectId: z.string().uuid().describe("项目ID"),
    documentId: z.string().uuid().optional().describe("文档ID（可选）"),
    section: z.enum(["技术标", "商务标"]).optional().describe("标段筛选"),
    title: z.string().optional().describe("审查项类型筛选（如：完整性、关键信息一致性等）"),
  }),
  outputSchema: z.object({
    reviewItems: z.array(
      z.object({
        id: z.string().uuid(),
        title: z.string().describe("审查项类型"),
        checkpoint: z.string().describe("审查判定标准"),
        section: z.string().optional().describe("标段"),
        consequence: z.number().optional().describe("后果权重"),
        location: z.any().describe("原文定位"),
        documentName: z.string().optional().describe("来源文档名称"),
      })
    ),
    total: z.number().int().nonnegative(),
    summary: z.string().optional(),
  }),
  execute: async ({ projectId, documentId, section, title }) => {
    try {
      const whereConditions = [eq(extractionItems.projectId, projectId)];

      if (documentId) whereConditions.push(eq(extractionItems.documentId, documentId));
      if (section) whereConditions.push(eq(extractionItems.section, section));
      if (title) whereConditions.push(eq(extractionItems.title, title));

      const items = await db.query.extractionItems.findMany({
        where: and(...whereConditions),
        orderBy: (fields, { asc }) => [asc(fields.createdAt)],
        with: {
          document: {
            columns: { id: true, name: true, docType: true },
          },
        },
      });

      const summary = `获取到 ${items.length} 个审查项`;

      return {
        reviewItems: items.map((item) => ({
          id: item.id,
          title: item.title || "unknown",
          checkpoint: item.checkpoint || "",
          section: item.section || undefined,
          consequence: item.consequence ? Number(item.consequence) : undefined,
          location: item.location || {},
          documentName: item.document?.name || undefined,
        })),
        total: items.length,
        summary,
      };
    } catch (error) {
      console.error("获取审查项失败:", error);
      return {
        reviewItems: [],
        total: 0,
        summary: `获取审查项失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});

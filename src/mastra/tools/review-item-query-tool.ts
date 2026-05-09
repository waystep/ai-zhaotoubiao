// 审查项查询工具 - 查询已有的审查项
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { reviewItems } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export const reviewItemQueryTool = createTool({
  id: "review-item-query",
  description: "查询已有的审查项，支持按项目、文档、类型筛选",
  inputSchema: z.object({
    projectId: z.string().uuid().optional().describe("项目ID"),
    documentId: z.string().uuid().optional().describe("文档ID"),
    itemType: z.string().optional().describe("审查项类型（文本类型，支持任意值）"),
    consequence: z.string().optional().describe("不满足后果筛选（如：废标、违规等）"),
    itemIds: z.array(z.string().uuid()).optional().describe("指定审查项ID列表"),
    includeUnverified: z.boolean().optional().describe("是否包含未验证项（默认false）"),
  }),
  outputSchema: z.object({
    reviewItems: z.array(
      z.object({
        id: z.string().uuid(),
        projectId: z.string().uuid(),
        documentId: z.string().uuid(),
        itemType: z.string(),
        itemNo: z.string().optional(),
        title: z.string(),
        description: z.string(),
        location: z.any(),
        requirements: z.any(),
        consequence: z.string().optional(),
        legalReference: z.string().optional(),
        extractionConfidence: z.number().optional(),
        isVerified: z.boolean(),
        createdAt: z.date().optional(),
      })
    ),
    total: z.number().int().nonnegative(),
    summary: z.string().optional(),
  }),
  execute: async ({ projectId, documentId, itemType, consequence, itemIds, includeUnverified }) => {
    try {
      const whereConditions = [];

      if (projectId) whereConditions.push(eq(reviewItems.projectId, projectId));
      if (documentId) whereConditions.push(eq(reviewItems.documentId, documentId));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (itemType) whereConditions.push(eq(reviewItems.itemType, itemType as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (consequence) whereConditions.push(eq(reviewItems.consequence, consequence as any));
      if (itemIds && itemIds.length > 0) whereConditions.push(inArray(reviewItems.id, itemIds));
      if (!includeUnverified) whereConditions.push(eq(reviewItems.isVerified, true));

      const items = await db.query.reviewItems.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        orderBy: [reviewItems.createdAt],
        with: {
          document: {
            columns: {
              id: true,
              name: true,
              docType: true,
            },
          },
          sourceBlock: {
            columns: {
              id: true,
              pageNumber: true,
              blockIndex: true,
              content: true,
            },
          },
        },
      });

      const summary = `查询到 ${items.length} 个审查项`;

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reviewItems: items.map((item: any) => ({
          id: item.id,
          projectId: item.projectId,
          documentId: item.documentId,
          itemType: item.itemType || "unknown",
          itemNo: item.itemNo || undefined,
          title: item.title || "",
          description: item.description || "",
          location: item.location || {},
          requirements: item.requirements || {},
          consequence: item.consequence || undefined,
          legalReference: item.legalReference || undefined,
          extractionConfidence: item.extractionConfidence ? parseFloat(item.extractionConfidence) : undefined,
          isVerified: item.isVerified ?? false,
          createdAt: item.createdAt || undefined,
        })),
        total: items.length,
        summary,
      };
    } catch (error) {
      console.error("审查项查询失败:", error);
      return {
        reviewItems: [],
        total: 0,
        summary: `查询失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});
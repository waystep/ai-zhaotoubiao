// 响应项查询工具 - 查询已有的响应项
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { responseItems } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export const responseItemQueryTool = createTool({
  id: "response-item-query",
  description: "查询已有的响应项，支持按项目、文档、类型筛选",
  inputSchema: z.object({
    projectId: z.string().uuid().optional().describe("项目ID"),
    documentId: z.string().uuid().optional().describe("文档ID"),
    responseType: z.string().optional().describe("响应项类型（文本类型，支持任意值）"),
    itemIds: z.array(z.string().uuid()).optional().describe("指定响应项ID列表"),
    includeUnverified: z.boolean().optional().describe("是否包含未验证项（默认false）"),
  }),
  outputSchema: z.object({
    responseItems: z.array(z.any()),
    total: z.number().int().nonnegative(),
    summary: z.string().optional(),
  }),
  execute: async ({ projectId, documentId, responseType, itemIds, includeUnverified }) => {
    try {
      const whereConditions = [];

      if (projectId) whereConditions.push(eq(responseItems.projectId, projectId));
      if (documentId) whereConditions.push(eq(responseItems.documentId, documentId));
      if (responseType) whereConditions.push(eq(responseItems.responseType, responseType));
      if (itemIds && itemIds.length > 0) whereConditions.push(inArray(responseItems.id, itemIds));
      if (!includeUnverified) whereConditions.push(eq(responseItems.isVerified, true));

      const items = await db.query.responseItems.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        orderBy: [responseItems.createdAt],
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

      return {
        responseItems: items,
        total: items.length,
        summary: `查询到 ${items.length} 个响应项`,
      };
    } catch (error) {
      console.error("响应项查询失败:", error);
      return {
        responseItems: [],
        total: 0,
        summary: `查询失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});
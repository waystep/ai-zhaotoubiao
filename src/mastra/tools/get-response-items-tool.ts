// 获取响应项工具 - 查询统一的 extractionItems 表
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { extractionItems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const getResponseItemsTool = createTool({
  id: "get-response-items",
  description: "获取项目的响应项列表。从 extractionItems 表查询，可用于评估投标文件响应度。",
  inputSchema: z.object({
    projectId: z.string().uuid().describe("项目ID"),
    section: z.enum(["技术标", "商务标"]).optional().describe("标段筛选"),
  }),
  outputSchema: z.object({
    responseItems: z.array(
      z.object({
        id: z.string().uuid(),
        title: z.string().describe("响应项标题"),
        checkpoint: z.string().describe("检查点"),
        section: z.string().optional().describe("标段"),
        location: z.any().describe("原文定位"),
      })
    ),
    total: z.number().int().nonnegative(),
    summary: z.string().optional(),
  }),
  execute: async ({ projectId, section }) => {
    try {
      const whereConditions = [eq(extractionItems.projectId, projectId)];
      if (section) whereConditions.push(eq(extractionItems.section, section));

      const items = await db.query.extractionItems.findMany({
        where: and(...whereConditions),
        orderBy: (fields, { asc }) => [asc(fields.createdAt)],
        with: {
          document: {
            columns: { id: true, name: true },
          },
        },
      });

      return {
        responseItems: items.map((item) => ({
          id: item.id,
          title: item.title || "",
          checkpoint: item.checkpoint || "",
          section: item.section || undefined,
          location: item.location || {},
        })),
        total: items.length,
        summary: `获取到 ${items.length} 个响应项`,
      };
    } catch (error) {
      console.error("获取响应项失败:", error);
      return {
        responseItems: [],
        total: 0,
        summary: `获取响应项失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});

// 获取响应项工具 - 用于审查智能体获取项目的响应项列表，用于评估投标文件的响应度
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { responseItems, documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const getResponseItemsTool = createTool({
  id: "get-response-items",
  description: "获取项目的响应项列表，用于评估投标文件的响应度。响应项是从招标文件中提取的要求投标人明确说明的内容要求。",
  inputSchema: z.object({
    projectId: z.string().uuid().describe("项目ID"),
    responseType: z.string().optional().describe("响应项类型筛选（可选，如：技术方案、人员配置、设备清单等）"),
    includeScoring: z.boolean().optional().describe("是否只获取评分相关的响应项（默认false，获取所有）"),
  }),
  outputSchema: z.object({
    responseItems: z.array(
      z.object({
        id: z.string().uuid(),
        responseType: z.string().describe("响应项类型"),
        itemNo: z.string().optional().describe("条款编号"),
        title: z.string().describe("响应项标题"),
        description: z.string().describe("详细描述"),
        responseRequirements: z.any().optional().describe("响应要求详情（格式、内容列表、字数要求等）"),
        scoringInfo: z.any().optional().describe("评分信息（权重、评分标准）"),
        location: z.any().describe("原文定位"),
        documentName: z.string().optional().describe("来源文档名称"),
      })
    ),
    total: z.number().int().nonnegative().describe("响应项总数"),
    summary: z.string().optional().describe("摘要信息"),
    scoringItemsCount: z.number().int().nonnegative().optional().describe("评分相关的响应项数量"),
  }),
  execute: async ({ projectId, responseType, includeScoring }) => {
    try {
      const whereConditions = [eq(responseItems.projectId, projectId)];

      if (responseType) whereConditions.push(eq(responseItems.responseType, responseType));

      const items = await db.query.responseItems.findMany({
        where: and(...whereConditions),
        orderBy: [responseItems.createdAt],
        with: {
          document: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      });

      // 筛选评分相关的响应项
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let filteredItems = items as any[];
      if (includeScoring) {
        filteredItems = items.filter(item =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (item.scoringInfo as any)?.weight && (item.scoringInfo as any).weight > 0
        );
      }

      // 统计评分相关的响应项
      const scoringItems = items.filter(item =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item.scoringInfo as any)?.weight && (item.scoringInfo as any).weight > 0
      );

      const summary = `获取到 ${filteredItems.length} 个响应项，其中 ${scoringItems.length} 个评分相关项`;

      return {
        responseItems: filteredItems.map(item => ({
          id: item.id,
          responseType: item.responseType || "unknown",
          itemNo: item.itemNo || undefined,
          title: item.title || "",
          description: item.description || "",
          responseRequirements: item.responseRequirements || undefined,
          scoringInfo: item.scoringInfo || undefined,
          location: item.location || {},
          documentName: item.document?.name || undefined,
        })),
        total: filteredItems.length,
        summary,
        scoringItemsCount: scoringItems.length,
      };
    } catch (error) {
      console.error("获取响应项失败:", error);
      return {
        responseItems: [],
        total: 0,
        summary: `获取响应项失败: ${error instanceof Error ? error.message : "未知错误"}`,
        scoringItemsCount: 0,
      };
    }
  },
});
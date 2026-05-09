// 获取审查项工具 - 用于审查智能体获取项目的审查项列表作为审查依据
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { reviewItems, documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const getReviewItemsTool = createTool({
  id: "get-review-items",
  description: "获取项目的审查项列表，用于审查投标文件是否合规。审查项是从招标文件和法律文件中提取的强制性要求条款。",
  inputSchema: z.object({
    projectId: z.string().uuid().describe("项目ID"),
    documentId: z.string().uuid().optional().describe("文档ID（可选，如果不提供则获取项目所有审查项）"),
    itemType: z.string().optional().describe("审查项类型筛选（可选，如：资质要求、技术要求等）"),
    consequence: z.string().optional().describe("后果筛选（可选，如：废标、违规、违法等）"),
  }),
  outputSchema: z.object({
    reviewItems: z.array(
      z.object({
        id: z.string().uuid(),
        itemType: z.string().describe("审查项类型"),
        itemNo: z.string().optional().describe("条款编号"),
        title: z.string().describe("审查项标题"),
        description: z.string().describe("详细描述"),
        consequence: z.string().optional().describe("不满足的后果"),
        legalReference: z.string().optional().describe("法律依据"),
        requirements: z.any().optional().describe("具体要求详情"),
        location: z.any().describe("原文定位"),
        documentName: z.string().optional().describe("来源文档名称"),
        documentType: z.string().optional().describe("来源文档类型"),
      })
    ),
    total: z.number().int().nonnegative().describe("审查项总数"),
    summary: z.string().optional().describe("摘要信息"),
    criticalItemsCount: z.number().int().nonnegative().optional().describe("关键条款数量（废标条款）"),
  }),
  execute: async ({ projectId, documentId, itemType, consequence }) => {
    try {
      const whereConditions = [eq(reviewItems.projectId, projectId)];

      if (documentId) whereConditions.push(eq(reviewItems.documentId, documentId));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (itemType) whereConditions.push(eq(reviewItems.itemType, itemType as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (consequence) whereConditions.push(eq(reviewItems.consequence, consequence as any));

      const items = await db.query.reviewItems.findMany({
        where: and(...whereConditions),
        orderBy: [reviewItems.createdAt],
        with: {
          document: {
            columns: {
              id: true,
              name: true,
              docType: true,
            },
          },
        },
      });

      // 统计关键条款（废标条款）
      const criticalItems = items.filter(item =>
        item.consequence && (
          item.consequence.includes("废标") ||
          item.consequence.includes("不予受理") ||
          item.consequence.includes("取消投标资格")
        )
      );

      const summary = `获取到 ${items.length} 个审查项，其中 ${criticalItems.length} 个关键条款（废标条款）`;

      return {
        reviewItems: items.map(item => ({
          id: item.id,
          itemType: item.itemType || "unknown",
          itemNo: item.itemNo || undefined,
          title: item.title || "",
          description: item.description || "",
          consequence: item.consequence || undefined,
          legalReference: item.legalReference || undefined,
          requirements: item.requirements || undefined,
          location: item.location || {},
          documentName: item.document?.name || undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          documentType: item.document?.docType as any || undefined,
        })),
        total: items.length,
        summary,
        criticalItemsCount: criticalItems.length,
      };
    } catch (error) {
      console.error("获取审查项失败:", error);
      return {
        reviewItems: [],
        total: 0,
        summary: `获取审查项失败: ${error instanceof Error ? error.message : "未知错误"}`,
        criticalItemsCount: 0,
      };
    }
  },
});
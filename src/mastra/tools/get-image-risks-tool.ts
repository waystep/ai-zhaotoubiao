// 图片风险查询工具 — 供报告智能体获取暗标风险分析结果
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { imageRiskAnalysis } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const getImageRisksTool = createTool({
  id: "get-image-risks",
  description: "查询文档的图片风险分析结果（暗标风险：Logo、水印、其他项目名称等）。返回有风险的图片列表及统计。",
  inputSchema: z.object({
    documentId: z.string().uuid().describe("文档ID"),
    onlyHasRisk: z.boolean().optional().default(true).describe("是否只返回有风险的图片"),
  }),
  outputSchema: z.object({
    images: z.array(
      z.object({
        id: z.string().uuid(),
        pageNumber: z.number(),
        imagePath: z.string(),
        status: z.string(),
        hasRisk: z.boolean().nullable(),
        riskType: z.string().nullable(),
        riskText: z.string().nullable(),
        confidence: z.string().nullable(),
      })
    ),
    stats: z.object({
      total: z.number(),
      hasRisk: z.number(),
      completed: z.number(),
      failed: z.number(),
    }),
    summary: z.string(),
  }),
  execute: async ({ documentId, onlyHasRisk }) => {
    try {
      const whereConditions = [eq(imageRiskAnalysis.documentId, documentId)];
      if (onlyHasRisk) whereConditions.push(eq(imageRiskAnalysis.hasRisk, true));

      const images = await db.query.imageRiskAnalysis.findMany({
        where: and(...whereConditions),
        orderBy: (fields, { asc }) => [asc(fields.pageNumber)],
      });

      const allImages = await db.query.imageRiskAnalysis.findMany({
        where: eq(imageRiskAnalysis.documentId, documentId),
        columns: { id: true, hasRisk: true, status: true },
      });

      const stats = {
        total: allImages.length,
        hasRisk: allImages.filter((i) => i.hasRisk === true).length,
        completed: allImages.filter((i) => i.status === "completed").length,
        failed: allImages.filter((i) => i.status === "failed").length,
      };

      const riskTypes = [...new Set(images.filter((i) => i.riskType).map((i) => i.riskType))];

      return {
        images: images.map((img) => ({
          id: img.id,
          pageNumber: img.pageNumber,
          imagePath: img.imagePath,
          status: img.status || "pending",
          hasRisk: img.hasRisk,
          riskType: img.riskType,
          riskText: img.riskText,
          confidence: img.confidence,
        })),
        stats,
        summary: `共 ${stats.total} 张图片，${stats.hasRisk} 张有风险（${riskTypes.join("、") || "无"}）`,
      };
    } catch (error) {
      console.error("获取图片风险失败:", error);
      return {
        images: [],
        stats: { total: 0, hasRisk: 0, completed: 0, failed: 0 },
        summary: `获取失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});

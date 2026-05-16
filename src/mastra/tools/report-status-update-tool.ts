import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reviewReports, reviewIssues, reviewItemResults } from "@/lib/db/schema";

export const reportStatusUpdateTool = createTool({
  id: "report-status-update",
  description: "更新审查报告状态。仅由总协调智能体在确认审查流程完成后调用。可将状态设置为 in_progress（审查进行中）、completed（审查完成）或 failed（审查失败）。调用前必须先通过 getReportInfoTool 验证报告数据完整性。",
  inputSchema: z.object({
    reportId: z.string().uuid(),
    status: z.enum(["in_progress", "completed", "failed"]),
    completionCheck: z.object({
      hasIssues: z.boolean().describe("是否已生成问题列表"),
      hasReviewResults: z.boolean().describe("是否已生成审查项结果"),
      hasSummary: z.boolean().describe("是否已生成审查摘要"),
      issueCount: z.number().int().nonnegative().describe("问题数量"),
      passCount: z.number().int().nonnegative().describe("通过的审查项数量"),
      failCount: z.number().int().nonnegative().describe("不通过的审查项数量"),
    }).describe("完成状态检查结果，必须基于 getReportInfoTool 返回的实际数据填写"),
    errorMessage: z.string().optional().describe("失败时的错误信息"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    reportId: z.string().uuid(),
    status: z.string().nullable(),
    message: z.string(),
  }),
  execute: async ({ reportId, status, completionCheck, errorMessage }) => {
    try {
      const report = await db.query.reviewReports.findFirst({
        where: eq(reviewReports.id, reportId),
        columns: { id: true, status: true },
      });
      if (!report) {
        return {
          success: false,
          reportId,
          status: "failed",
          message: "报告不存在",
        };
      }

      // 验证完成条件
      if (status === "completed") {
        const isValid =
          completionCheck.hasSummary &&
          (completionCheck.hasIssues || completionCheck.hasReviewResults);

        if (!isValid) {
          return {
            success: false,
            reportId,
            status: report.status,
            message: "报告数据不完整，无法标记为完成。必须包含摘要，且至少包含问题列表或审查项结果。",
          };
        }
      }

      const updateData: Record<string, unknown> = {
        status,
        updatedAt: new Date(),
      };

      if (status === "completed") {
        updateData.completedAt = new Date();
      }

      if (status === "failed" && errorMessage) {
        updateData.aiAnalysis = { error: errorMessage };
      }

      await db.update(reviewReports).set(updateData).where(eq(reviewReports.id, reportId));

      // 统计当前报告数据
      const issueCount = await db.query.reviewIssues.findMany({
        where: eq(reviewIssues.reportId, reportId),
        columns: { id: true },
      });
      const resultCount = await db.query.reviewItemResults.findMany({
        where: eq(reviewItemResults.reportId, reportId),
        columns: { id: true, status: true },
      });

      return {
        success: true,
        reportId,
        status,
        message: `报告状态已更新为 ${status}。当前包含 ${issueCount.length} 个问题，${resultCount.length} 个审查项结果。`,
      };
    } catch (error) {
      return {
        success: false,
        reportId,
        status: "failed",
        message: error instanceof Error ? error.message : "状态更新失败",
      };
    }
  },
});
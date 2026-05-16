import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reviewReports, reviewIssues, reviewItemResults } from "@/lib/db/schema";

export const getReportInfoTool = createTool({
  id: "get-report-info",
  description: "获取审查报告的完整信息。用于总协调智能体在更新报告状态前验证数据完整性。返回报告的基本信息、问题数量、审查项结果统计、是否已有摘要等关键数据。",
  inputSchema: z.object({
    reportId: z.string().uuid(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    reportId: z.string().uuid(),
    report: z.object({
      id: z.string().uuid(),
      status: z.string().nullable(),
      aiScore: z.string().nullable(),
      recommendation: z.string().nullable(),
      hasSummary: z.boolean(),
      summaryLength: z.number().int().nonnegative(),
    }),
    issues: z.object({
      total: z.number().int().nonnegative(),
      critical: z.number().int().nonnegative(),
      major: z.number().int().nonnegative(),
      minor: z.number().int().nonnegative(),
      suggestion: z.number().int().nonnegative(),
    }),
    reviewItemResults: z.object({
      total: z.number().int().nonnegative(),
      pass: z.number().int().nonnegative(),
      fail: z.number().int().nonnegative(),
      needsManualReview: z.number().int().nonnegative(),
    }),
    completionStatus: z.object({
      hasIssues: z.boolean(),
      hasReviewResults: z.boolean(),
      hasSummary: z.boolean(),
      isComplete: z.boolean().describe("是否可以标记为完成：必须有摘要且至少有问题或审查结果"),
    }),
    message: z.string(),
  }),
  execute: async ({ reportId }) => {
    try {
      const report = await db.query.reviewReports.findFirst({
        where: eq(reviewReports.id, reportId),
        columns: { id: true, status: true, aiScore: true, recommendation: true, summary: true },
      });
      if (!report) {
        return {
          success: false,
          reportId,
          report: { id: reportId, status: "not_found", aiScore: null, recommendation: null, hasSummary: false, summaryLength: 0 },
          issues: { total: 0, critical: 0, major: 0, minor: 0, suggestion: 0 },
          reviewItemResults: { total: 0, pass: 0, fail: 0, needsManualReview: 0 },
          completionStatus: { hasIssues: false, hasReviewResults: false, hasSummary: false, isComplete: false },
          message: "报告不存在",
        };
      }

      // 获取问题统计
      const issues = await db.query.reviewIssues.findMany({
        where: eq(reviewIssues.reportId, reportId),
        columns: { id: true, severity: true },
      });

      const issueStats = {
        total: issues.length,
        critical: issues.filter((i) => i.severity === "critical").length,
        major: issues.filter((i) => i.severity === "major").length,
        minor: issues.filter((i) => i.severity === "minor").length,
        suggestion: issues.filter((i) => i.severity === "suggestion").length,
      };

      // 获取审查项结果统计
      const results = await db.query.reviewItemResults.findMany({
        where: eq(reviewItemResults.reportId, reportId),
        columns: { id: true, status: true },
      });

      const resultStats = {
        total: results.length,
        pass: results.filter((r) => r.status === "pass").length,
        fail: results.filter((r) => r.status === "fail").length,
        needsManualReview: results.filter((r) => r.status === "needs_manual_review").length,
      };

      // 计算完成状态
      const hasSummary = !!(report.summary && report.summary.length > 0);
      const summaryLength = report.summary?.length ?? 0;
      const hasIssues = issues.length > 0;
      const hasReviewResults = results.length > 0;
      const isComplete = hasSummary && (hasIssues || hasReviewResults);

      return {
        success: true,
        reportId,
        report: {
          id: report.id,
          status: report.status,
          aiScore: report.aiScore,
          recommendation: report.recommendation,
          hasSummary,
          summaryLength,
        },
        issues: issueStats,
        reviewItemResults: resultStats,
        completionStatus: {
          hasIssues,
          hasReviewResults,
          hasSummary,
          isComplete,
        },
        message: `报告信息获取成功。当前状态：${report.status}，问题：${issues.length}，审查项：${results.length}，摘要：${hasSummary ? '已生成' : '未生成'}。`,
      };
    } catch (error) {
      return {
        success: false,
        reportId,
        report: { id: reportId, status: "error", aiScore: null, recommendation: null, hasSummary: false, summaryLength: 0 },
        issues: { total: 0, critical: 0, major: 0, minor: 0, suggestion: 0 },
        reviewItemResults: { total: 0, pass: 0, fail: 0, needsManualReview: 0 },
        completionStatus: { hasIssues: false, hasReviewResults: false, hasSummary: false, isComplete: false },
        message: error instanceof Error ? error.message : "获取报告信息失败",
      };
    }
  },
});
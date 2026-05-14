// 报告查询工具 - 根据reportId查询报告及已有审查数据
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { reviewReports, reviewItemResults, reviewIssues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type ReportStatus = "pending" | "in_progress" | "completed" | "failed";
type Recommendation = "pass" | "revise" | "fail";

export const getReportTool = createTool({
  id: "get-report",
  description: "查询审查报告详情，包含已有的审查项结果和问题。用于子智能体获取当前报告完整上下文。",
  inputSchema: z.object({
    reportId: z.string().uuid().describe("审查报告ID"),
  }),
  outputSchema: z.object({
    report: z.object({
      id: z.string().uuid(),
      projectId: z.string().uuid(),
      documentId: z.string().uuid(),
      status: z.enum(["pending", "in_progress", "completed", "failed"]),
      aiScore: z.number().optional(),
      recommendation: z.enum(["pass", "revise", "fail"]).optional(),
      summary: z.string().optional(),
      documentName: z.string(),
      projectName: z.string(),
      createdAt: z.string(),
      completedAt: z.string().optional(),
    }),
    reviewItemResultsCount: z.number(),
    issuesCount: z.number(),
    summary: z.string(),
  }),
  execute: async ({ reportId }) => {
    try {
      const report = await db.query.reviewReports.findFirst({
        where: eq(reviewReports.id, reportId),
        with: {
          document: { columns: { id: true, name: true } },
          project: { columns: { id: true, name: true } },
        },
      });

      if (!report) {
        return {
          report: {
            id: reportId,
            projectId: "",
            documentId: "",
            status: "pending" as ReportStatus,
            documentName: "",
            projectName: "",
            createdAt: new Date().toISOString(),
          },
          reviewItemResultsCount: 0,
          issuesCount: 0,
          summary: `报告 ${reportId} 不存在`,
        };
      }

      // 查询已存储的审查数据和问题
      const items = await db.query.reviewItemResults.findMany({
        where: eq(reviewItemResults.reportId, reportId),
        columns: { id: true, status: true },
      });

      const issues = await db.query.reviewIssues.findMany({
        where: eq(reviewIssues.reportId, reportId),
        columns: { id: true },
      });

      const passCount = items.filter((i) => i.status === "pass").length;
      const failCount = items.filter((i) => i.status === "fail").length;
      const reviewCount = items.filter((i) => i.status === "needs_manual_review").length;

      const statusSummary =
        items.length === 0
          ? `⚠️ 暂无审查项结果 — 请等待 tender-review-agent 完成审查后再生成报告，不要编造数据。`
          : `已有 ${items.length} 条审查项结果（pass:${passCount} fail:${failCount} review:${reviewCount}），${issues.length} 个问题。`;

      return {
        report: {
          id: report.id,
          projectId: report.projectId,
          documentId: report.documentId,
          status: report.status as ReportStatus,
          aiScore: report.aiScore ? Number(report.aiScore) : undefined,
          recommendation: report.recommendation as Recommendation | undefined,
          summary: report.summary || "",
          documentName: report.document?.name || "",
          projectName: report.project?.name || "",
          createdAt: report.createdAt?.toISOString() || new Date().toISOString(),
          completedAt: report.completedAt?.toISOString(),
        },
        reviewItemResultsCount: items.length,
        issuesCount: issues.length,
        summary: `报告 ${report.id.slice(0, 8)}: ${statusSummary}`,
      };
    } catch (error) {
      console.error("报告查询失败:", error);
      return {
        report: {
          id: reportId,
          projectId: "",
          documentId: "",
          status: "failed" as ReportStatus,
          documentName: "",
          projectName: "",
          createdAt: new Date().toISOString(),
        },
        reviewItemResultsCount: 0,
        issuesCount: 0,
        summary: `报告查询失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});

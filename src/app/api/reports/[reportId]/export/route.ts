import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { reviewReports } from "@/lib/db/schema";

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

const statusLabels: Record<string, string> = {
  pending: "待审查",
  in_progress: "审查中",
  completed: "已完成",
  failed: "审查失败",
};

const recommendationLabels: Record<string, string> = {
  pass: "建议通过",
  fail: "建议不通过",
  revise: "建议补充/修订",
};

const resultStatusLabels: Record<string, string> = {
  pass: "通过",
  fail: "不满足",
  needs_manual_review: "待人工复核",
};

const severityLabels: Record<string, string> = {
  critical: "严重",
  major: "重要",
  minor: "轻微",
  suggestion: "建议",
};

function safeText(value: unknown, fallback = "-") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
}

function formatScore(value: unknown) {
  if (value === null || value === undefined) return "-";
  const score = Number(value);
  return Number.isFinite(score) ? `${score.toFixed(0)} 分` : safeText(value);
}

function formatConfidence(value: unknown) {
  if (value === null || value === undefined) return "-";
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return safeText(value);
  return confidence <= 1 ? `${Math.round(confidence * 100)}%` : `${Math.round(confidence)}%`;
}

function buildFileName(projectName: string, documentName: string) {
  const baseName = `审查报告-${projectName}-${documentName}`
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .slice(0, 120);
  return `${baseName || "审查报告"}.md`;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportId } = await context.params;

  try {
    const report = await db.query.reviewReports.findFirst({
      where: eq(reviewReports.id, reportId),
      with: {
        document: {
          columns: {
            name: true,
            docType: true,
          },
        },
        project: {
          columns: {
            name: true,
            projectNo: true,
            orgId: true,
          },
        },
        reviewer: {
          columns: {
            name: true,
            email: true,
          },
        },
        issues: {
          columns: {
            category: true,
            severity: true,
            title: true,
            description: true,
            location: true,
            suggestion: true,
            isResolved: true,
          },
        },
        reviewItemResults: {
          columns: {
            status: true,
            reason: true,
            evidenceBlockIds: true,
            confidence: true,
          },
          with: {
            reviewItem: {
              columns: {
                section: true,
                title: true,
                checkpoint: true,
              },
            },
          },
        },
      },
    });

    if (!report || report.project?.orgId !== session.user?.orgId) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const resultSummary = {
      total: report.reviewItemResults.length,
      pass: report.reviewItemResults.filter((item) => item.status === "pass").length,
      fail: report.reviewItemResults.filter((item) => item.status === "fail").length,
      needsManualReview: report.reviewItemResults.filter((item) => item.status === "needs_manual_review").length,
    };

    const lines = [
      "# 智能投标审查报告",
      "",
      "## 基本信息",
      "",
      `- 项目名称：${safeText(report.project.name)}`,
      `- 项目编号：${safeText(report.project.projectNo)}`,
      `- 审查文档：${safeText(report.document.name)}`,
      `- 报告状态：${statusLabels[safeText(report.status, "")] || safeText(report.status)}`,
      `- AI 评分：${formatScore(report.aiScore)}`,
      `- 审查建议：${recommendationLabels[safeText(report.recommendation, "")] || safeText(report.recommendation)}`,
      `- 审查人：${safeText(report.reviewer?.name || report.reviewer?.email)}`,
      `- 完成时间：${formatDate(report.completedAt)}`,
      "",
      "## 审查摘要",
      "",
      safeText(report.summary, "暂无审查摘要。"),
      "",
      "## 结果统计",
      "",
      `- 审查项总数：${resultSummary.total}`,
      `- 通过：${resultSummary.pass}`,
      `- 不满足：${resultSummary.fail}`,
      `- 待人工复核：${resultSummary.needsManualReview}`,
      `- 问题数量：${report.issues.length}`,
      "",
      "## 审查项结果",
      "",
    ];

    if (report.reviewItemResults.length === 0) {
      lines.push("暂无结构化审查项结果。", "");
    } else {
      report.reviewItemResults.forEach((result, index) => {
        const evidenceIds = Array.isArray(result.evidenceBlockIds) ? result.evidenceBlockIds : [];
        lines.push(
          `### ${index + 1}. ${safeText(result.reviewItem.title)}`,
          "",
          `- 所属部分：${safeText(result.reviewItem.section)}`,
          `- 状态：${resultStatusLabels[result.status] || result.status}`,
          `- 置信度：${formatConfidence(result.confidence)}`,
          `- 检查点：${safeText(result.reviewItem.checkpoint)}`,
          `- 审查理由：${safeText(result.reason)}`,
          `- 证据区块：${evidenceIds.length > 0 ? evidenceIds.join(", ") : "-"}`,
          ""
        );
      });
    }

    lines.push("## 问题清单", "");

    if (report.issues.length === 0) {
      lines.push("暂无明确问题。", "");
    } else {
      report.issues.forEach((issue, index) => {
        const location = issue.location as { pageNumber?: number; blockIndex?: number; textSnippet?: string } | null;
        lines.push(
          `### ${index + 1}. ${safeText(issue.title)}`,
          "",
          `- 类别：${safeText(issue.category)}`,
          `- 严重程度：${severityLabels[issue.severity] || issue.severity}`,
          `- 状态：${issue.isResolved ? "已处理" : "未处理"}`,
          `- 位置：第 ${location?.pageNumber ?? "-"} 页，区块 ${location?.blockIndex ?? "-"}`,
          `- 描述：${safeText(issue.description)}`,
          `- 建议：${safeText(issue.suggestion)}`,
          `- 文本片段：${safeText(location?.textSnippet)}`,
          ""
        );
      });
    }

    lines.push("> 本报告由智能投标审查智能体生成，建议结合原始招投标文件进行人工复核。", "");

    const fileName = buildFileName(report.project.name, report.document.name);
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to export review report:", error);
    return NextResponse.json({ error: "Failed to export review report" }, { status: 500 });
  }
}

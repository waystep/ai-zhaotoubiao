import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents, reviewIssues, reviewReports, tenderProjects } from "@/lib/db/schema";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

function parseDateRange(params: URLSearchParams) {
  const fromRaw = params.get("from");
  const toRaw = params.get("to");
  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;
  const fromOk = from && !isNaN(from.getTime());
  const toOk = to && !isNaN(to.getTime());
  return {
    from: fromOk ? from! : null,
    to: toOk ? to! : null,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const { from, to } = parseDateRange(searchParams);

  try {
    // org 可见项目
    const projects = await db.query.tenderProjects.findMany({
      where: eq(tenderProjects.orgId, session.user.orgId),
      columns: { id: true },
    });
    const orgProjectIds = projects.map((p) => p.id);

    const scopedProjectIds = projectId
      ? orgProjectIds.includes(projectId)
        ? [projectId]
        : []
      : orgProjectIds;

    if (scopedProjectIds.length === 0) {
      return NextResponse.json({
        overview: {
          projectsCount: 0,
          documents: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 },
          reports: { total: 0, pending: 0, in_progress: 0, completed: 0, avgAiScore: null as number | null },
          issues: {
            total: 0,
            bySeverity: { critical: 0, major: 0, minor: 0, suggestion: 0 },
            resolved: 0,
            unresolved: 0,
          },
        },
      });
    }

    const docWhere = and(
      inArray(documents.projectId, scopedProjectIds),
      from ? gte(documents.createdAt, from) : undefined,
      to ? lte(documents.createdAt, to) : undefined
    );

    const reportWhere = and(
      inArray(reviewReports.projectId, scopedProjectIds),
      from ? gte(reviewReports.createdAt, from) : undefined,
      to ? lte(reviewReports.createdAt, to) : undefined
    );

    // 文档：按 parseStatus 汇总
    const docAgg = await db
      .select({
        status: documents.parseStatus,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(documents)
      .where(docWhere)
      .groupBy(documents.parseStatus);

    const docCounts = { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const r of docAgg) {
      const k = (r.status ?? "pending") as keyof typeof docCounts;
      if (k in docCounts) docCounts[k] += r.count;
      docCounts.total += r.count;
    }

    // 报告：按 status 汇总 + avgAiScore
    const reportAgg = await db
      .select({
        status: reviewReports.status,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(reviewReports)
      .where(reportWhere)
      .groupBy(reviewReports.status);

    const avgAiScoreRow = await db
      .select({
        avgAiScore: sql<number | null>`avg(${reviewReports.aiScore})`,
      })
      .from(reviewReports)
      .where(reportWhere);

    const reportCounts: {
      total: number;
      pending: number;
      in_progress: number;
      completed: number;
      avgAiScore: number | null;
    } = { total: 0, pending: 0, in_progress: 0, completed: 0, avgAiScore: null };

    for (const r of reportAgg) {
      const s = (r.status ?? "pending") as "pending" | "in_progress" | "completed";
      if (s === "pending") reportCounts.pending += r.count;
      if (s === "in_progress") reportCounts.in_progress += r.count;
      if (s === "completed") reportCounts.completed += r.count;
      reportCounts.total += r.count;
    }
    const avgAiScore = avgAiScoreRow[0]?.avgAiScore ?? null;
    reportCounts.avgAiScore = avgAiScore == null ? null : Number(avgAiScore);

    // 问题：severity / resolved
    // 先拿报告 id 列表（在同一 scope 内）
    const scopedReportIds = await db
      .select({ id: reviewReports.id })
      .from(reviewReports)
      .where(reportWhere);
    const reportIds = scopedReportIds.map((r) => r.id);

    let issuesTotal = 0;
    const bySeverity = { critical: 0, major: 0, minor: 0, suggestion: 0 };
    let resolved = 0;
    let unresolved = 0;

    if (reportIds.length > 0) {
      const severityAgg = await db
        .select({
          severity: reviewIssues.severity,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(reviewIssues)
        .where(inArray(reviewIssues.reportId, reportIds))
        .groupBy(reviewIssues.severity);

      for (const r of severityAgg) {
        const sev = r.severity as keyof typeof bySeverity;
        if (sev in bySeverity) bySeverity[sev] += r.count;
        issuesTotal += r.count;
      }

      const resolvedAgg = await db
        .select({
          isResolved: reviewIssues.isResolved,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(reviewIssues)
        .where(inArray(reviewIssues.reportId, reportIds))
        .groupBy(reviewIssues.isResolved);

      for (const r of resolvedAgg) {
        if (r.isResolved) resolved += r.count;
        else unresolved += r.count;
      }
    }

    return NextResponse.json({
      overview: {
        projectsCount: scopedProjectIds.length,
        documents: docCounts,
        reports: reportCounts,
        issues: {
          total: issuesTotal,
          bySeverity,
          resolved,
          unresolved,
        },
      },
    });
  } catch (error) {
    console.error("[analytics/overview] 失败:", error);
    return NextResponse.json({ error: "获取统计总览失败" }, { status: 500 });
  }
}


import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents, reviewIssues, reviewReports, tenderProjects } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

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

type TopType = "issueCategory" | "document" | "project";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") || "issueCategory") as TopType;
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10) || 10, 1), 50);
  const projectId = searchParams.get("projectId");
  const { from, to } = parseDateRange(searchParams);

  if (!["issueCategory", "document", "project"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  try {
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
      return NextResponse.json({ items: [] as Array<{ key: string; count: number }> });
    }

    const reportWhere = and(
      inArray(reviewReports.projectId, scopedProjectIds),
      from ? gte(reviewReports.createdAt, from) : undefined,
      to ? lte(reviewReports.createdAt, to) : undefined
    );

    // scope reportIds
    const scopedReportIds = await db
      .select({ id: reviewReports.id, projectId: reviewReports.projectId, documentId: reviewReports.documentId })
      .from(reviewReports)
      .where(reportWhere);

    const reportIds = scopedReportIds.map((r) => r.id);
    if (reportIds.length === 0) {
      return NextResponse.json({ items: [] as Array<{ key: string; count: number }> });
    }

    if (type === "issueCategory") {
      const rows = await db
        .select({
          key: reviewIssues.category,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(reviewIssues)
        .where(inArray(reviewIssues.reportId, reportIds))
        .groupBy(reviewIssues.category)
        .orderBy(desc(sql`count(*)`))
        .limit(limit);

      return NextResponse.json({
        items: rows.map((r) => ({ key: r.key, count: r.count })),
      });
    }

    if (type === "project") {
      const rows = await db
        .select({
          key: reviewReports.projectId,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(reviewIssues)
        .innerJoin(reviewReports, eq(reviewIssues.reportId, reviewReports.id))
        .where(and(inArray(reviewIssues.reportId, reportIds), inArray(reviewReports.projectId, scopedProjectIds)))
        .groupBy(reviewReports.projectId)
        .orderBy(desc(sql`count(*)`))
        .limit(limit);

      const projectIds = rows.map((r) => r.key);
      const projRows = projectIds.length
        ? await db
            .select({ id: tenderProjects.id, name: tenderProjects.name })
            .from(tenderProjects)
            .where(inArray(tenderProjects.id, projectIds))
        : [];
      const projNameMap = new Map(projRows.map((p) => [p.id, p.name]));

      return NextResponse.json({
        items: rows.map((r) => ({ key: projNameMap.get(r.key) ?? r.key, count: r.count })),
      });
    }

    // type === "document"
    const rows = await db
      .select({
        key: reviewReports.documentId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(reviewIssues)
      .innerJoin(reviewReports, eq(reviewIssues.reportId, reviewReports.id))
      .where(and(inArray(reviewIssues.reportId, reportIds), inArray(reviewReports.projectId, scopedProjectIds)))
      .groupBy(reviewReports.documentId)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    // 可选：返回文件名（多一次查询，仍在 scope 内）
    const docIds = rows.map((r) => r.key);
    const docs = docIds.length
      ? await db
          .select({ id: documents.id, name: documents.name })
          .from(documents)
          .where(inArray(documents.id, docIds))
      : [];
    const nameMap = new Map(docs.map((d) => [d.id, d.name]));

    return NextResponse.json({
      items: rows.map((r) => ({
        key: nameMap.get(r.key) ?? r.key,
        count: r.count,
      })),
    });
  } catch (error) {
    console.error("[analytics/top] 失败:", error);
    return NextResponse.json({ error: "获取 Top 统计失败" }, { status: 500 });
  }
}


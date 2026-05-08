import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents, reviewIssues, reviewReports, tenderProjects } from "@/lib/db/schema";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

function parseDateOnlyLocal(raw: string, boundary: "start" | "end") {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (boundary === "start") dt.setHours(0, 0, 0, 0);
    else dt.setHours(23, 59, 59, 999);
    return dt;
  }
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function parseDateRange(params: URLSearchParams) {
  const fromRaw = params.get("from");
  const toRaw = params.get("to");
  const from = fromRaw ? parseDateOnlyLocal(fromRaw, "start") : null;
  const to = toRaw ? parseDateOnlyLocal(toRaw, "end") : null;
  return { from, to };
}

type Metric = "documents" | "reports" | "issues";
type Bucket = "day" | "week";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const metric = (searchParams.get("metric") || "documents") as Metric;
  const bucket = (searchParams.get("bucket") || "day") as Bucket;
  const projectId = searchParams.get("projectId");
  const { from, to } = parseDateRange(searchParams);

  if (!["documents", "reports", "issues"].includes(metric)) {
    return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
  }
  if (!["day", "week"].includes(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
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
      return NextResponse.json({ series: [] as Array<{ date: string; value: number }> });
    }

    const truncExpr = bucket === "week"
      ? sql`date_trunc('week', ${documents.createdAt})`
      : sql`date_trunc('day', ${documents.createdAt})`;

    if (metric === "documents") {
      const where = and(
        inArray(documents.projectId, scopedProjectIds),
        from ? gte(documents.createdAt, from) : undefined,
        to ? lte(documents.createdAt, to) : undefined
      );

      const rows = await db
        .select({
          bucket: truncExpr,
          value: sql<number>`count(*)`.mapWith(Number),
        })
        .from(documents)
        .where(where)
        .groupBy(sql`${truncExpr}`)
        .orderBy(sql`${truncExpr}`);

      return NextResponse.json({
        series: rows.map((r) => ({
          date: new Date(r.bucket as unknown as string).toISOString(),
          value: r.value,
        })),
      });
    }

    if (metric === "reports") {
      const trunc = bucket === "week"
        ? sql`date_trunc('week', ${reviewReports.createdAt})`
        : sql`date_trunc('day', ${reviewReports.createdAt})`;

      const where = and(
        inArray(reviewReports.projectId, scopedProjectIds),
        from ? gte(reviewReports.createdAt, from) : undefined,
        to ? lte(reviewReports.createdAt, to) : undefined
      );

      const rows = await db
        .select({
          bucket: trunc,
          value: sql<number>`count(*)`.mapWith(Number),
        })
        .from(reviewReports)
        .where(where)
        .groupBy(sql`${trunc}`)
        .orderBy(sql`${trunc}`);

      return NextResponse.json({
        series: rows.map((r) => ({
          date: new Date(r.bucket as unknown as string).toISOString(),
          value: r.value,
        })),
      });
    }

    // issues：先取 scope 内 reportIds，再按 reviewIssues.createdAt 聚合
    const reportWhere = and(
      inArray(reviewReports.projectId, scopedProjectIds),
      from ? gte(reviewReports.createdAt, from) : undefined,
      to ? lte(reviewReports.createdAt, to) : undefined
    );
    const scopedReportIds = await db
      .select({ id: reviewReports.id })
      .from(reviewReports)
      .where(reportWhere);
    const reportIds = scopedReportIds.map((r) => r.id);
    if (reportIds.length === 0) {
      return NextResponse.json({ series: [] as Array<{ date: string; value: number }> });
    }

    const trunc = bucket === "week"
      ? sql`date_trunc('week', ${reviewIssues.createdAt})`
      : sql`date_trunc('day', ${reviewIssues.createdAt})`;

    const rows = await db
      .select({
        bucket: trunc,
        value: sql<number>`count(*)`.mapWith(Number),
      })
      .from(reviewIssues)
      .where(
        and(
          inArray(reviewIssues.reportId, reportIds),
          from ? gte(reviewIssues.createdAt, from) : undefined,
          to ? lte(reviewIssues.createdAt, to) : undefined
        )
      )
      .groupBy(sql`${trunc}`)
      .orderBy(sql`${trunc}`);

    return NextResponse.json({
      series: rows.map((r) => ({
        date: new Date(r.bucket as unknown as string).toISOString(),
        value: r.value,
      })),
    });
  } catch (error) {
    console.error("[analytics/trends] 失败:", error);
    return NextResponse.json({ error: "获取趋势数据失败" }, { status: 500 });
  }
}


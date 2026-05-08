"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, FolderOpen, FileText, ClipboardCheck, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function AnalyticsPage() {
  const [projectId, setProjectId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (projectId) p.set("projectId", projectId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  }, [projectId, from, to]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  type Overview = {
    projectsCount: number;
    documents: { total: number; pending: number; processing: number; completed: number; failed: number };
    reports: { total: number; pending: number; in_progress: number; completed: number; avgAiScore: number | null };
    issues: {
      total: number;
      bySeverity: { critical: number; major: number; minor: number; suggestion: number };
      resolved: number;
      unresolved: number;
    };
  };

  type OverviewResponse = { overview: Overview };

  const [overview, setOverview] = useState<Overview | null>(null);

  const [topCategories, setTopCategories] = useState<Array<{ key: string; count: number }>>([]);
  const [topDocuments, setTopDocuments] = useState<Array<{ key: string; count: number }>>([]);
  const [topProjects, setTopProjects] = useState<Array<{ key: string; count: number }>>([]);

  // 默认近 30 天
  useEffect(() => {
    if (from || to) return;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    setFrom(fmt(start));
    setTo(fmt(end));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 项目下拉数据源
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setProjectsLoading(true);
        const res = await fetch("/api/projects", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { projects?: Array<{ id: string; name: string }> };
        if (cancelled) return;
        setProjects(json.projects || []);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, topRes, topDocRes, topProjRes] = await Promise.all([
        fetch(`/api/analytics/overview${query}`, { cache: "no-store" }),
        fetch(
          `/api/analytics/top?type=issueCategory&limit=10${query ? `&${query.slice(1)}` : ""}`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/analytics/top?type=document&limit=10${query ? `&${query.slice(1)}` : ""}`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/analytics/top?type=project&limit=10${query ? `&${query.slice(1)}` : ""}`,
          { cache: "no-store" }
        ),
      ]);
      if (!ovRes.ok) throw new Error("overview 请求失败");
      if (!topRes.ok) throw new Error("top 请求失败");
      if (!topDocRes.ok) throw new Error("top(document) 请求失败");
      if (!topProjRes.ok) throw new Error("top(project) 请求失败");
      const ovJson = (await ovRes.json()) as OverviewResponse;
      const topJson = (await topRes.json()) as { items: Array<{ key: string; count: number }> };
      const topDocJson = (await topDocRes.json()) as { items: Array<{ key: string; count: number }> };
      const topProjJson = (await topProjRes.json()) as { items: Array<{ key: string; count: number }> };
      setOverview(ovJson.overview);
      setTopCategories(topJson.items || []);
      setTopDocuments(topDocJson.items || []);
      setTopProjects(topProjJson.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const avgScoreLabel =
    overview?.reports.avgAiScore == null ? "--" : overview.reports.avgAiScore.toFixed(2);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">统计分析</h2>
          <p className="text-muted-foreground">
            查看平台使用统计数据
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
          <CardDescription>按项目与日期范围查看统计</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 min-w-0">
            <label className="text-sm text-muted-foreground">项目</label>
            <select
              value={projectId}
              disabled={projectsLoading}
              onChange={(e) => setProjectId(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">{projectsLoading ? "加载中..." : "全部项目"}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full md:w-[180px]">
            <label className="text-sm text-muted-foreground">开始日期（可选）</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="w-full md:w-[180px]">
            <label className="text-sm text-muted-foreground">结束日期（可选）</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reload} disabled={loading}>
              刷新
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setProjectId("");
                setFrom("");
                setTo("");
              }}
              disabled={loading}
            >
              清空
            </Button>
          </div>
        </CardContent>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(end.getDate() - 7);
                const fmt = (d: Date) => d.toISOString().slice(0, 10);
                setFrom(fmt(start));
                setTo(fmt(end));
              }}
            >
              近 7 天
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(end.getDate() - 30);
                const fmt = (d: Date) => d.toISOString().slice(0, 10);
                setFrom(fmt(start));
                setTo(fmt(end));
              }}
            >
              近 30 天
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(end.getDate() - 90);
                const fmt = (d: Date) => d.toISOString().slice(0, 10);
                setFrom(fmt(start));
                setTo(fmt(end));
              }}
            >
              近 90 天
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">项目总数</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "--" : overview?.projectsCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">当前组织可见项目数</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">文档总数</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "--" : overview?.documents.total ?? 0}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>解析中 {overview?.documents.processing ?? 0}</span>
              <span>已完成 {overview?.documents.completed ?? 0}</span>
              <span>失败 {overview?.documents.failed ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">审查报告</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "--" : overview?.reports.total ?? 0}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>进行中 {overview?.reports.in_progress ?? 0}</span>
              <span>已完成 {overview?.reports.completed ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均评分</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "--" : avgScoreLabel}</div>
            <p className="text-xs text-muted-foreground">已完成报告 aiScore 平均值</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>问题严重程度</CardTitle>
            <CardDescription>按严重程度汇总（当前筛选范围）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">严重 {overview?.issues.bySeverity.critical ?? 0}</Badge>
              <Badge variant="outline">重要 {overview?.issues.bySeverity.major ?? 0}</Badge>
              <Badge variant="outline">轻微 {overview?.issues.bySeverity.minor ?? 0}</Badge>
              <Badge variant="outline">建议 {overview?.issues.bySeverity.suggestion ?? 0}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              总计 {overview?.issues.total ?? 0}，已解决 {overview?.issues.resolved ?? 0}，待处理{" "}
              {overview?.issues.unresolved ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>问题类别 Top10</CardTitle>
            <CardDescription>按问题类别聚合</CardDescription>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无数据</div>
            ) : (
              <ol className="space-y-2">
                {topCategories.map((it, idx) => (
                  <li key={`${it.key}-${idx}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">
                      {idx + 1}. {it.key}
                    </span>
                    <Badge variant="secondary">{it.count}</Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>问题最多的文档 Top10</CardTitle>
            <CardDescription>按文档聚合问题数</CardDescription>
          </CardHeader>
          <CardContent>
            {topDocuments.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无数据</div>
            ) : (
              <ol className="space-y-2">
                {topDocuments.map((it, idx) => (
                  <li key={`${it.key}-${idx}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm" title={it.key}>
                      {idx + 1}. {it.key}
                    </span>
                    <Badge variant="secondary">{it.count}</Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>问题最多的项目 Top10</CardTitle>
            <CardDescription>按项目聚合问题数</CardDescription>
          </CardHeader>
          <CardContent>
            {topProjects.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无数据</div>
            ) : (
              <ol className="space-y-2">
                {topProjects.map((it, idx) => (
                  <li key={`${it.key}-${idx}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm" title={it.key}>
                      {idx + 1}. {it.key}
                    </span>
                    <Badge variant="secondary">{it.count}</Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
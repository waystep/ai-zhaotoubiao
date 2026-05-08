"use client";

import { useMemo, useState, useEffect } from "react";
import { ClipboardCheck, Loader2, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { docTypeLabel, reviewStatusLabel } from "@/lib/ui/labels";
import { formatDateCN } from "@/lib/ui/format";
import { TruncatedText } from "@/components/ui/truncated-text";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDashboardScrollRestoration } from "@/hooks/use-dashboard-scroll-restoration";

interface Report {
  id: string;
  status: string;
  aiScore: string | null;
  createdAt: string;
  document: {
    id: string;
    name: string;
    docType: string;
  };
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const { saveNow } = useDashboardScrollRestoration(`reports?q=${q}&status=${status}`);

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    try {
      const response = await fetch("/api/reports");
      if (response.ok) {
        const data = await response.json();
        setReports(data.reports);
      }
    } catch (error) {
      console.error("获取报告列表失败:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "in_progress":
        return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return reports.filter((r) => {
      if (status && r.status !== status) return false;
      if (!query) return true;
      const hay = `${r.document.name}`.toLowerCase();
      return hay.includes(query);
    });
  }, [reports, q, status]);

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (status) {
    chips.push({
      key: "status",
      label: `审查状态：${reviewStatusLabel(status)}`,
      onRemove: () => setStatus(""),
    });
  }
  if (q.trim()) {
    chips.push({
      key: "q",
      label: `搜索：${q.trim()}`,
      onRemove: () => setQ(""),
    });
  }

  return (
    <div className="space-y-6">
      {/* 吸顶筛选条 */}
      <div className="sticky top-0 z-10 -mx-6 border-b bg-background/85 px-6 py-4 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 min-w-0">
            <label className="text-sm text-muted-foreground">搜索（文档名）</label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="输入关键词…" />
          </div>
          <div className="w-full md:w-[200px]">
            <label className="text-sm text-muted-foreground">审查状态</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">全部</option>
              <option value="in_progress">审查中</option>
              <option value="completed">已完成</option>
              <option value="pending">待审查</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                setStatus("");
              }}
            >
              清空
            </Button>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.onRemove}
                className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
                title="点击移除筛选"
              >
                <span className="truncate">{c.label}</span>
                <span className="text-muted-foreground">×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">审查报告</h2>
          <p className="text-muted-foreground">
            查看所有审查报告和问题清单
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">暂无审查报告</h3>
            <p className="text-muted-foreground text-center mb-4">
              请先创建项目并上传文档，然后发起审查任务
            </p>
            <Link href="/projects">
              <Card className="hover:border-primary transition-colors">
                <CardContent className="p-4">
                  查看项目列表
                </CardContent>
              </Card>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              共 {filtered.length} 条
            </div>
            {filtered.some((r) => r.status === "in_progress") && (
              <Badge variant="outline" title="审查中报告建议稍后刷新查看结果">
                有审查中
              </Badge>
            )}
          </div>

          {filtered.map((report) => (
            <Link key={report.id} href={`/reports/${report.id}`} onClick={() => saveNow()}>
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-4">
                    <ClipboardCheck className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">
                        <TruncatedText text={report.document.name} />
                      </CardTitle>
                      <CardDescription>
                        {docTypeLabel(report.document.docType)} ·
                        {formatDateCN(report.createdAt)}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {report.aiScore && (
                      <div className="text-lg font-semibold text-primary">
                        <span title={`${report.aiScore}分`}>{report.aiScore}分</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {getStatusIcon(report.status)}
                      <span className="text-sm text-muted-foreground">
                        {reviewStatusLabel(report.status)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
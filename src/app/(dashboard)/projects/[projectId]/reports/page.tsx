"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, Loader2, Plus, CheckCircle, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { TruncatedText } from "@/components/ui/truncated-text";
import { docTypeLabel, reviewStatusLabel } from "@/lib/ui/labels";
import { formatDateCN } from "@/lib/ui/format";
import { useDashboardScrollRestoration } from "@/hooks/use-dashboard-scroll-restoration";

interface Report {
  id: string;
  status: string;
  aiScore: string | null;
  recommendation: string | null;
  createdAt: string;
  completedAt: string | null;
  document: {
    id: string;
    name: string;
    docType: string;
  };
}

export default function ProjectReportsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const { saveNow } = useDashboardScrollRestoration(`project-reports:${projectId}?q=${q}&status=${status}`);

  useEffect(() => {
    fetchReports();
  }, [projectId]);

  async function fetchReports() {
    try {
      const response = await fetch(`/api/projects/${projectId}/reports`);
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

  const getRecommendationLabel = (rec: string | null) => {
    switch (rec) {
      case "pass":
        return { label: "通过", color: "bg-green-100 text-green-700" };
      case "fail":
        return { label: "不通过", color: "bg-red-100 text-red-700" };
      case "revise":
        return { label: "整改后通过", color: "bg-yellow-100 text-yellow-700" };
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return reports.filter((r) => {
      if (status && r.status !== status) return false;
      if (!query) return true;
      return r.document.name.toLowerCase().includes(query);
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

      {/* 头部 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => router.push(`/projects/${projectId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回项目详情
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">审查报告</h2>
          <p className="text-muted-foreground">
            查看和管理项目的审查报告
          </p>
        </div>
        <Link href={`/projects/${projectId}/reports/new`} className="shrink-0">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            创建审查任务
          </Button>
        </Link>
      </div>

      {/* 报告列表 */}
      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">暂无审查报告</h3>
            <p className="text-muted-foreground text-center mb-4">
              创建审查任务，对已解析的文档进行合规性审查
            </p>
            <Link href={`/projects/${projectId}/reports/new`}>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                创建审查任务
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <div className="text-sm text-muted-foreground">共 {filtered.length} 条</div>
          {filtered.map((report) => (
            <Link
              key={report.id}
              href={`/reports/${report.id}`}
              className="block"
              onClick={() => saveNow()}
            >
              <Card className="hover:border-primary transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-4">
                    {getStatusIcon(report.status)}
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
                      <div className="text-lg font-bold text-primary">
                        <span title={`${report.aiScore}分`}>{report.aiScore}分</span>
                      </div>
                    )}
                    {report.recommendation && (
                      <Badge className={getRecommendationLabel(report.recommendation)?.color}>
                        {getRecommendationLabel(report.recommendation)?.label}
                      </Badge>
                    )}
                    <Badge variant="outline">
                      {reviewStatusLabel(report.status)}
                    </Badge>
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
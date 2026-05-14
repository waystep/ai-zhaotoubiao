"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, Loader2, Plus, CheckCircle, Clock, Trash2, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { docTypeLabel, reviewStatusLabel } from "@/lib/ui/labels";
import { formatDateCN } from "@/lib/ui/format";
import { useDashboardScrollRestoration } from "@/hooks/use-dashboard-scroll-restoration";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

function SelectionBox({
  checked,
  indeterminate,
  disabled,
  onClick,
  ariaLabel,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-label={ariaLabel}
      aria-checked={indeterminate ? "mixed" : checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        checked || indeterminate
          ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
          : "border-input bg-background text-transparent hover:border-primary/60 hover:bg-primary/5",
        disabled && "cursor-not-allowed opacity-40 hover:border-input hover:bg-background",
        className
      )}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3 stroke-[3]" />
      ) : checked ? (
        <Check className="h-3 w-3 stroke-[3]" />
      ) : null}
    </button>
  );
}

export default function ProjectReportsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
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

  async function handleDelete(reportId: string, documentName: string) {
    if (!confirm(`确定要删除审查报告 "${documentName}" 吗？此操作不可撤销。`)) {
      return;
    }

    setDeletingIds((prev) => [...prev, reportId]);
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "删除成功",
          description: "审查报告已删除",
        });
        setReports((prev) => prev.filter((r) => r.id !== reportId));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(reportId);
          return next;
        });
      } else {
        const error = await response.json();
        toast({
          title: "删除失败",
          description: error.error || "删除审查报告失败",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "网络错误",
        description: "请检查您的网络连接",
        variant: "destructive",
      });
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== reportId));
    }
  }

  async function handleBatchDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      toast({
        title: "无法删除",
        description: "请先选择要删除的审查报告",
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`确定删除已选的 ${ids.length} 个审查报告？此操作不可撤销。`)) {
      return;
    }

    setBatchBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const id of ids) {
      const report = reports.find((r) => r.id === id);
      try {
        const response = await fetch(`/api/reports/${id}`, { method: "DELETE" });
        if (response.ok) {
          ok += 1;
          setReports((prev) => prev.filter((r) => r.id !== id));
        } else {
          const err = await response.json().catch(() => ({}));
          failed.push(`${report?.document.name ?? id}: ${err.error || "失败"}`);
        }
      } catch {
        failed.push(`${report?.document.name ?? id}: 网络错误`);
      }
    }
    setSelectedIds(new Set());
    setBatchBusy(false);
    if (ok > 0) {
      toast({
        title: "批量删除完成",
        description:
          failed.length === 0
            ? `已删除 ${ok} 个审查报告`
            : `已删除 ${ok} 个；${failed.length} 个失败`,
      });
    }
    if (failed.length > 0 && ok === 0) {
      toast({
        title: "删除失败",
        description: failed.slice(0, 3).join("；"),
        variant: "destructive",
      });
    } else if (failed.length > 0) {
      toast({
        title: "部分删除失败",
        description: failed.slice(0, 3).join("；"),
        variant: "destructive",
      });
    }
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  }

  function toggleRow(reportId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return reports.filter((r) => {
      if (status && r.status !== status) return false;
      if (!query) return true;
      return r.document.name.toLowerCase().includes(query);
    });
  }, [reports, q, status]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0;
  const batchDeletableCount = selectedIds.size;

  // Clear selection when filters change
  useEffect(() => {
    const visible = new Set(filtered.map((r) => r.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [filtered]);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 紧凑筛选条 */}
      <div className="sticky top-0 z-10 -mx-6 border-b bg-background/95 backdrop-blur px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索文档名..."
            className="h-9 w-[200px]"
          />
          <Select
            value={status || "all"}
            onValueChange={(v) => setStatus(v === "all" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="in_progress">审查中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="pending">待审查</SelectItem>
            </SelectContent>
          </Select>
          {(q || status) && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setStatus("");
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              清空筛选
            </button>
          )}

          {/* 创建审查任务按钮 - 固定右侧 */}
          <div className="ml-auto shrink-0">
            <Link href={`/projects/${projectId}/reports/new`} title="从已解析文档发起新的审查流程">
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                创建审查任务
              </Button>
            </Link>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.onRemove}
                className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs hover:bg-muted"
                title="点击移除筛选"
              >
                <span className="truncate">{c.label}</span>
                <span className="text-muted-foreground">×</span>
              </button>
            ))}
            {reports.some((r) => r.status === "in_progress") && (
              <Badge variant="outline" className="text-xs" title="审查中会自动刷新">
                自动刷新中
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* 内容区 */}
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
            <h3 className="text-h5 mb-2">暂无审查报告</h3>
            <p className="text-muted-foreground text-center mb-4">
              创建审查任务，对已解析的文档进行合规性审查
            </p>
            <Link href={`/projects/${projectId}/reports/new`}>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                创建审查任务
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            当前筛选条件下没有审查报告
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 批量操作栏 - 紧凑样式 */}
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <SelectionBox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onClick={toggleSelectAll}
                disabled={batchBusy || filtered.length === 0}
                ariaLabel="选择全部报告"
              />
              <span className="font-medium">全选</span>
              <span className="text-muted-foreground text-xs">
                {selectedIds.size}/{filtered.length}
              </span>
            </label>

            <div className="h-4 w-px bg-border" />

            <Button
              size="sm"
              variant="ghost"
              disabled={batchBusy || batchDeletableCount === 0}
              onClick={handleBatchDelete}
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            >
              {batchBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : `批量删除 (${batchDeletableCount})`}
            </Button>

            <div className="ml-auto text-xs text-muted-foreground">
              共 {filtered.length} 条
            </div>
          </div>

          {/* 表格样式报告列表 */}
          <div className="rounded-lg border overflow-hidden">
            {/* 表头 */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-4 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground border-b">
              <div className="w-4" />
              <div>文档名称</div>
              <div className="w-[100px] text-center">类型</div>
              <div className="w-[80px] text-center">评分</div>
              <div className="w-[100px] text-center">建议</div>
              <div className="w-[80px] text-center">状态</div>
              <div className="w-[60px] text-center">操作</div>
            </div>

            {/* 表格内容 */}
            <div className="divide-y">
              {filtered.map((report) => {
                const isSelected = selectedIds.has(report.id);
                const rec = getRecommendationLabel(report.recommendation);

                return (
                  <div
                    key={report.id}
                    className={cn(
                      "grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    {/* 选择框 */}
                    <SelectionBox
                      checked={isSelected}
                      disabled={batchBusy || deletingIds.includes(report.id)}
                      onClick={() => toggleRow(report.id)}
                      ariaLabel={`选择 ${report.document.name}`}
                    />

                    <Link
                      href={`/projects/${projectId}/reports/${report.id}`}
                      onClick={() => saveNow()}
                      className="contents group cursor-pointer"
                      aria-label={`查看报告：${report.document.name}`}
                    >
                      {/* 文档名称 */}
                      <div className="flex items-center gap-3 min-w-0">
                        {getStatusIcon(report.status)}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                            {report.document.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateCN(report.createdAt)}
                          </div>
                        </div>
                      </div>

                      {/* 类型 */}
                      <div className="w-[100px] text-center">
                        <Badge variant="outline" className="text-xs">
                          {docTypeLabel(report.document.docType)}
                        </Badge>
                      </div>

                      {/* 评分 */}
                      <div className="w-[80px] text-center">
                        {report.aiScore ? (
                          <span className="text-sm font-medium text-primary">{report.aiScore}分</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>

                      {/* 建议 */}
                      <div className="w-[100px] text-center">
                        {rec ? (
                          <Badge className={cn("text-xs", rec.color)}>
                            {rec.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>

                      {/* 状态 */}
                      <div className="w-[80px] flex items-center justify-center">
                        <Badge variant="outline" className="text-xs">
                          {reviewStatusLabel(report.status)}
                        </Badge>
                      </div>
                    </Link>

                    {/* 操作 */}
                    <div className="w-[60px] flex items-center justify-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(report.id, report.document.name);
                        }}
                        disabled={deletingIds.includes(report.id) || batchBusy}
                        className="h-7 px-1.5 text-destructive hover:text-destructive"
                      >
                        {deletingIds.includes(report.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Check, FileText, Loader2, CheckCircle, XCircle, Clock, Trash2, Play, Plus, Minus, Upload, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TruncatedText } from "@/components/ui/truncated-text";
import { clampPercent, formatDateCN } from "@/lib/ui/format";
import { docTypeLabel, parseStatusLabel } from "@/lib/ui/labels";
import { useDashboardScrollRestoration } from "@/hooks/use-dashboard-scroll-restoration";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Document {
  id: string;
  name: string;
  docType: string;
  parseStatus: string;
  taskProgress?: number | null;
  createdAt: string;
}

const DOC_TYPE_FILTERS: { value: string; label: string; color: string }[] = [
  { value: "tender_doc", label: "招标文件", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "legal_doc", label: "法律文件", color: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "bid_doc", label: "投标文件", color: "bg-green-50 text-green-700 border-green-200" },
];

function initialTypeFilters(): Record<string, boolean> {
  return Object.fromEntries(DOC_TYPE_FILTERS.map((t) => [t.value, true]));
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked || indeterminate
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-input bg-background text-transparent hover:border-primary/60",
        disabled && "cursor-not-allowed opacity-40",
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

export default function ProjectDocumentsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [parseStatus, setParseStatus] = useState<string>("");
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [parsingIds, setParsingIds] = useState<string[]>([]);
  const [typeFilterEnabled, setTypeFilterEnabled] = useState<Record<string, boolean>>(initialTypeFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const { saveNow } = useDashboardScrollRestoration(
    `project-documents:${projectId}?q=${q}&status=${parseStatus}`
  );

  const filteredDocuments = useMemo(() => {
    const enabledTypes = DOC_TYPE_FILTERS.filter((t) => typeFilterEnabled[t.value]).map((t) => t.value);
    if (enabledTypes.length === 0) return [];
    const query = q.trim().toLowerCase();
    return documents.filter((d) => {
      if (!enabledTypes.includes(d.docType)) return false;
      if (parseStatus && d.parseStatus !== parseStatus) return false;
      if (!query) return true;
      return d.name.toLowerCase().includes(query);
    });
  }, [documents, typeFilterEnabled, q, parseStatus]);

  const selectableDocs = useMemo(
    () => filteredDocuments.filter((d) => d.parseStatus !== "processing"),
    [filteredDocuments]
  );

  const allSelectableSelected =
    selectableDocs.length > 0 && selectableDocs.every((d) => selectedIds.has(d.id));

  const someSelected = selectedIds.size > 0;

  useEffect(() => {
    const visible = new Set(filteredDocuments.map((d) => d.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [filteredDocuments]);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error("获取文档列表失败:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const hasProcessing = documents.some((d) => d.parseStatus === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const id = window.setInterval(() => void fetchDocuments(), 4000);
    return () => window.clearInterval(id);
  }, [hasProcessing, fetchDocuments]);

  function toggleTypeFilter(value: string) {
    setTypeFilterEnabled((prev) => ({ ...prev, [value]: !prev[value] }));
  }

  function toggleSelectAll() {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableDocs.map((d) => d.id)));
    }
  }

  function toggleRow(doc: Document) {
    if (doc.parseStatus === "processing") return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(doc.id)) next.delete(doc.id);
      else next.add(doc.id);
      return next;
    });
  }

  async function handleParsePending(documentId: string) {
    setParsingIds((prev) => [...prev, documentId]);
    try {
      const response = await fetch(`/api/documents/${documentId}/parse`, { method: "POST" });
      if (response.ok) {
        toast({ title: "解析任务已启动", description: "文档正在解析中" });
        fetchDocuments();
      } else {
        const error = await response.json().catch(() => ({}));
        toast({ title: "解析失败", description: error.error || "请求失败", variant: "destructive" });
      }
    } catch {
      toast({ title: "网络错误", description: "请检查网络连接", variant: "destructive" });
    } finally {
      setParsingIds((prev) => prev.filter((id) => id !== documentId));
    }
  }

  async function handleReparse(documentId: string) {
    setParsingIds((prev) => [...prev, documentId]);
    try {
      const response = await fetch(`/api/documents/${documentId}/parse`, { method: "POST" });
      if (response.ok) {
        toast({ title: "重新解析已启动", description: "文档正在解析中" });
        fetchDocuments();
      } else {
        const error = await response.json();
        toast({ title: "解析失败", description: error.error || error.details, variant: "destructive" });
      }
    } catch {
      toast({ title: "网络错误", description: "请检查网络连接", variant: "destructive" });
    } finally {
      setParsingIds((prev) => prev.filter((id) => id !== documentId));
    }
  }

  async function handleDelete(documentId: string, documentName: string) {
    if (!confirm(`确定要删除文档 "${documentName}" 吗？此操作不可撤销。`)) return;

    setDeletingIds((prev) => [...prev, documentId]);
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      if (response.ok) {
        toast({ title: "删除成功", description: "文档已删除" });
        setDocuments((prev) => prev.filter((d) => d.id !== documentId));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(documentId);
          return next;
        });
      } else {
        const error = await response.json();
        toast({ title: "删除失败", description: error.error || "删除失败", variant: "destructive" });
      }
    } catch {
      toast({ title: "网络错误", description: "请检查网络连接", variant: "destructive" });
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== documentId));
    }
  }

  async function handleBatchDelete() {
    const ids = [...selectedIds].filter((id) => {
      const d = documents.find((x) => x.id === id);
      return d && d.parseStatus !== "processing";
    });
    if (ids.length === 0) {
      toast({ title: "无法删除", description: "没有可删除的文档", variant: "destructive" });
      return;
    }
    if (!confirm(`确定删除已选的 ${ids.length} 个文档？此操作不可撤销。`)) return;

    setBatchBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const id of ids) {
      const doc = documents.find((d) => d.id === id);
      try {
        const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
        if (response.ok) {
          ok += 1;
          setDocuments((prev) => prev.filter((d) => d.id !== id));
        } else {
          const err = await response.json().catch(() => ({}));
          failed.push(`${doc?.name ?? id}: ${err.error || "失败"}`);
        }
      } catch {
        failed.push(`${doc?.name ?? id}: 网络错误`);
      }
    }
    setSelectedIds(new Set());
    setBatchBusy(false);
    if (ok > 0) {
      toast({ title: "批量删除完成", description: failed.length === 0 ? `已删除 ${ok} 个文档` : `已删除 ${ok} 个；${failed.length} 个失败` });
    }
    if (failed.length > 0 && ok === 0) {
      toast({ title: "删除失败", description: failed.slice(0, 3).join("；"), variant: "destructive" });
    }
  }

  async function handleBatchParse() {
    const targets = [...selectedIds]
      .map((id) => documents.find((d) => d.id === id))
      .filter((d): d is Document => !!d && (d.parseStatus === "pending" || d.parseStatus === "failed"));
    if (targets.length === 0) {
      toast({ title: "没有可解析的文档", description: "请选择待解析或解析失败的文档", variant: "destructive" });
      return;
    }

    setBatchBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const d of targets) {
      try {
        const response = await fetch(`/api/documents/${d.id}/parse`, { method: "POST" });
        if (response.ok) ok += 1;
        else {
          const err = await response.json().catch(() => ({}));
          failed.push(`${d.name}: ${err.error || "失败"}`);
        }
      } catch {
        failed.push(`${d.name}: 网络错误`);
      }
    }
    setBatchBusy(false);
    setSelectedIds(new Set());
    toast({ title: "批量解析已提交", description: `已提交 ${ok} 个解析任务` });
    fetchDocuments();
  }

  const getParseStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTypeStyle = (docType: string) => {
    return DOC_TYPE_FILTERS.find((t) => t.value === docType)?.color || "bg-gray-50 text-gray-700 border-gray-200";
  };

  const batchParseableCount = [...selectedIds].filter((id) => {
    const d = documents.find((x) => x.id === id);
    return d && (d.parseStatus === "pending" || d.parseStatus === "failed");
  }).length;

  const batchDeletableCount = [...selectedIds].filter((id) => {
    const d = documents.find((x) => x.id === id);
    return d && d.parseStatus !== "processing";
  }).length;

  // 筛选条件摘要
  const activeFiltersCount = [
    parseStatus,
    DOC_TYPE_FILTERS.filter((t) => !typeFilterEnabled[t.value]).length > 0,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* 紧凑的工具栏 */}
      <div className="sticky top-0 z-10 -mx-6 border-b bg-background/95 backdrop-blur px-6 py-3">
        <div className="flex items-center gap-3">
          {/* 类型筛选 */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm transition-colors",
                  "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                )}
              >
                <span className="text-muted-foreground">类型</span>
                {/* 已选类型标签 */}
                <div className="flex items-center gap-1">
                  {DOC_TYPE_FILTERS.filter((t) => typeFilterEnabled[t.value]).map((t) => (
                    <span
                      key={t.value}
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
                        t.color.replace("border-", "").replace("bg-", "bg-").split(" ").find(c => c.startsWith("bg-")),
                        t.color.split(" ").find(c => c.startsWith("text-"))
                      )}
                    >
                      {t.label}
                    </span>
                  ))}
                  {DOC_TYPE_FILTERS.filter((t) => !typeFilterEnabled[t.value]).length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      +{DOC_TYPE_FILTERS.filter((t) => !typeFilterEnabled[t.value]).length}
                    </span>
                  )}
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[220px] p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">选择文档类型</div>
              <div className="space-y-1">
                {DOC_TYPE_FILTERS.map((t) => (
                  <label
                    key={t.value}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors",
                      typeFilterEnabled[t.value] ? "bg-muted" : "hover:bg-muted/50"
                    )}
                    onClick={() => toggleTypeFilter(t.value)}
                  >
                    <SelectionBox
                      checked={typeFilterEnabled[t.value] ?? false}
                      onClick={() => toggleTypeFilter(t.value)}
                      ariaLabel={`切换${t.label}`}
                    />
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
                        t.color
                      )}
                    >
                      {t.label}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs flex-1"
                  onClick={() => setTypeFilterEnabled(initialTypeFilters())}
                >
                  全选
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs flex-1 text-muted-foreground"
                  onClick={() =>
                    setTypeFilterEnabled(Object.fromEntries(DOC_TYPE_FILTERS.map((t) => [t.value, false])))
                  }
                >
                  清空
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* 状态筛选 */}
          <Select
            value={parseStatus || "all"}
            onValueChange={(v) => setParseStatus(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="processing">解析中</SelectItem>
              <SelectItem value="completed">已解析</SelectItem>
              <SelectItem value="failed">解析失败</SelectItem>
              <SelectItem value="pending">待解析</SelectItem>
            </SelectContent>
          </Select>

          {/* 清空筛选 */}
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setParseStatus("");
                setTypeFilterEnabled(initialTypeFilters());
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              清空筛选
            </button>
          )}

          {/* 自动刷新提示 */}
          {hasProcessing && (
            <Badge variant="outline" className="text-xs">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              自动刷新
            </Badge>
          )}

          {/* 上传按钮 - 固定右侧 */}
          <div className="ml-auto shrink-0">
            <Link href={`/projects/${projectId}/documents/upload`}>
              <Button size="sm">
                <Upload className="mr-1.5 h-4 w-4" />
                上传
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-h5 mb-2">暂无文档</h3>
            <p className="text-muted-foreground text-center mb-4">
              上传招标文件、法律文件或投标文件开始审查流程
            </p>
            <Link href={`/projects/${projectId}/documents/upload`}>
              <Button size="sm">
                <Upload className="mr-1.5 h-4 w-4" />
                上传文档
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : DOC_TYPE_FILTERS.every((t) => !typeFilterEnabled[t.value]) ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            请至少选择一种文档类型
          </CardContent>
        </Card>
      ) : filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            当前筛选条件下没有文档
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 批量操作栏 - 紧凑样式 */}
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <SelectionBox
                checked={allSelectableSelected}
                indeterminate={someSelected && !allSelectableSelected}
                onClick={toggleSelectAll}
                disabled={batchBusy || selectableDocs.length === 0}
                ariaLabel="选择全部"
              />
              <span className="font-medium">全选</span>
              <span className="text-muted-foreground text-xs">
                {selectedIds.size}/{selectableDocs.length}
              </span>
            </label>

            <div className="h-4 w-px bg-border" />

            <Button
              size="sm"
              variant="ghost"
              disabled={batchBusy || batchParseableCount === 0}
              onClick={handleBatchParse}
              className="h-7 px-2 text-xs"
            >
              {batchBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : `批量解析 (${batchParseableCount})`}
            </Button>

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
              共 {filteredDocuments.length} 条
            </div>
          </div>

          {/* 表格样式文档列表 */}
          <div className="rounded-lg border overflow-hidden">
            {/* 表头 */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground border-b">
              <div className="w-4" />
              <div>文档名称</div>
              <div className="w-[100px] text-center">类型</div>
              <div className="w-[120px] text-center">解析状态</div>
              <div className="w-[80px] text-center">操作</div>
            </div>

            {/* 表格内容 */}
            <div className="divide-y">
              {filteredDocuments.map((doc) => {
                const isProcessing = doc.parseStatus === "processing";
                const isSelected = selectedIds.has(doc.id);

                return (
                  <div
                    key={doc.id}
                    className={cn(
                      "grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    {/* 选择框 */}
                    <SelectionBox
                      checked={isSelected}
                      disabled={isProcessing || batchBusy}
                      onClick={() => toggleRow(doc)}
                      ariaLabel={`选择 ${doc.name}`}
                    />

                    {/* 文档名称 */}
                    <Link
                      href={`/projects/${projectId}/documents/${doc.id}`}
                      onClick={() => saveNow()}
                      className="flex items-center gap-3 min-w-0 group"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {doc.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateCN(doc.createdAt)}
                        </div>
                      </div>
                    </Link>

                    {/* 类型 */}
                    <div className="w-[100px] text-center">
                      <Badge variant="outline" className={cn("text-xs", getTypeStyle(doc.docType))}>
                        {docTypeLabel(doc.docType)}
                      </Badge>
                    </div>

                    {/* 解析状态 */}
                    <div className="w-[120px] flex items-center justify-center gap-2">
                      {getParseStatusIcon(doc.parseStatus)}
                      <span className="text-xs text-muted-foreground">
                        {parseStatusLabel(doc.parseStatus, clampPercent(doc.taskProgress))}
                      </span>
                      {isProcessing && (
                        <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary transition-[width]"
                            style={{ width: `${clampPercent(doc.taskProgress)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* 操作 */}
                    <div className="w-[80px] flex items-center justify-center gap-1">
                      {doc.parseStatus === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleParsePending(doc.id)}
                          disabled={parsingIds.includes(doc.id) || batchBusy}
                          className="h-7 px-2 text-xs"
                        >
                          {parsingIds.includes(doc.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : "解析"}
                        </Button>
                      )}
                      {doc.parseStatus === "failed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReparse(doc.id)}
                          disabled={parsingIds.includes(doc.id) || batchBusy}
                          className="h-7 px-2 text-xs"
                        >
                          {parsingIds.includes(doc.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : "重试"}
                        </Button>
                      )}
                      {doc.parseStatus === "completed" && (
                        <Link href={`/projects/${projectId}/documents/${doc.id}`} onClick={() => saveNow()}>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                            查看
                          </Button>
                        </Link>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(doc.id, doc.name)}
                        disabled={deletingIds.includes(doc.id) || isProcessing || batchBusy}
                        className="h-7 px-1.5 text-destructive hover:text-destructive"
                      >
                        {deletingIds.includes(doc.id) ? (
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
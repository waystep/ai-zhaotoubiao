"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, CheckCircle, XCircle, Clock, Trash2, Play, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Document {
  id: string;
  name: string;
  docType: string;
  parseStatus: string;
  taskProgress?: number | null;
  createdAt: string;
}

function parseProgressPercent(p: number | null | undefined): number {
  if (p == null || Number.isNaN(p)) return 0;
  return Math.min(100, Math.max(0, Math.round(p)));
}

const DOC_TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "tender_doc", label: "招标文件" },
  { value: "legal_doc", label: "法律文件" },
  { value: "bid_doc", label: "投标文件" },
  { value: "review_report", label: "审查报告" },
];

function initialTypeFilters(): Record<string, boolean> {
  return Object.fromEntries(DOC_TYPE_FILTERS.map((t) => [t.value, true]));
}

export default function ProjectDocumentsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [parsingIds, setParsingIds] = useState<string[]>([]);
  const [typeFilterEnabled, setTypeFilterEnabled] = useState<Record<string, boolean>>(initialTypeFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const filteredDocuments = useMemo(() => {
    const enabledTypes = DOC_TYPE_FILTERS.filter((t) => typeFilterEnabled[t.value]).map((t) => t.value);
    if (enabledTypes.length === 0) return [];
    return documents.filter((d) => enabledTypes.includes(d.docType));
  }, [documents, typeFilterEnabled]);

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

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someSelected && !allSelectableSelected;
  }, [someSelected, allSelectableSelected]);

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
        toast({
          title: "解析任务已启动",
          description: "文档正在解析中，请稍后刷新查看结果",
        });
        fetchDocuments();
      } else {
        const error = await response.json().catch(() => ({}));
        toast({
          title: "解析失败",
          description: error.error || "请求失败",
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
      setParsingIds((prev) => prev.filter((id) => id !== documentId));
    }
  }

  async function handleReparse(documentId: string) {
    setParsingIds((prev) => [...prev, documentId]);
    try {
      const response = await fetch(`/api/documents/${documentId}/parse`, {
        method: "POST",
      });

      if (response.ok) {
        toast({
          title: "重新解析已启动",
          description: "文档正在解析中，请稍后刷新查看结果",
        });
        fetchDocuments();
      } else {
        const error = await response.json();
        toast({
          title: "解析失败",
          description: error.error || error.details,
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
      setParsingIds((prev) => prev.filter((id) => id !== documentId));
    }
  }

  async function handleDelete(documentId: string, documentName: string) {
    if (!confirm(`确定要删除文档 "${documentName}" 吗？此操作不可撤销。`)) {
      return;
    }

    setDeletingIds((prev) => [...prev, documentId]);
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "删除成功",
          description: "文档已删除",
        });
        setDocuments((prev) => prev.filter((d) => d.id !== documentId));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(documentId);
          return next;
        });
      } else {
        const error = await response.json();
        toast({
          title: "删除失败",
          description: error.error || "删除文档失败",
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
      setDeletingIds((prev) => prev.filter((id) => id !== documentId));
    }
  }

  async function handleBatchDelete() {
    const ids = [...selectedIds].filter((id) => {
      const d = documents.find((x) => x.id === id);
      return d && d.parseStatus !== "processing";
    });
    if (ids.length === 0) {
      toast({
        title: "无法删除",
        description: "没有可删除的文档（解析中的文档需等待完成后再删）",
        variant: "destructive",
      });
      return;
    }
    if (!confirm(`确定删除已选的 ${ids.length} 个文档？此操作不可撤销。`)) {
      return;
    }

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
      toast({
        title: "批量删除完成",
        description:
          failed.length === 0
            ? `已删除 ${ok} 个文档`
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
    fetchDocuments();
  }

  async function handleBatchParse() {
    const targets = [...selectedIds]
      .map((id) => documents.find((d) => d.id === id))
      .filter(
        (d): d is Document =>
          !!d && (d.parseStatus === "pending" || d.parseStatus === "failed")
      );
    if (targets.length === 0) {
      toast({
        title: "没有可解析的文档",
        description: "请选择状态为「待解析」或「解析失败」的文档",
        variant: "destructive",
      });
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
    const failHint =
      failed.length > 0
        ? ` 失败 ${failed.length} 个：${failed.slice(0, 2).join("；")}${failed.length > 2 ? "…" : ""}`
        : "";
    toast({
      title: failed.length > 0 && ok === 0 ? "批量解析失败" : "批量解析已提交",
      description: `已提交 ${ok} 个解析任务。${failHint}`.trim(),
      ...(failed.length > 0 && ok === 0 ? { variant: "destructive" as const } : {}),
    });
    fetchDocuments();
  }

  const getDocTypeLabel = (docType: string) => {
    switch (docType) {
      case "tender_doc":
        return "招标文件";
      case "legal_doc":
        return "法律文件";
      case "bid_doc":
        return "投标文件";
      case "review_report":
        return "审查报告";
      default:
        return docType;
    }
  };

  const getParseStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "processing":
        return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getParseStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "已解析";
      case "processing":
        return "解析中";
      case "failed":
        return "解析失败";
      default:
        return "待解析";
    }
  };

  const batchParseableCount = [...selectedIds].filter((id) => {
    const d = documents.find((x) => x.id === id);
    return d && (d.parseStatus === "pending" || d.parseStatus === "failed");
  }).length;

  const batchDeletableCount = [...selectedIds].filter((id) => {
    const d = documents.find((x) => x.id === id);
    return d && d.parseStatus !== "processing";
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
          <h2 className="text-3xl font-bold tracking-tight">文档管理</h2>
          <p className="text-muted-foreground">
            管理项目相关文档
          </p>
        </div>
      </div>

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
            <h3 className="text-lg font-semibold mb-2">暂无文档</h3>
            <p className="text-muted-foreground text-center mb-4">
              上传招标文件、法律文件或投标文件开始审查流程
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">按类型筛选</CardTitle>
              <CardDescription>勾选要显示的类型；未勾选的类型将从列表中隐藏</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4 pt-0">
              {DOC_TYPE_FILTERS.map((t) => (
                <label
                  key={t.value}
                  className="flex items-center gap-2 text-sm cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={typeFilterEnabled[t.value] ?? false}
                    onChange={() => toggleTypeFilter(t.value)}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm"
                onClick={() => setTypeFilterEnabled(initialTypeFilters())}
              >
                重置为全选
              </Button>
            </CardContent>
          </Card>

          {DOC_TYPE_FILTERS.every((t) => !typeFilterEnabled[t.value]) ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                请至少勾选一种文档类型，或点击「重置为全选」
              </CardContent>
            </Card>
          ) : filteredDocuments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                当前筛选条件下没有文档
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={allSelectableSelected}
                    onChange={toggleSelectAll}
                    disabled={batchBusy || selectableDocs.length === 0}
                  />
                  全选
                  <span className="text-muted-foreground font-normal">
                    （{selectedIds.size}/{selectableDocs.length}）
                  </span>
                </label>
                <div className="h-4 w-px bg-border hidden sm:block" />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={batchBusy || batchParseableCount === 0}
                  onClick={handleBatchParse}
                >
                  {batchBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `批量解析${batchParseableCount > 0 ? ` (${batchParseableCount})` : ""}`
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={batchBusy || batchDeletableCount === 0}
                  className="text-destructive hover:text-destructive"
                  onClick={handleBatchDelete}
                >
                  {batchBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `批量删除${batchDeletableCount > 0 ? ` (${batchDeletableCount})` : ""}`
                  )}
                </Button>
              </div>

              <div className="grid gap-4">
                {filteredDocuments.map((doc) => {
                  const isProcessing = doc.parseStatus === "processing";
                  const isSelected = selectedIds.has(doc.id);
                  return (
                    <Card
                      key={doc.id}
                      className={cn(isSelected && "ring-2 ring-primary/30 border-primary/40")}
                    >
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                            checked={isSelected}
                            disabled={isProcessing || batchBusy}
                            onChange={() => toggleRow(doc)}
                            aria-label={`选择 ${doc.name}`}
                          />
                          <FileText className="h-5 w-5 text-primary shrink-0" />
                          <div className="min-w-0">
                            <CardTitle className="text-base truncate">{doc.name}</CardTitle>
                            <CardDescription>
                              {getDocTypeLabel(doc.docType)} ·
                              {new Date(doc.createdAt).toLocaleDateString("zh-CN")}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 shrink-0 flex-wrap justify-end">
                          <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                            <div className="flex items-center gap-2">
                              {getParseStatusIcon(doc.parseStatus)}
                              <span className="text-sm text-muted-foreground whitespace-nowrap">
                                {doc.parseStatus === "processing"
                                  ? `${getParseStatusLabel(doc.parseStatus)} ${parseProgressPercent(doc.taskProgress)}%`
                                  : getParseStatusLabel(doc.parseStatus)}
                              </span>
                            </div>
                            {doc.parseStatus === "processing" && (
                              <div className="w-24 shrink-0">
                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                  <div
                                    className="h-full bg-primary transition-[width] duration-300"
                                    style={{
                                      width: `${parseProgressPercent(doc.taskProgress)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          {doc.parseStatus === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleParsePending(doc.id)}
                              disabled={parsingIds.includes(doc.id) || batchBusy}
                            >
                              {parsingIds.includes(doc.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "解析"
                              )}
                            </Button>
                          )}
                          {doc.parseStatus === "failed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReparse(doc.id)}
                              disabled={parsingIds.includes(doc.id) || batchBusy}
                            >
                              {parsingIds.includes(doc.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-1" />
                                  重新解析
                                </>
                              )}
                            </Button>
                          )}
                          {doc.parseStatus === "completed" && (
                            <Link href={`/projects/${projectId}/documents/${doc.id}`}>
                              <Button size="sm" variant="outline" disabled={batchBusy}>
                                查看详情
                              </Button>
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(doc.id, doc.name)}
                            disabled={
                              deletingIds.includes(doc.id) ||
                              doc.parseStatus === "processing" ||
                              batchBusy
                            }
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            {deletingIds.includes(doc.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

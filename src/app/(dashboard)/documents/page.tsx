"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { FileText, Loader2, CheckCircle, XCircle, Clock, FolderOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { clampPercent, formatDateCN } from "@/lib/ui/format";
import { docTypeLabel, parseStatusLabel } from "@/lib/ui/labels";
import { TruncatedText } from "@/components/ui/truncated-text";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDashboardScrollRestoration } from "@/hooks/use-dashboard-scroll-restoration";

interface Document {
  id: string;
  name: string;
  docType: string;
  parseStatus: string;
  taskProgress?: number | null;
  projectId: string;
  project?: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [parseStatus, setParseStatus] = useState<string>("");
  const { saveNow } = useDashboardScrollRestoration(`documents?q=${q}&status=${parseStatus}`);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await fetch("/api/documents");
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error("获取文档列表失败:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const hasProcessing = documents.some((d) => d.parseStatus === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const id = window.setInterval(() => void fetchDocuments(), 4000);
    return () => window.clearInterval(id);
  }, [hasProcessing, fetchDocuments]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return documents.filter((d) => {
      if (parseStatus && d.parseStatus !== parseStatus) return false;
      if (!query) return true;
      const hay = `${d.name} ${d.project?.name ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [documents, q, parseStatus]);

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (parseStatus) {
    chips.push({
      key: "status",
      label: `解析状态：${parseStatusLabel(parseStatus, 0)}`,
      onRemove: () => setParseStatus(""),
    });
  }
  if (q.trim()) {
    chips.push({
      key: "q",
      label: `搜索：${q.trim()}`,
      onRemove: () => setQ(""),
    });
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

  return (
    <div className="space-y-6">
      {/* 吸顶筛选条 */}
      <div className="sticky top-0 z-10 -mx-6 border-b bg-background/85 px-6 py-4 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 min-w-0">
            <label className="text-sm text-muted-foreground">搜索（文档名/项目名）</label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="输入关键词…" />
          </div>
          <div className="w-full md:w-[200px]">
            <label className="text-sm text-muted-foreground">解析状态</label>
            <select
              value={parseStatus}
              onChange={(e) => setParseStatus(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">全部</option>
              <option value="processing">解析中</option>
              <option value="completed">已解析</option>
              <option value="failed">解析失败</option>
              <option value="pending">待解析</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                setParseStatus("");
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
          <h2 className="text-3xl font-bold tracking-tight">文件管理</h2>
          <p className="text-muted-foreground">
            查看所有项目相关文档
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
              请先创建项目并上传文档
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
            {hasProcessing && (
              <Badge variant="outline" title="解析中会自动刷新">
                自动刷新中
              </Badge>
            )}
          </div>

          {filtered.map((doc) => (
            <Link
              key={doc.id}
              href={`/documents/${doc.id}`}
              onClick={() => saveNow()}
            >
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-4">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">
                        <TruncatedText text={doc.name} />
                      </CardTitle>
                      <CardDescription>
                        {docTypeLabel(doc.docType)} ·
                        {doc.project?.name && (
                          <span className="ml-2">
                            <FolderOpen className="inline h-3 w-3 mr-1" />
                            <TruncatedText text={doc.project.name} className="inline-block max-w-[260px] align-bottom" />
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-2">
                      {getParseStatusIcon(doc.parseStatus)}
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {parseStatusLabel(doc.parseStatus, clampPercent(doc.taskProgress))}
                      </span>
                    </div>
                    {doc.parseStatus === "processing" && (
                      <div className="w-28 shrink-0">
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary transition-[width] duration-300"
                            style={{
                              width: `${clampPercent(doc.taskProgress)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDateCN(doc.createdAt)}
                    </span>
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
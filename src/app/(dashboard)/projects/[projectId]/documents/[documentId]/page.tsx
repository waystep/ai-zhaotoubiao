"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Blocks,
  CheckCircle,
  Clock,
  FileImage,
  FileText,
  Loader2,
  Play,
  Table,
  Trash2,
  XCircle,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PdfViewer } from "@/components/document/pdf-viewer";
import { useToast } from "@/hooks/use-toast";

interface ParsedBlock {
  id: string;
  pageNumber: number;
  blockIndex: number;
  blockType: string | null;
  content: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface ParsedResult {
  id?: string;
  totalPages: number;
  fullText: string | null;
  structuredContent?: {
    title?: string;
    sections?: Array<{
      id: string;
      title: string;
      content: string;
      pageNumber: number;
      level: number;
    }>;
  };
  blocks: ParsedBlock[];
}

interface DocumentDetail {
  id: string;
  name: string;
  docType: string;
  parseStatus: string;
  parseError: string | null;
  parsedAt: string | null;
  originalName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  taskProgress?: number;
  warning?: string;
}

interface ExtractedItem {
  id: string;
  itemNo?: string | null;
  title: string;
  description: string;
  itemType?: string;
  responseType?: string;
  consequence?: string | null;
  legalReference?: string | null;
  extractionConfidence?: string | number | null;
  sourceBlock?: ParsedBlock | null;
  location?: {
    pageNumber?: number;
    blockIndex?: number;
  };
}

interface ExtractionResult {
  reviewItems: ExtractedItem[];
  responseItems: ExtractedItem[];
  summary?: {
    reviewItemsTotal: number;
    responseItemsTotal: number;
  };
}

function parseProgressPercent(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getDocTypeLabel(docType: string) {
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
}

function getParseStatusLabel(status: string) {
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
}

function getParseStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-emerald-600" />;
    case "processing":
      return <Loader2 className="h-4 w-4 animate-spin text-amber-600" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-600" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function getBlockTypeIcon(type: string | null) {
  switch (type) {
    case "table":
      return <Table className="h-4 w-4 text-blue-600" />;
    case "image":
    case "figure":
      return <FileImage className="h-4 w-4 text-emerald-600" />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
}

function confidenceLabel(value: string | number | null | undefined) {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? `${Math.round(n * 100)}%` : `${Math.round(n)}%`;
}

function rewriteMarkdownImageUrls(markdown: string, documentId: string) {
  const toApiUrl = (raw: string) => {
    if (/^(https?:|data:|\/api\/images\/|\/)/i.test(raw)) return raw;
    const normalized = raw.replace(/^\.?\//, "");
    if (!normalized.startsWith("images/")) return raw;
    const filename = normalized.slice("images/".length);
    return `/api/images/${documentId}/${encodeURIComponent(filename)}`;
  };

  return markdown
    .replace(/!\[([^\]]*)\]\((images\/[^)\s]+)\)/g, (_m, alt, src) => `![${alt}](${toApiUrl(src)})`)
    .replace(/(<img\b[^>]*\bsrc=["'])(images\/[^"']+)(["'][^>]*>)/gi, (_m, prefix, src, suffix) => `${prefix}${toApiUrl(src)}${suffix}`);
}

function ExtractedItemList({
  items,
  emptyText,
  type,
}: {
  items: ExtractedItem[];
  emptyText: string;
  type: "review" | "response";
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pageNumber = item.location?.pageNumber ?? item.sourceBlock?.pageNumber;
        const blockIndex = item.location?.blockIndex ?? item.sourceBlock?.blockIndex;
        const confidence = confidenceLabel(item.extractionConfidence);
        return (
          <div key={item.id} className="rounded-md border bg-background p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{type === "review" ? item.itemType : item.responseType}</Badge>
              {item.itemNo && <Badge variant="outline">{item.itemNo}</Badge>}
              {pageNumber ? <Badge variant="outline">P.{pageNumber}</Badge> : null}
              {blockIndex != null ? (
                <span className="text-xs text-muted-foreground">#{blockIndex}</span>
              ) : null}
              {confidence ? (
                <span className="ml-auto text-xs text-muted-foreground">置信度 {confidence}</span>
              ) : null}
            </div>
            <div className="text-sm font-medium leading-6">{item.title}</div>
            <p className="mt-1 line-clamp-4 text-sm leading-6 text-muted-foreground">
              {item.description}
            </p>
            {type === "review" && (item.consequence || item.legalReference) ? (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {item.consequence ? <p>后果：{item.consequence}</p> : null}
                {item.legalReference ? <p>依据：{item.legalReference}</p> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const documentId = params.documentId as string;
  const { toast } = useToast();

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult>({
    reviewItems: [],
    responseItems: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [focusedBlock, setFocusedBlock] = useState<ParsedBlock | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchExtractionResult = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/extract`);
      if (!response.ok) return;
      const data = await response.json();
      setExtractionResult({
        reviewItems: data.reviewItems ?? [],
        responseItems: data.responseItems ?? [],
        summary: data.summary,
      });
    } catch (error) {
      console.error("获取提取结果失败:", error);
    }
  }, [documentId]);

  const fetchDocumentDetail = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/parse`);
      if (response.ok) {
        const data = await response.json();
        setDocument(data.document);
        setParsedResult(data.parsedResult);
        if (data.document?.parseStatus === "completed") {
          void fetchExtractionResult();
        }
        if (data.document?.parseStatus === "processing") {
          setIsParsing(true);
        }
      }
    } catch (error) {
      console.error("获取文档详情失败:", error);
    } finally {
      setIsLoading(false);
    }
  }, [documentId, fetchExtractionResult]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/parse`);
        if (!response.ok) return;

        const data = await response.json();
        setDocument(data.document);

        if (data.taskCompleted || data.document?.parseStatus === "completed") {
          stopPolling();
          setIsParsing(false);
          setParsedResult(data.parsedResult);
          void fetchExtractionResult();
          toast({
            title: "解析完成",
            description: `共 ${data.parsedResult?.totalPages ?? 0} 页，${data.parsedResult?.blocks?.length ?? 0} 个区块`,
          });
        } else if (data.document?.parseStatus === "failed") {
          stopPolling();
          setIsParsing(false);
          toast({
            title: "解析失败",
            description: data.document.parseError || "文档解析失败",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("轮询解析状态失败:", error);
      }
    }, 3000);
  }, [documentId, fetchExtractionResult, stopPolling, toast]);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    void fetchDocumentDetail();
    return stopPolling;
  }, [fetchDocumentDetail, stopPolling]);

  async function handleParse() {
    setIsParsing(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/parse`, {
        method: "POST",
      });

      if (response.ok) {
        toast({
          title: "任务已提交",
          description: "文档解析任务已提交，处理完成后会自动刷新。",
        });
        startPolling();
      } else {
        const error = await response.json();
        toast({
          title: "提交失败",
          description: error.error || error.details,
          variant: "destructive",
        });
        setIsParsing(false);
      }
    } catch {
      toast({
        title: "网络错误",
        description: "请检查网络连接",
        variant: "destructive",
      });
      setIsParsing(false);
    }
  }

  async function handleDelete() {
    if (!confirm("确定要删除此文档吗？此操作不可撤销。")) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "删除成功",
          description: "文档已删除",
        });
        router.push(`/projects/${projectId}`);
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
        description: "请检查网络连接",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  const markdown = useMemo(() => {
    const text = parsedResult?.fullText?.trim();
    if (!text) return "";
    return rewriteMarkdownImageUrls(text, documentId);
  }, [documentId, parsedResult?.fullText]);

  const focusedIssue = useMemo(() => {
    if (!focusedBlock) return null;
    return {
      pageNumber: focusedBlock.pageNumber,
      blockIndex: focusedBlock.blockIndex,
      bbox: focusedBlock.bbox,
      textSnippet: focusedBlock.content?.slice(0, 120),
    };
  }, [focusedBlock]);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!document) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">文档不存在</h3>
          <Button onClick={() => router.push(`/projects/${projectId}`)}>返回项目详情</Button>
        </CardContent>
      </Card>
    );
  }

  const blockCount = parsedResult?.blocks.length ?? 0;
  const totalPages = parsedResult?.totalPages ?? 0;
  const totalExtracted =
    extractionResult.reviewItems.length + extractionResult.responseItems.length;

  return (
    <div className="space-y-5">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/projects/${projectId}`)}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回项目详情
        </Button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="max-w-4xl truncate text-2xl font-semibold tracking-tight">
                {document.originalName}
              </h2>
              <Badge variant="secondary" className="gap-1">
                {getParseStatusIcon(document.parseStatus)}
                {getParseStatusLabel(document.parseStatus)}
              </Badge>
              {totalPages > 0 ? <Badge variant="outline">{totalPages} 页</Badge> : null}
              {blockCount > 0 ? <Badge variant="outline">{blockCount} 区块</Badge> : null}
              {totalExtracted > 0 ? <Badge variant="outline">{totalExtracted} 已提取</Badge> : null}
              {document.warning ? (
                <Badge variant="outline" className="border-amber-500 text-amber-700">
                  {document.warning}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {getDocTypeLabel(document.docType)} · {(document.fileSize / 1024 / 1024).toFixed(2)} MB ·{" "}
              {document.parsedAt
                ? new Date(document.parsedAt).toLocaleDateString("zh-CN")
                : "未解析"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {document.parseStatus === "pending" || document.parseStatus === "failed" ? (
              <Button onClick={handleParse} disabled={isParsing}>
                {isParsing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                {document.parseStatus === "failed" ? "重新解析" : "开始解析"}
              </Button>
            ) : null}
            {document.parseStatus === "processing" ? (
              <div className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                <span className="font-medium">{parseProgressPercent(document.taskProgress)}%</span>
              </div>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting || isParsing || document.parseStatus === "processing"}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              删除文档
            </Button>
          </div>
        </div>
      </div>

      {document.parseStatus === "failed" && document.parseError ? (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              解析失败
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700">{document.parseError}</p>
          </CardContent>
        </Card>
      ) : null}

      {document.parseStatus === "pending" ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">文档待解析</h3>
            <p className="mb-4 text-center text-sm text-muted-foreground">
              解析完成后可查看源文件、区块详情、全文 Markdown 与提取信息。
            </p>
            <Button onClick={handleParse} disabled={isParsing}>
              {isParsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              开始解析
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {document.parseStatus === "processing" ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="mb-4 h-12 w-12 animate-spin text-muted-foreground" />
            <h3 className="mb-3 text-lg font-semibold">
              文档正在解析 · {parseProgressPercent(document.taskProgress)}%
            </h3>
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${parseProgressPercent(document.taskProgress)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {document.parseStatus === "completed" && parsedResult ? (
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">文档导航</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0">
              <Tabs defaultValue="blocks" className="min-h-0">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="blocks" className="gap-1">
                    <Blocks className="h-4 w-4" />
                    区块详情
                  </TabsTrigger>
                  <TabsTrigger value="extracted" className="gap-1">
                    <FileText className="h-4 w-4" />
                    已提取信息
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="blocks" className="mt-4">
                  <div className="mb-3 text-xs text-muted-foreground">
                    共 {blockCount} 个区块，点击后定位到右侧源文件预览。
                  </div>
                  <div className="max-h-[calc(100vh-13rem)] space-y-2 overflow-y-auto pr-1">
                    {parsedResult.blocks.map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        className="w-full rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
                        onClick={() => {
                          setFocusedBlock(block);
                          setCurrentPage(block.pageNumber);
                        }}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          {getBlockTypeIcon(block.blockType)}
                          <Badge variant="outline">P.{block.pageNumber}</Badge>
                          <Badge variant="secondary">{block.blockType || "text"}</Badge>
                          <span className="ml-auto text-xs text-muted-foreground">
                            #{block.blockIndex}
                          </span>
                        </div>
                        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                          {block.content || "（无文本内容）"}
                        </p>
                      </button>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="extracted" className="mt-4">
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-muted/50 p-2">
                      <div className="text-muted-foreground">应答项</div>
                      <div className="text-lg font-semibold">{extractionResult.responseItems.length}</div>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <div className="text-muted-foreground">审查项</div>
                      <div className="text-lg font-semibold">{extractionResult.reviewItems.length}</div>
                    </div>
                  </div>
                  <div className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto pr-1">
                    <section>
                      <h3 className="mb-2 text-sm font-medium">应答项</h3>
                      <ExtractedItemList
                        type="response"
                        items={extractionResult.responseItems}
                        emptyText="暂无应答项。"
                      />
                    </section>
                    <section>
                      <h3 className="mb-2 text-sm font-medium">审查项</h3>
                      <ExtractedItemList
                        type="review"
                        items={extractionResult.reviewItems}
                        emptyText="暂无审查项。"
                      />
                    </section>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-4">
            <Card className="bg-muted/20 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">源文件预览</CardTitle>
              </CardHeader>
              <CardContent>
                <PdfViewer
                  documentId={documentId}
                  blocks={parsedResult.blocks}
                  highlightedIssues={focusedIssue ? [focusedIssue] : []}
                  focusedIssue={focusedIssue}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  onFocusedIssueConsumed={() => setFocusedBlock(null)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">全文内容</CardTitle>
              </CardHeader>
              <CardContent>
                {markdown ? (
                  <div className="max-h-[720px] overflow-y-auto rounded-md border bg-background p-5">
                    <Streamdown
                      className="prose prose-sm max-w-none dark:prose-invert prose-img:max-w-full prose-img:rounded-md"
                      plugins={{ cjk }}
                    >
                      {markdown}
                    </Streamdown>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                    暂无全文内容。
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

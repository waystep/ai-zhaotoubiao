"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock,
  FileImage,
  FileText,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PdfViewer, type IssueLocation } from "@/components/document/pdf-viewer";
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
  itemCategory?: string; // "review" | "response"
  responseType?: string;
  consequence?: string | null;
  legalReference?: string | null;
  extractionConfidence?: string | number | null;
  sourceBlock?: ParsedBlock | null;
  location?: {
    pageNumber?: number;
    blockIndex?: number;
    bbox?: { x0: number; y0: number; x1: number; y1: number } | null;
  };
}

interface ExtractionResult {
  items: ExtractedItem[]; // unified items from extraction_items table
  reviewItems: ExtractedItem[]; // backward compat
  responseItems: ExtractedItem[];
  extractionStatus?: string;
  extractionError?: string | null;
  summary?: {
    total: number;
    reviewTotal: number;
    responseTotal: number;
    itemTypes: string[];
  };
}

interface ImageRiskItem {
  id: string;
  imagePath: string;
  pageNumber: number;
  status: string;
  hasRisk: boolean | null;
  riskType: string | null;
  riskText: string | null;
  confidence: string | null;
  reason: string | null;
  suggestion: string | null;
  error: string | null;
}

interface ImageRiskResult {
  images: ImageRiskItem[];
  stats: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    hasRisk: number;
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

function confidenceLabel(value: string | number | null | undefined) {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? `${Math.round(n * 100)}%` : `${Math.round(n)}%`;
}

function _unused_rewriteMarkdownImageUrls(markdown: string, documentId: string) {
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

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const documentId = params.documentId as string;
  const { toast } = useToast();

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult>({
    items: [],
    reviewItems: [],
    responseItems: [],
  });
  const [imageRiskResult, setImageRiskResult] = useState<ImageRiskResult>({
    images: [],
    stats: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, hasRisk: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [focusedIssue, setFocusedIssue] = useState<IssueLocation | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchExtractionResult = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/extract`);
      if (!response.ok) return;
      const data = await response.json();
      setExtractionResult({
        items: data.items ?? data.reviewItems?.concat(data.responseItems ?? []) ?? [],
        reviewItems: data.reviewItems ?? [],
        responseItems: data.responseItems ?? [],
        extractionStatus: data.document?.extractionStatus,
        extractionError: data.document?.extractionError,
        summary: data.summary,
      });
    } catch (error) {
      console.error("获取提取结果失败:", error);
    }
  }, [documentId]);

  const fetchImageRiskResult = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/images`);
      if (!response.ok) return;
      const data = await response.json();
      setImageRiskResult({
        images: data.images ?? [],
        stats: data.stats ?? { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, hasRisk: 0 },
      });
    } catch (error) {
      console.error("获取图片风险分析失败:", error);
    }
  }, [documentId]);

  const fetchFullParsedResult = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/blocks`);
      if (!response.ok) return;
      const data = await response.json();
      setParsedResult((prev) => ({
        id: prev?.id,
        totalPages: data.totalPages ?? prev?.totalPages ?? 0,
        fullText: data.fullText ?? prev?.fullText ?? null,
        structuredContent: prev?.structuredContent,
        blocks: data.blocks ?? [],
      }));
    } catch (error) {
      console.error("获取完整区块失败:", error);
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
          void fetchFullParsedResult();
          void fetchExtractionResult();
          // 投标文件才需要图片风险分析
          if (data.document?.docType === "bid_doc") {
            void fetchImageRiskResult();
          }
        }
        if (data.document?.parseStatus === "processing") {
          setIsParsing(true);
        }
        // 自动生成页面嵌入（如尚未生成）
        void ensureEmbeddings();
      }
    } catch (error) {
      console.error("获取文档详情失败:", error);
    } finally {
      setIsLoading(false);
    }
  }, [documentId, fetchExtractionResult, fetchFullParsedResult, fetchImageRiskResult]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const ensureEmbeddings = useCallback(async () => {
    try {
      // 检查是否已有嵌入
      const res = await fetch(`/api/documents/${documentId}/embeddings`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.hasEmbeddings) return; // 已有，跳过
      // 触发后台生成
      fetch(`/api/documents/${documentId}/embeddings`, { method: "POST" }).catch(() => {});
    } catch {
      // 静默失败，不影响主流程
    }
  }, [documentId]);

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
          void fetchFullParsedResult();
          void fetchExtractionResult();
          // 投标文件才需要图片风险分析
          if (data.document?.docType === "bid_doc") {
            void fetchImageRiskResult();
          }
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
  }, [documentId, fetchExtractionResult, fetchFullParsedResult, fetchImageRiskResult, stopPolling, toast]);

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
        router.push(`/projects/${projectId}/documents`);
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

  async function handleExtract() {
    setIsExtracting(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/extract`, {
        method: "POST",
      });

      if (response.ok) {
        toast({
          title: "提取完成",
          description: "已完成审查项和应答项提取。",
        });
        await fetchExtractionResult();
      } else {
        const error = await response.json();
        toast({
          title: "提取失败",
          description: error.error || error.details || "提取智能体执行失败",
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
      setIsExtracting(false);
    }
  }

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
          <h3 className="mb-2 text-h5">文档不存在</h3>
          <Button onClick={() => router.push(`/projects/${projectId}/documents`)}>返回文档列表</Button>
        </CardContent>
      </Card>
    );
  }

  const blockCount = parsedResult?.blocks.length ?? 0;
  const totalPages = parsedResult?.totalPages ?? 0;
  const totalExtracted = extractionResult.items.length;
  const shouldShowExtractedTab = document.docType !== "bid_doc";

  return (
    <div className="space-y-5">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/projects/${projectId}/documents`)}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回文档列表
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
              {shouldShowExtractedTab && totalExtracted > 0 ? (
                <Badge variant="outline">{totalExtracted} 已提取</Badge>
              ) : null}
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
            <h3 className="mb-2 text-h5">文档待解析</h3>
            <p className="mb-4 text-center text-sm text-muted-foreground">
              解析完成后可查看源文件、全文内容与提取信息。
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
            <h3 className="mb-3 text-h5">
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
              <Tabs defaultValue={document.docType === "bid_doc" ? "imageRisks" : "extracted"} className="min-h-0">
                <TabsList className="grid w-full grid-cols-1">
                  {document.docType === "bid_doc" ? (
                    <TabsTrigger value="imageRisks" className="gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      图片风险
                      {imageRiskResult.stats.hasRisk > 0 ? (
                        <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-xs">
                          {imageRiskResult.stats.hasRisk}
                        </Badge>
                      ) : null}
                    </TabsTrigger>
                  ) : null}
                  {shouldShowExtractedTab ? (
                    <TabsTrigger value="extracted" className="gap-1">
                      <FileText className="h-4 w-4" />
                      已提取信息
                    </TabsTrigger>
                  ) : null}
                </TabsList>

                {document.docType === "bid_doc" ? (
                  <TabsContent value="imageRisks" className="mt-4">
                    <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md bg-muted/50 p-2">
                        <div className="text-muted-foreground">总图片</div>
                        <div className="text-h5">{imageRiskResult.stats.total}</div>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <div className="text-muted-foreground">已完成</div>
                        <div className="text-h5">{imageRiskResult.stats.completed}</div>
                      </div>
                      <div className="rounded-md bg-red-50 p-2">
                        <div className="text-red-600">有风险</div>
                        <div className="text-h5 text-red-600">{imageRiskResult.stats.hasRisk}</div>
                      </div>
                    </div>
                    {imageRiskResult.images.length === 0 ? (
                      <div className="rounded-md border border-dashed p-4">
                        <div className="text-sm font-medium">暂无图片风险分析</div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          文档解析完成后，系统将自动分析图片中的潜在风险（如企业Logo、水印等）。
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto pr-1">
                        {imageRiskResult.images.map((image) => (
                          <div
                            key={image.id}
                            className="rounded-md border bg-background p-3"
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <FileImage className="h-4 w-4 text-muted-foreground" />
                              <Badge variant="outline">P.{image.pageNumber}</Badge>
                              {image.status === "pending" ? (
                                <Badge variant="secondary" className="text-xs">待分析</Badge>
                              ) : image.status === "processing" ? (
                                <Badge variant="secondary" className="text-xs">
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  分析中
                                </Badge>
                              ) : image.status === "failed" ? (
                                <Badge variant="destructive" className="text-xs">失败</Badge>
                              ) : image.hasRisk ? (
                                <Badge variant="destructive" className="text-xs gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  有风险
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs text-emerald-600">无风险</Badge>
                              )}
                            </div>
                            {image.status === "completed" && image.hasRisk ? (
                              <div className="space-y-1 text-sm">
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground">风险类型:</span>
                                  <span className="font-medium">{image.riskType}</span>
                                </div>
                                {image.riskText ? (
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground">风险文字:</span>
                                    <span className="font-medium">{image.riskText}</span>
                                  </div>
                                ) : null}
                                {image.confidence ? (
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground">置信度:</span>
                                    <span>{Number(image.confidence) <= 1 ? `${Math.round(Number(image.confidence) * 100)}%` : `${Math.round(Number(image.confidence))}%`}</span>
                                  </div>
                                ) : null}
                                {image.reason ? (
                                  <p className="mt-1 text-muted-foreground">{image.reason}</p>
                                ) : null}
                              </div>
                            ) : image.status === "failed" ? (
                              <p className="text-sm text-red-600">{image.error}</p>
                            ) : null}
                            <div className="mt-2 text-xs text-muted-foreground truncate">
                              {image.imagePath}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                ) : null}

                {shouldShowExtractedTab ? (
                  <TabsContent value="extracted" className="mt-4">
                    <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-muted/50 p-2">
                        <div className="text-muted-foreground">审查项</div>
                        <div className="text-h5">{extractionResult.summary?.reviewTotal ?? extractionResult.reviewItems.length}</div>
                      </div>
                      <div className="rounded-md bg-muted/50 p-2">
                        <div className="text-muted-foreground">应答项</div>
                        <div className="text-h5">{extractionResult.summary?.responseTotal ?? extractionResult.responseItems.length}</div>
                      </div>
                    </div>
                    {totalExtracted === 0 ? (
                      <div className="mb-4 rounded-md border border-dashed p-4">
                        <div className="text-sm font-medium">暂无已提取信息</div>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          可调用提取智能体，从当前文档中提取审查项和应答项。
                        </p>
                        {extractionResult.extractionError ? (
                          <p className="mt-2 text-xs text-destructive">
                            上次提取失败：{extractionResult.extractionError}
                          </p>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          className="mt-3"
                          onClick={handleExtract}
                          disabled={isExtracting}
                        >
                          {isExtracting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-4 w-4" />
                          )}
                          发起提取
                        </Button>
                      </div>
                    ) : null}
                    <div className="max-h-[calc(100vh-14rem)] space-y-3 overflow-y-auto pr-1">
                      {extractionResult.items.map((item) => {
                        const isReview = item.itemCategory === "review";
                        const pageNumber = item.location?.pageNumber ?? item.sourceBlock?.pageNumber;
                        const blockIndex = item.location?.blockIndex ?? item.sourceBlock?.blockIndex;
                        const confidence = confidenceLabel(item.extractionConfidence);
                        const locPage = item.location?.pageNumber ?? item.sourceBlock?.pageNumber ?? 0;
                        const locIdx = item.location?.blockIndex ?? item.sourceBlock?.blockIndex ?? 0;
                        const locBbox = item.location?.bbox ?? item.sourceBlock?.bbox;
                        const canLocate = locPage > 0;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={!canLocate}
                            className={`w-full rounded-md border bg-background p-3 text-left transition-colors ${
                              canLocate ? "hover:border-primary/40 hover:bg-muted/40 cursor-pointer" : ""
                            }`}
                            onClick={() => {
                              if (!canLocate) return;
                              setCurrentPage(locPage);
                              setFocusedIssue({
                                pageNumber: locPage,
                                blockIndex: locIdx,
                                bbox: locBbox || undefined,
                                textSnippet: item.title,
                              });
                            }}
                            title={canLocate ? "点击定位到原文" : "无定位信息"}
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <Badge variant={isReview ? "destructive" : "secondary"}>
                                {isReview ? "审查项" : "应答项"}
                              </Badge>
                              <Badge variant="secondary">{item.itemType}</Badge>
                              {(item as any).bidSection && (
                                <Badge variant="outline" className="border-blue-300 text-blue-700">
                                  {(item as any).bidSection}
                                </Badge>
                              )}
                              {item.itemNo && <Badge variant="outline">{item.itemNo}</Badge>}
                              {pageNumber ? <Badge variant="outline">P.{pageNumber}</Badge> : null}
                              {blockIndex != null ? (
                                <span className="text-xs text-muted-foreground">#{blockIndex}</span>
                              ) : null}
                              {(item as any).sourceBlockId && (
                                <span className="ml-auto text-xs text-emerald-600" title="已关联原始区块">
                                  已定位
                                </span>
                              )}
                              {confidence ? (
                                <span className="ml-auto text-xs text-muted-foreground">置信度 {confidence}</span>
                              ) : null}
                            </div>
                            <div className="text-sm font-medium leading-6">{item.title}</div>
                            <p className="mt-1 line-clamp-4 text-sm leading-6 text-muted-foreground">
                              {item.description}
                            </p>
                            {isReview && item.consequence ? (
                              <p className="mt-1 text-xs text-destructive">
                                后果：{item.consequence}
                              </p>
                            ) : null}
                            {isReview && item.legalReference ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                依据：{item.legalReference}
                              </p>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </TabsContent>
                ) : null}
              </Tabs>
            </CardContent>
          </Card>

          <Card className="min-w-0 bg-muted/20 shadow-sm">
            <CardContent className="p-4">
              <PdfViewer
                documentId={documentId}
                blocks={parsedResult.blocks}
                focusedIssue={focusedIssue}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onFocusedIssueConsumed={() => setFocusedIssue(null)}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

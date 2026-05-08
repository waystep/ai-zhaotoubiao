"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft,
  Play,
  Eye,
  Table,
  FileImage,
  Calculator,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PdfViewer } from "@/components/document/pdf-viewer";

interface ParsedBlock {
  id: string;
  pageNumber: number;
  blockIndex: number;
  blockType: string;
  content: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface ParsedResult {
  id: string;
  totalPages: number;
  fullText: string;
  structuredContent: {
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

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const documentId = params.documentId as string;
  const { toast } = useToast();

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  // 使用 ref 防止 StrictMode 下重复调用
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchDocumentDetail();
  }, [documentId]);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);

  async function fetchDocumentDetail() {
    try {
      const response = await fetch(`/api/documents/${documentId}/parse`);
      if (response.ok) {
        const data = await response.json();
        setDocument(data.document);
        setParsedResult(data.parsedResult);

        // processing状态 - 启动轮询
        if (data.document.parseStatus === "processing") {
          setIsParsing(true);
          startPolling();
        }
      }
    } catch (error) {
      console.error("获取文档详情失败:", error);
    } finally {
      setIsLoading(false);
    }
  }

  function startPolling() {
    // 清理现有interval
    if (pollInterval) {
      clearInterval(pollInterval);
    }

    // 每3秒轮询
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/parse`);

        if (response.ok) {
          const data = await response.json();

          // 更新进度
          setDocument(data.document);

          if (data.taskCompleted) {
            // 完成 - 停止轮询
            clearInterval(interval);
            setPollInterval(null);
            setIsParsing(false);

            if (data.parsedResult) {
              setParsedResult(data.parsedResult);
              toast({
                title: "解析完成",
                description: `文档解析完成，共 ${data.parsedResult.totalPages} 页，${data.parsedResult.blocksCount || 0} 个区块`,
              });
            }
          } else if (data.document.parseStatus === "failed") {
            // 失败 - 停止轮询
            clearInterval(interval);
            setPollInterval(null);
            setIsParsing(false);

            toast({
              title: "解析失败",
              description: data.document.parseError || "解析失败",
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        console.error("轮询失败:", error);
        // 不停止轮询，下次间隔重试
      }
    }, 3000);

    setPollInterval(interval);

    // 超时保护：10分钟后停止
    setTimeout(() => {
      if (pollInterval) {
        clearInterval(interval);
        setPollInterval(null);
        setIsParsing(false);
        toast({
          title: "解析超时",
          description: "任务处理时间过长，请刷新页面检查状态",
          variant: "destructive",
        });
      }
    }, 600000);
  }

  async function handleParse() {
    setIsParsing(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/parse`, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "任务已提交",
          description: "文档解析任务已提交，正在处理中...",
        });

        // 启动轮询
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
        description: "请检查您的网络连接",
        variant: "destructive",
      });
      setIsParsing(false);
    }
  }

  async function handleDelete() {
    if (!confirm("确定要删除此文档吗？此操作不可撤销。")) {
      return;
    }

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
        description: "请检查您的网络连接",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
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

  const getBlockTypeIcon = (type: string) => {
    switch (type) {
      case "title":
        return <FileText className="h-4 w-4 text-primary" />;
      case "table":
        return <Table className="h-4 w-4 text-blue-500" />;
      case "image":
        return <FileImage className="h-4 w-4 text-green-500" />;
      case "equation":
        return <Calculator className="h-4 w-4 text-purple-500" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!document) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">文档不存在</h3>
          <Button onClick={() => router.push(`/projects/${projectId}`)}>
            返回项目详情
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <h2 className="text-3xl font-bold tracking-tight">{document.originalName}</h2>
              <p className="text-muted-foreground">
                {getDocTypeLabel(document.docType)}{` · `}
                {(document.fileSize / 1024 / 1024).toFixed(2)} MB{` · `}
                {new Date(document.parsedAt).toLocaleDateString("zh-CN")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {getParseStatusIcon(document.parseStatus)}
              <span className="text-sm font-medium">
                {getParseStatusLabel(document.parseStatus)}
              </span>
            </div>
            {document.parseStatus === "pending" && (
              <Button onClick={handleParse} disabled={isParsing}>
                {isParsing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    解析中...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    开始解析
                  </>
                )}
              </Button>
            )}
            {document.parseStatus === "processing" && (
              <>
                <Button variant="outline" onClick={fetchDocumentDetail}>
                  刷新状态
                </Button>
                {document.taskProgress !== undefined && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                    <span className="text-sm font-medium">{document.taskProgress}%</span>
                  </div>
                )}
              </>
            )}
            {document.warning && (
              <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                {document.warning}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting || isParsing || document.parseStatus === "processing"}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除文档
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* 解析错误提示 */}
      {document.parseStatus === "failed" && document.parseError && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              解析失败
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{document.parseError}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={handleParse}
              disabled={isParsing}
            >
              重新解析
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 解析结果 */}
      {document.parseStatus === "completed" && parsedResult && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="source">源文件预览</TabsTrigger>
            <TabsTrigger value="content">全文内容</TabsTrigger>
            <TabsTrigger value="blocks">区块详情</TabsTrigger>
          </TabsList>

          {/* 概览 */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">总页数</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{parsedResult.totalPages}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">区块数量</CardTitle>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{parsedResult.blocks.length}</div>
                </CardContent>
              </Card>

              {/* <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">文档标题</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-medium truncate">
                    {parsedResult.structuredContent.title || document.originalName}
                  </div>
                </CardContent>
              </Card> */}
            </div>

            {/* 章节列表 */}
            {parsedResult.structuredContent.sections && parsedResult.structuredContent.sections.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>文档结构</CardTitle>
                  <CardDescription>提取的主要章节内容</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {parsedResult.structuredContent.sections.map((section, index) => (
                      <div key={section.id} className="border-b pb-4 last:border-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline">P.{section.pageNumber}</Badge>
                          <h4 className="font-medium" style={{
                            fontSize: `${1.2 - (section.level - 1) * 0.1}rem`
                          }}>
                            {section.title}
                          </h4>
                        </div>
                        <p className="text-muted-foreground text-sm line-clamp-3">
                          {section.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 源文件预览 */}
          <TabsContent value="source">
            <Card className="shadow-sm bg-muted/20">
              <CardHeader>
                <CardTitle>源文件预览</CardTitle>
                <CardDescription>展示原始 PDF 文件（不依赖解析结果）</CardDescription>
              </CardHeader>
              <CardContent>
                <PdfViewer documentId={documentId} blocks={[]} highlightedIssues={[]} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 全文内容 */}
          <TabsContent value="content">
            <Card>
              <CardHeader>
                <CardTitle>全文内容</CardTitle>
                <CardDescription>文档解析提取的完整文本内容</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 rounded-lg p-4 max-h-[600px] overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap font-sans">
                    {parsedResult.fullText}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 区块详情 */}
          <TabsContent value="blocks">
            <Card>
              <CardHeader>
                <CardTitle>区块详情</CardTitle>
                <CardDescription>
                  共 {parsedResult.blocks.length} 个区块，按页码和位置排序
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {parsedResult.blocks.map((block) => (
                    <div
                      key={block.id}
                      className="p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {getBlockTypeIcon(block.blockType)}
                        <Badge variant="outline">P.{block.pageNumber}</Badge>
                        <Badge variant="secondary">{block.blockType}</Badge>
                        <span className="text-xs text-muted-foreground">
                          Index: {block.blockIndex}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-3">
                        {block.content || "(无文本内容)"}
                      </p>
                      {block.bbox && (
                        <p className="text-xs text-muted-foreground mt-2">
                          位置: ({block.bbox.x0}, {block.bbox.y0}) → ({block.bbox.x1}, {block.bbox.y1})
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* 待解析状态 */}
      {document.parseStatus === "pending" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">文档待解析</h3>
            <p className="text-muted-foreground text-center mb-4">
              点击上方「开始解析」按钮，调用 MinerU 解析文档内容
            </p>
            <Button onClick={handleParse} disabled={isParsing}>
              {isParsing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  解析中...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  开始解析
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
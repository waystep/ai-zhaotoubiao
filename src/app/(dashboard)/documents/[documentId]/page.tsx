"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PdfViewer } from "@/components/document/pdf-viewer";
import { useToast } from "@/hooks/use-toast";

interface DocumentBlock {
  id: string;
  pageNumber: number;
  blockIndex: number;
  blockType: string | null;
  content: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

interface ParsedResult {
  id: string;
  totalPages: number;
  fullText: string | null;
  blocks: DocumentBlock[];
}

interface Document {
  id: string;
  name: string;
  docType: string;
  parseStatus: string;
  createdAt: string;
  project?: { id: string; name?: string; projectNo?: string } | null;
}

interface IssueLocation {
  pageNumber: number;
  blockIndex: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  textSnippet?: string;
  highlightText?: string;
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.documentId as string;
  const { toast } = useToast();

  const [document, setDocument] = useState<Document | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isParsing, setIsParsing] = useState(false);

  // 使用 ref 防止 StrictMode 下重复调用
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchDocument();
  }, [documentId]);

  async function fetchDocument() {
    try {
      // 获取文档信息
      const docResponse = await fetch(`/api/documents/${documentId}`);
      if (docResponse.ok) {
        const data = await docResponse.json();
        setDocument(data.document);

        // 如果已解析，获取解析结果
        if (data.document.parseStatus === "completed") {
          fetchParsedResult();
        }
      }
    } catch (error) {
      console.error("获取文档失败:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchParsedResult() {
    try {
      const response = await fetch(`/api/documents/${documentId}/blocks`);
      if (response.ok) {
        const data = await response.json();
        setParsedResult(data);
      }
    } catch (error) {
      console.error("获取解析结果失败:", error);
    }
  }

  async function handleParse() {
    setIsParsing(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/parse`, {
        method: "POST",
      });

      if (response.ok) {
        toast({
          title: "解析已启动",
          description: "文档正在解析中，请稍候刷新查看结果",
        });
        // 等待 3 秒后刷新
        setTimeout(() => {
          fetchDocument();
        }, 3000);
      } else {
        const error = await response.json();
        toast({
          title: "解析失败",
          description: error.error,
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
      setIsParsing(false);
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
      default:
        return docType;
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
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">文档不存在</h3>
          <p className="text-muted-foreground text-center mb-4">
            请检查文档 ID 是否正确
          </p>
          <Button variant="outline" onClick={() => router.push("/documents")}>
            返回文件列表
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 文档头部 */}
      <div className="flex items-start justify-between">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() =>
              document.project?.id
                ? router.push(`/projects/${document.project.id}`)
                : router.push("/documents")
            }
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {document.project?.id ? "返回项目详情" : "返回文件列表"}
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">{document.name}</h2>
          <p className="text-muted-foreground">
            {getDocTypeLabel(document.docType)} ·
            上传于 {new Date(document.createdAt).toLocaleDateString("zh-CN")}
          </p>
        </div>
        <div className="flex gap-2">
          {document.parseStatus === "pending" && (
            <Button onClick={handleParse} disabled={isParsing}>
              {isParsing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  解析中...
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  开始解析
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 文档状态 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">解析状态</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {document.parseStatus === "completed"
                ? "已解析"
                : document.parseStatus === "processing"
                ? "解析中"
                : document.parseStatus === "failed"
                ? "解析失败"
                : "待解析"}
            </div>
          </CardContent>
        </Card>

        {parsedResult && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总页数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{parsedResult.totalPages}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">内容区块</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{parsedResult.blocks?.length || 0}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* 文档内容 */}
      {document.parseStatus === "completed" && parsedResult && (
        <Card>
          <CardHeader>
            <CardTitle>文档内容预览</CardTitle>
            <CardDescription>
              点击区块查看详细内容，高亮区域为审查发现的问题位置
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PdfViewer
              documentId={documentId}
              blocks={parsedResult.blocks}
              highlightedIssues={[]}
            />
          </CardContent>
        </Card>
      )}

      {/* 未解析提示 */}
      {document.parseStatus === "pending" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">文档尚未解析</h3>
            <p className="text-muted-foreground text-center mb-4">
              点击上方"开始解析"按钮，使用 MinerU 解析文档内容
            </p>
          </CardContent>
        </Card>
      )}

      {/* 解析中 */}
      {document.parseStatus === "processing" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">文档正在解析</h3>
            <p className="text-muted-foreground text-center">
              MinerU 正在分析文档内容，请稍候刷新查看结果
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
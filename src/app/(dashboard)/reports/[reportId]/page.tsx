"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ClipboardCheck,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  Play,
  ArrowLeft,
  Eye,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { IssueLocationViewer } from "@/components/review/issue-location-viewer";
import { PdfViewer } from "@/components/document/pdf-viewer";

interface Report {
  id: string;
  status: string;
  aiScore: string | null;
  summary: string | null;
  recommendation: string | null;
  createdAt: string;
  completedAt: string | null;
  document: {
    id: string;
    name: string;
    docType: string;
    parseStatus: string;
  };
  project: {
    id: string;
    name: string;
    projectNo: string;
  };
  issues: Issue[];
}

interface Issue {
  id: string;
  category: string;
  severity: "critical" | "major" | "minor" | "suggestion";
  title: string;
  description: string;
  location: {
    pageNumber: number;
    blockIndex: number;
    textSnippet?: string;
    highlightText?: string;
    bbox?: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  };
  suggestion?: string | null | undefined;
  isResolved: boolean;
}

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

const severityColors = {
  critical: "bg-red-100 text-red-700 border-red-200",
  major: "bg-orange-100 text-orange-700 border-orange-200",
  minor: "bg-yellow-100 text-yellow-700 border-yellow-200",
  suggestion: "bg-blue-100 text-blue-700 border-blue-200",
};

const severityLabels = {
  critical: "严重",
  major: "重要",
  minor: "轻微",
  suggestion: "建议",
};

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.reportId as string;
  const { toast } = useToast();

  const [report, setReport] = useState<Report | null>(null);
  const [blocks, setBlocks] = useState<DocumentBlock[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIssueId, setSelectedIssueId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState("issues");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [reportId]);

  useEffect(() => {
    if (report?.document.id && report.status === "completed") {
      fetchDocumentBlocks();
    }
  }, [report?.document.id, report?.status]);

  async function fetchReport() {
    try {
      const response = await fetch(`/api/reports/${reportId}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data.report);
      } else {
        toast({
          title: "加载失败",
          description: "无法获取审查报告",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("获取报告失败:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchDocumentBlocks() {
    if (!report?.document.id) return;
    try {
      const response = await fetch(`/api/documents/${report.document.id}/blocks`);
      if (response.ok) {
        const data = await response.json();
        setBlocks(data.blocks || []);
      }
    } catch (error) {
      console.error("获取文档区块失败:", error);
    }
  }

  async function handleGenerateReport() {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/generate`, {
        method: "POST",
      });

      if (response.ok) {
        toast({
          title: "报告生成中",
          description: "AI正在分析文档，请稍候...",
        });
        // 等待后重新获取报告
        setTimeout(() => {
          fetchReport();
        }, 2000);
      } else {
        toast({
          title: "生成失败",
          description: "无法启动报告生成",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "网络错误",
        description: "请检查网络连接",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  function selectIssue(issue: Issue) {
    setSelectedIssueId(issue.id);
    setCurrentPage(issue.location.pageNumber);
  }

  function handleLocateClick(issue: Issue) {
    selectIssue(issue);
    setActiveTab("location");
  }

  function handlePreviewClick(issue: Issue) {
    selectIssue(issue);
    setActiveTab("preview");
  }

  function handlePageChange(pageNumber: number) {
    setCurrentPage(pageNumber);
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "已完成";
      case "in_progress":
        return "审查中";
      default:
        return "待审查";
    }
  };

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

  if (!report) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">报告不存在</h3>
          <p className="text-muted-foreground text-center mb-4">
            请检查报告 ID 是否正确
          </p>
          <Button variant="outline" onClick={() => router.push("/projects")}>
            返回项目列表
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 报告头部 */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/projects/${report.project.id}`}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回项目详情
          </Link>
          <h2 className="text-3xl font-bold tracking-tight">审查报告</h2>
          <p className="text-muted-foreground">
            项目: {report.project.name} ({report.project.projectNo})
          </p>
        </div>
        <div className="flex gap-2">
          {report.status === "pending" && (
            <Button onClick={handleGenerateReport} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  开始审查
                </>
              )}
            </Button>
          )}
          {report.status === "completed" && (
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              导出报告
            </Button>
          )}
        </div>
      </div>

      {/* 报告概览 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">审查状态</CardTitle>
            {getStatusIcon(report.status)}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getStatusLabel(report.status)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI评分</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {report.aiScore ? `${report.aiScore}分` : "--"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">问题数量</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.issues?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">审查文档</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold truncate">
              {report.document.name}
            </div>
            <p className="text-xs text-muted-foreground">
              {getDocTypeLabel(report.document.docType)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 审查摘要 */}
      {report.summary && (
        <Card>
          <CardHeader>
            <CardTitle>审查摘要</CardTitle>
            <CardDescription>
              AI 生成的审查结论和建议
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{report.summary}</p>
            {report.recommendation && (
              <div className="mt-4 p-4 rounded-lg bg-primary/10">
                <p className="font-semibold text-primary">
                  建议结论: {report.recommendation === "pass" ? "通过" : report.recommendation === "fail" ? "不通过" : "整改后通过"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 问题清单和文档预览 */}
      {report.status === "completed" && report.issues && report.issues.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="issues" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              问题清单
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              文档预览
            </TabsTrigger>
            <TabsTrigger value="location" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              问题定位
            </TabsTrigger>
          </TabsList>

          <TabsContent value="issues">
            <Card>
              <CardHeader>
                <CardTitle>问题清单</CardTitle>
                <CardDescription>
                  审查发现的问题详情，包含具体位置定位
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {report.issues.map((issue, index) => (
                    <div
                      key={issue.id}
                      className={`p-4 rounded-lg border transition-all ${
                        selectedIssueId === issue.id
                          ? "ring-2 ring-primary"
                          : ""
                      } ${severityColors[issue.severity as keyof typeof severityColors]}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="font-semibold">{index + 1}. {issue.title}</span>
                            <Badge variant="outline" className={severityColors[issue.severity as keyof typeof severityColors]}>
                              {severityLabels[issue.severity as keyof typeof severityLabels]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              第 {issue.location.pageNumber} 页
                            </span>
                          </div>
                          <p className="text-sm mb-2">{issue.description}</p>
                          {issue.location.textSnippet && (
                            <div className="bg-white/50 p-2 rounded text-sm font-mono mb-2">
                              「{issue.location.textSnippet}」
                            </div>
                          )}
                          {issue.suggestion && (
                            <p className="text-sm text-muted-foreground">
                              建议: {issue.suggestion}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <Badge variant={issue.isResolved ? "default" : "secondary"}>
                            {issue.isResolved ? "已解决" : "待处理"}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1"
                            onClick={() => handleLocateClick(issue)}
                          >
                            <Eye className="h-3 w-3" />
                            定位预览
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview">
            <Card>
              <CardHeader>
                <CardTitle>文档内容预览</CardTitle>
                <CardDescription>
                  {selectedIssueId
                    ? `已定位到第 ${currentPage} 页 · 橙色框为当前问题，黄色框为其他问题`
                    : "查看文档解析内容，高亮区域为问题位置"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PdfViewer
                  documentId={report.document.id}
                  blocks={blocks}
                  highlightedIssues={report.issues.map((i) => i.location)}
                  focusedIssue={
                    selectedIssueId
                      ? report.issues.find((i) => i.id === selectedIssueId)?.location
                      : undefined
                  }
                  currentPage={currentPage}
                  onPageChange={handlePageChange}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="location">
            <div className="grid gap-6 lg:grid-cols-2">
              <IssueLocationViewer
                issues={report.issues}
                currentPage={currentPage}
                onIssueClick={handleLocateClick}
                selectedIssueId={selectedIssueId}
              />
              <Card>
                <CardHeader>
                  <CardTitle>当前页预览</CardTitle>
                  <CardDescription>
                    第 {currentPage} 页内容
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {blocks.length > 0 ? (
                    <PdfViewer
                      documentId={report.document.id}
                      blocks={blocks}
                      // 在“问题定位”中保留全量高亮，避免仅当前页导致定位/对比信息缺失
                      highlightedIssues={report.issues.map((i) => i.location)}
                      focusedIssue={
                        selectedIssueId
                          ? report.issues.find((i) => i.id === selectedIssueId)?.location
                          : undefined
                      }
                      currentPage={currentPage}
                      onPageChange={handlePageChange}
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      加载中...
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* 空状态 */}
      {report.status === "completed" && (!report.issues || report.issues.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">审查完成，未发现问题</h3>
            <p className="text-muted-foreground text-center">
              文档符合合规性要求，审查通过
            </p>
          </CardContent>
        </Card>
      )}

      {/* 待审查状态 */}
      {report.status === "pending" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">尚未开始审查</h3>
            <p className="text-muted-foreground text-center mb-4">
              点击上方「开始审查」按钮，AI 将自动分析文档内容
            </p>
          </CardContent>
        </Card>
      )}

      {/* 审查中状态 */}
      {report.status === "in_progress" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-yellow-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">正在分析文档</h3>
            <p className="text-muted-foreground text-center">
              AI 正在进行合规性审查，请稍候刷新查看结果...
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
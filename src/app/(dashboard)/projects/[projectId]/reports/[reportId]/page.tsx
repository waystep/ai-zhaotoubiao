"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  FileSearch,
  FileText,
  Loader2,
  MapPin,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PdfViewer } from "@/components/document/pdf-viewer";
import { IssueLocationViewer } from "@/components/review/issue-location-viewer";
import { useToast } from "@/hooks/use-toast";

interface IssueLocation {
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
}

interface Issue {
  id: string;
  blockId?: string | null;
  checkpointId?: string | null;
  category: string;
  severity: "critical" | "major" | "minor" | "suggestion";
  title: string;
  description: string;
  location: IssueLocation;
  suggestion?: string | null;
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

interface StandardDocument {
  id: string;
  name: string;
  docType: string;
  parseStatus: string;
  mimeType: string;
}

interface ReviewItemResult {
  id: string;
  reviewItemId: string;
  status: "pass" | "fail" | "needs_manual_review";
  reason: string;
  evidenceBlockIds: string[];
  confidence?: string | null;
  metadata?: Record<string, unknown>;
  reviewItem: {
    id: string;
    section?: string | null;
    title: string;
    checkpoint?: string | null;
    consequence?: string | null;
    location: IssueLocation;
  };
}

interface ResponseItemResult {
  id: string;
  responseItemId: string;
  status: "answered" | "partially_answered" | "unanswered" | "not_applicable";
  reason: string;
  evidenceBlockIds: string[];
  confidence?: string | null;
  metadata?: Record<string, unknown>;
  responseItem: {
    id: string;
    responseType: string;
    itemNo?: string | null;
    title: string;
    description: string;
    location: IssueLocation;
  };
}

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
    mimeType: string;
  };
  project: {
    id: string;
    name: string;
    projectNo: string;
  };
  issues: Issue[];
  reviewItemResults: ReviewItemResult[];
  responseItemResults: ResponseItemResult[];
  standardDocuments: StandardDocument[];
  structuredSummary?: {
    responseCoverageSummary: {
      total: number;
      answered: number;
      partiallyAnswered: number;
      unanswered: number;
      notApplicable: number;
    };
    reviewItemsSummary: {
      total: number;
      pass: number;
      fail: number;
      needsManualReview: number;
    };
  };
}

const reviewStatusLabels = {
  pass: "通过",
  fail: "不满足",
  needs_manual_review: "待人工复核",
} as const;

const reviewStatusClasses = {
  pass: "bg-green-100 text-green-700 border-green-200",
  fail: "bg-red-100 text-red-700 border-red-200",
  needs_manual_review: "bg-yellow-100 text-yellow-700 border-yellow-200",
} as const;

const responseStatusLabels = {
  answered: "已响应",
  partially_answered: "部分响应",
  unanswered: "未响应",
  not_applicable: "不适用",
} as const;

const responseStatusClasses = {
  answered: "bg-green-100 text-green-700 border-green-200",
  partially_answered: "bg-yellow-100 text-yellow-700 border-yellow-200",
  unanswered: "bg-red-100 text-red-700 border-red-200",
  not_applicable: "bg-slate-100 text-slate-700 border-slate-200",
} as const;

function getStatusLabel(status: string) {
  switch (status) {
    case "completed":
      return "已完成";
    case "in_progress":
      return "审查中";
    case "failed":
      return "审查失败";
    default:
      return "待审查";
  }
}

function getDocTypeLabel(docType: string) {
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
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "in_progress":
      return <Loader2 className="h-5 w-5 animate-spin text-yellow-500" />;
    case "failed":
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    default:
      return <Clock className="h-5 w-5 text-gray-400" />;
  }
}

function buildLocationFromBlock(block: DocumentBlock): IssueLocation {
  return {
    pageNumber: block.pageNumber,
    blockIndex: block.blockIndex,
    textSnippet: block.content.slice(0, 120),
    highlightText: block.content.slice(0, 80),
    bbox: block.bbox,
  };
}

function ResultSectionHeader({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Badge variant="outline">{count} 项</Badge>
    </div>
  );
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const projectId = params.projectId as string;
  const reportId = params.reportId as string;

  const [report, setReport] = useState<Report | null>(null);
  const [bidBlocks, setBidBlocks] = useState<DocumentBlock[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [focusedIssueOnce, setFocusedIssueOnce] = useState<IssueLocation | null>(null);
  const [hoveredIssue, setHoveredIssue] = useState<IssueLocation | null>(null);
  const [hoveredIssueId, setHoveredIssueId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const [selectedStandardDocId, setSelectedStandardDocId] = useState<string>("");
  const [standardBlocks, setStandardBlocks] = useState<DocumentBlock[]>([]);
  const [standardPage, setStandardPage] = useState(1);
  const [isStandardPreviewLoading, setIsStandardPreviewLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    try {
      const response = await fetch(`/api/reports/${reportId}`);
      if (!response.ok) {
        throw new Error("无法获取审查报告");
      }
      const data = await response.json();
      setReport(data.report);
    } catch (error) {
      toast({
        title: "加载失败",
        description: error instanceof Error ? error.message : "无法获取审查报告",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [reportId, toast]);

  const fetchBlocks = useCallback(async (documentId: string) => {
    const response = await fetch(`/api/documents/${documentId}/blocks`);
    if (!response.ok) {
      throw new Error("无法获取文档区块");
    }
    const data = await response.json();
    return (data.blocks || []) as DocumentBlock[];
  }, []);

  const fetchBidBlocks = useCallback(async () => {
    if (!report?.document.id) return;
    try {
      const nextBlocks = await fetchBlocks(report.document.id);
      setBidBlocks(nextBlocks);
    } catch (error) {
      console.error("获取投标文件区块失败:", error);
    }
  }, [fetchBlocks, report?.document.id]);

  const fetchStandardBlocks = useCallback(
    async (documentId: string) => {
      setIsStandardPreviewLoading(true);
      try {
        const nextBlocks = await fetchBlocks(documentId);
        setStandardBlocks(nextBlocks);
      } catch (error) {
        console.error("获取标准文件区块失败:", error);
        setStandardBlocks([]);
      } finally {
        setIsStandardPreviewLoading(false);
      }
    },
    [fetchBlocks]
  );

  async function handleDelete() {
    if (!report) return;
    if (!confirm(`确定要删除审查报告 "${report.document.name}" 吗？此操作不可撤销。`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "删除成功",
          description: "审查报告已删除",
        });
        router.push(`/projects/${report.project.id}/reports`);
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
      setIsDeleting(false);
    }
  }

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    if (!report?.document.id || report.status !== "completed") return;
    void fetchBidBlocks();
  }, [fetchBidBlocks, report?.document.id, report?.status]);

  useEffect(() => {
    if (report?.status !== "in_progress") return;
    const timer = window.setInterval(() => {
      void fetchReport();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchReport, report?.status]);

  useEffect(() => {
    if (!report?.standardDocuments?.length) return;
    if (selectedStandardDocId) return;
    setSelectedStandardDocId(report.standardDocuments[0].id);
  }, [report?.standardDocuments, selectedStandardDocId]);

  useEffect(() => {
    if (!selectedStandardDocId) return;
    void fetchStandardBlocks(selectedStandardDocId);
  }, [fetchStandardBlocks, selectedStandardDocId]);

  const bidBlockById = useMemo(() => {
    const map = new Map<string, DocumentBlock>();
    for (const block of bidBlocks) {
      map.set(block.id, block);
    }
    return map;
  }, [bidBlocks]);

  const issueNoById = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < (report?.issues?.length ?? 0); i++) {
      map[report!.issues[i].id] = i + 1;
    }
    return map;
  }, [report?.issues]);

  const issueNoByKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < (report?.issues?.length ?? 0); i++) {
      const issue = report!.issues[i];
      map[`${issue.location.pageNumber}-${issue.location.blockIndex}`] = i + 1;
    }
    return map;
  }, [report?.issues]);

  const issueIdByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const issue of report?.issues ?? []) {
      map[`${issue.location.pageNumber}-${issue.location.blockIndex}`] = issue.id;
    }
    return map;
  }, [report?.issues]);

  const selectLocation = useCallback((location: IssueLocation) => {
    setCurrentPage(location.pageNumber);
    setFocusedIssueOnce(location);
  }, []);

  const selectIssue = useCallback(
    (issue: Issue) => {
      selectLocation(issue.location);
    },
    [selectLocation]
  );

  const locateResult = useCallback(
    (result: {
      evidenceBlockIds?: string[];
      itemId: string;
      itemTitle: string;
    }) => {
      const firstEvidenceBlock = (result.evidenceBlockIds || [])
        .map((id) => bidBlockById.get(id))
        .find(Boolean);

      if (firstEvidenceBlock) {
        selectLocation(buildLocationFromBlock(firstEvidenceBlock));
        return;
      }

      const matchedIssue = (report?.issues || []).find((issue) => issue.checkpointId === result.itemId);
      if (matchedIssue) {
        selectIssue(matchedIssue);
        return;
      }

      toast({
        title: "暂无可定位证据",
        description: `${result.itemTitle} 当前没有关联到具体的投标文件区块位置`,
        variant: "destructive",
      });
    },
    [bidBlockById, report?.issues, selectIssue, selectLocation, toast]
  );

  const handleLocateReviewItem = useCallback(
    (result: ReviewItemResult) => {
      locateResult({
        evidenceBlockIds: result.evidenceBlockIds,
        itemId: result.reviewItem.id,
        itemTitle: result.reviewItem.title,
      });
    },
    [locateResult]
  );

  const handleLocateResponseItem = useCallback(
    (result: ResponseItemResult) => {
      locateResult({
        evidenceBlockIds: result.evidenceBlockIds,
        itemId: result.responseItem.id,
        itemTitle: result.responseItem.title,
      });
    },
    [locateResult]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-h5">报告不存在</h3>
          <p className="mb-4 text-center text-muted-foreground">请检查报告 ID 是否正确</p>
          <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/reports`)}>
            返回报告列表
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/reports"
            className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回审查报告列表
          </Link>
          <h2 className="text-h2">审查报告</h2>
          <p className="text-muted-foreground">
            项目: {report.project.name} ({report.project.projectNo})
          </p>
        </div>
        <div className="flex gap-2">
          {(report.status === "pending" ||
            report.status === "in_progress" ||
            report.status === "failed") && (
            <Button onClick={() => router.push(`/projects/${projectId}/reports/${reportId}/chat`)}>
              <Bot className="mr-2 h-4 w-4" />
              {report.status === "pending" ? "进入审查会话" : "查看审查会话"}
            </Button>
          )}
          {report.status === "completed" && (
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              导出报告
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            删除报告
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">审查状态</CardTitle>
            {getStatusIcon(report.status)}
          </CardHeader>
          <CardContent>
            <div className="text-stat">{getStatusLabel(report.status)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI 评分</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-stat">{report.aiScore ? `${report.aiScore} 分` : "--"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">问题数量</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-stat">{report.issues?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">审查文档</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="truncate text-h4" title={report.document.name}>
              {report.document.name}
            </div>
            <p className="text-xs text-muted-foreground">{getDocTypeLabel(report.document.docType)}</p>
          </CardContent>
        </Card>
      </div>

      {report.summary && (
        <Card>
          <CardHeader>
            <CardTitle>审查摘要</CardTitle>
            <CardDescription>AI 生成的审查结论和建议</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{report.summary}</p>
            {report.recommendation && (
              <div className="mt-4 rounded-lg bg-primary/10 p-4">
                <p className="font-semibold text-primary">
                  建议结论:{" "}
                  {report.recommendation === "pass"
                    ? "通过"
                    : report.recommendation === "fail"
                      ? "不通过"
                      : "整改后通过"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {report.structuredSummary && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>审查项结果概览</CardTitle>
              <CardDescription>条目级审查结果统计</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>总数</span>
                <span className="font-medium">{report.structuredSummary.reviewItemsSummary.total}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>通过</span>
                <span className="font-medium">{report.structuredSummary.reviewItemsSummary.pass}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>不满足</span>
                <span className="font-medium text-red-600">
                  {report.structuredSummary.reviewItemsSummary.fail}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>待人工复核</span>
                <span className="font-medium">
                  {report.structuredSummary.reviewItemsSummary.needsManualReview}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>响应项结果概览</CardTitle>
              <CardDescription>投标文件响应覆盖情况</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>总数</span>
                <span className="font-medium">{report.structuredSummary?.responseCoverageSummary?.total ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>已响应</span>
                <span className="font-medium">{report.structuredSummary?.responseCoverageSummary?.answered ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>部分响应</span>
                <span className="font-medium">
                  {report.structuredSummary?.responseCoverageSummary?.partiallyAnswered ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>未响应</span>
                <span className="font-medium text-red-600">
                  {report.structuredSummary?.responseCoverageSummary?.unanswered ?? 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {report.status === "completed" && (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>结构化审查结果</CardTitle>
                  <CardDescription>点击任一结果可定位到对应的投标文件位置</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="review-items" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="review-items">审查项结果</TabsTrigger>
                      <TabsTrigger value="response-items">响应项结果</TabsTrigger>
                    </TabsList>

                    <TabsContent value="review-items" className="space-y-3">
                      <ResultSectionHeader
                        title="审查项结果"
                        description="核验投标文件是否满足强制性或合规性要求"
                        count={report.reviewItemResults.length}
                      />
                      <div className="space-y-3">
                        {report.reviewItemResults.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            onClick={() => handleLocateReviewItem(result)}
                            className="w-full rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge className={reviewStatusClasses[result.status]}>
                                    {reviewStatusLabels[result.status]}
                                  </Badge>
                                  {result.reviewItem.section && (
                                    <Badge variant="outline" className="border-blue-300 text-blue-700">{result.reviewItem.section}</Badge>
                                  )}
                                  <span className="text-sm font-medium">{result.reviewItem.title}</span>
                                </div>
                                {result.reviewItem.checkpoint && (
                                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                                    {result.reviewItem.checkpoint}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5" />
                                <span>{result.evidenceBlockIds?.length ?? 0} 个证据块</span>
                                <ChevronRight className="h-4 w-4" />
                              </div>
                            </div>
                            <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                              {result.reason}
                            </div>
                            {result.reviewItem.consequence != null && Number(result.reviewItem.consequence) > 0 && (
                              <p className="mt-2 text-xs text-red-600">
                                后果权重: {Number(result.reviewItem.consequence).toFixed(2)}
                              </p>
                            )}
                          </button>
                        ))}
                        {report.reviewItemResults.length === 0 && (
                          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                            暂无审查项结果
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="response-items" className="space-y-3">
                      <ResultSectionHeader
                        title="响应项结果"
                        description="核验投标文件是否对要求内容作出完整响应"
                        count={report.responseItemResults?.length ?? 0}
                      />
                      <div className="space-y-3">
                        {(report.responseItemResults ?? []).map((result: any) => (
                          <button
                            key={result.id}
                            type="button"
                            onClick={() => handleLocateResponseItem(result)}
                            className="w-full rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/30"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge className={responseStatusClasses[result.status]}>
                                    {responseStatusLabels[result.status]}
                                  </Badge>
                                  {result.responseItem.itemNo && (
                                    <Badge variant="outline">{result.responseItem.itemNo}</Badge>
                                  )}
                                  <Badge variant="secondary">{result.responseItem.responseType}</Badge>
                                </div>
                                <p className="mt-2 font-medium">{result.responseItem.title}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {result.responseItem.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5" />
                                <span>{result.evidenceBlockIds?.length ?? 0} 个证据块</span>
                                <ChevronRight className="h-4 w-4" />
                              </div>
                            </div>
                            <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                              {result.reason}
                            </div>
                          </button>
                        ))}
                        {(report.responseItemResults?.length ?? 0) === 0 && (
                          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                            暂无响应项结果
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              <IssueLocationViewer
                issues={report.issues}
                currentPage={currentPage}
                onIssueClick={selectIssue}
                onIssueHover={(issue) => {
                  setHoveredIssue(issue?.location ?? null);
                  setHoveredIssueId(issue?.id ?? null);
                }}
                hoveredIssueId={hoveredIssueId ?? undefined}
                issueNoById={issueNoById}
              />
            </div>

            <div className="space-y-6">
              <Card className="bg-muted/20 shadow-sm">
                <CardHeader>
                  <CardTitle>投标文件定位预览</CardTitle>
                  <CardDescription>点击左侧结果后，在这里定位到投标文件的具体位置</CardDescription>
                </CardHeader>
                <CardContent>
                  {bidBlocks.length > 0 ? (
                    <PdfViewer
                      documentId={report.document.id}
                      blocks={bidBlocks}
                      highlightedIssues={report.issues.map((issue) => issue.location)}
                      focusedIssue={focusedIssueOnce}
                      hoveredIssue={hoveredIssue}
                      issueNoByKey={issueNoByKey}
                      onIssueHover={(loc) => {
                        setHoveredIssue(loc);
                        const id = loc ? issueIdByKey[`${loc.pageNumber}-${loc.blockIndex}`] : null;
                        setHoveredIssueId(id ?? null);
                      }}
                      onFocusedIssueConsumed={() => setFocusedIssueOnce(null)}
                      currentPage={currentPage}
                      onPageChange={setCurrentPage}
                    />
                  ) : (
                    <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                      投标文件区块加载中...
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-muted/20 shadow-sm">
                <CardHeader>
                  <CardTitle>招标依据预览</CardTitle>
                  <CardDescription>查看招标文件与法律文件原文，便于对照审查依据</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.standardDocuments.length > 0 ? (
                    <>
                      <Tabs
                        value={selectedStandardDocId}
                        onValueChange={(value) => {
                          setSelectedStandardDocId(value);
                          setStandardPage(1);
                        }}
                      >
                        <TabsList className="h-auto flex-wrap justify-start">
                          {report.standardDocuments.map((doc) => (
                            <TabsTrigger key={doc.id} value={doc.id} className="max-w-[220px]">
                              <span className="truncate" title={doc.name}>
                                {getDocTypeLabel(doc.docType)} · {doc.name}
                              </span>
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        {report.standardDocuments.map((doc) => (
                          <TabsContent key={doc.id} value={doc.id} className="mt-4">
                            {!doc.mimeType.toLowerCase().includes("pdf") ? (
                              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                当前仅支持 PDF 在线预览，该文件类型为 {doc.mimeType}
                              </div>
                            ) : doc.parseStatus !== "completed" ? (
                              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                该文件尚未完成解析，暂时无法展示区块预览
                              </div>
                            ) : isStandardPreviewLoading ? (
                              <div className="flex min-h-[220px] items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                              </div>
                            ) : (
                              <PdfViewer
                                documentId={doc.id}
                                blocks={standardBlocks}
                                highlightedIssues={[]}
                                currentPage={standardPage}
                                onPageChange={setStandardPage}
                              />
                            )}
                          </TabsContent>
                        ))}
                      </Tabs>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                      当前项目下暂无可预览的招标依据文件
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {report.issues.length === 0 &&
            report.reviewItemResults.length === 0 &&
            (report.responseItemResults?.length ?? 0) === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileSearch className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-h5">报告已完成，但暂未生成结构化结果</h3>
                  <p className="text-center text-muted-foreground">
                    请检查智能体是否已将审查项结果和响应项结果正确落库
                  </p>
                </CardContent>
              </Card>
            )}
        </>
      )}

      {report.status === "pending" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-h5">尚未开始审查</h3>
            <p className="mb-4 text-center text-muted-foreground">
              点击上方“进入审查会话”，AI 将开始分析投标文件
            </p>
          </CardContent>
        </Card>
      )}

      {report.status === "in_progress" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="mb-4 h-12 w-12 animate-spin text-yellow-500" />
            <h3 className="mb-2 text-h5">正在分析文档</h3>
            <p className="text-center text-muted-foreground">
              AI 正在进行结构化审查，请稍后刷新查看结果
            </p>
          </CardContent>
        </Card>
      )}

      {report.status === "failed" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
            <h3 className="mb-2 text-h5">审查失败</h3>
            <p className="mb-4 text-center text-muted-foreground">
              这次审查没有完整落库，请进入审查会话查看过程并重新触发
            </p>
            <Button onClick={() => router.push(`/projects/${projectId}/reports/${reportId}/chat`)}>
              <Bot className="mr-2 h-4 w-4" />
              打开审查会话
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

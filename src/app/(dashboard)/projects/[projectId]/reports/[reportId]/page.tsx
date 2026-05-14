"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
  PanelRightClose,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Streamdown } from "streamdown";
import { PdfViewer } from "@/components/document/pdf-viewer";
import { IssueLocationViewer } from "@/components/review/issue-location-viewer";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  imagePath?: string | null;
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
    blocks?: Array<{ blockId: string; pageNumber: number; blockIndex: number }>;
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
  imageRisks?: Array<{
    id: string; pageNumber: number; imagePath: string; status: string;
    hasRisk: boolean | null; riskType: string | null; riskText: string | null; confidence: string | null;
  }>;
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

  const [basisPanelOpen, setBasisPanelOpen] = useState(false);
  const [bidSharePercent, setBidSharePercent] = useState(50);
  const [splitDragging, setSplitDragging] = useState(false);
  const splitRowRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!splitDragging) return;
    const move = (e: MouseEvent) => {
      const el = splitRowRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gutter = 6;
      const inner = Math.max(1, rect.width - gutter);
      const x = e.clientX - rect.left - gutter / 2;
      let pct = (x / inner) * 100;
      pct = Math.min(78, Math.max(22, pct));
      setBidSharePercent(pct);
    };
    const up = () => setSplitDragging(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [splitDragging]);

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
      // 尝试通过 checkpointId 找到关联的审查项，用其 blocks 定位招标文件原文
      if (issue.checkpointId && report?.reviewItemResults) {
        const matchedResult = report.reviewItemResults.find(
          (r) => r.reviewItemId === issue.checkpointId
        );
        if (matchedResult?.reviewItem?.blocks && matchedResult.reviewItem.blocks.length > 0) {
          const firstBlock = matchedResult.reviewItem.blocks[0];
          // 切换到对应标准文档并定位
          const matchedDocId = report.standardDocuments?.find(
            (d) => d.docType === "tender_doc"
          )?.id;
          if (matchedDocId) {
            setSelectedStandardDocId(matchedDocId);
            setStandardPage(firstBlock.pageNumber);
            setCurrentPage(0); // 清除投标文件焦点
            setFocusedIssueOnce({
              pageNumber: firstBlock.pageNumber,
              blockIndex: firstBlock.blockIndex,
            });
            return;
          }
        }
      }
      // 回退：定位到投标文件中的 issue 位置
      selectLocation(issue.location);
    },
    [report?.reviewItemResults, report?.standardDocuments, selectLocation]
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
            href={`/projects/${report.project.id}/reports`}
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
            <div className="text-muted-foreground prose prose-sm max-w-none dark:prose-invert">
              <Streamdown>{report.summary}</Streamdown>
            </div>
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

      {report.status === "completed" && report.reviewItemResults.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">审查项结果</CardTitle>
                <CardDescription>核验投标文件是否满足强制性或合规性要求</CardDescription>
              </div>
              {report.structuredSummary && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">共 <span className="font-medium text-foreground">{report.structuredSummary.reviewItemsSummary.total}</span> 项</span>
                  <span className="text-green-600">通过 <span className="font-medium">{report.structuredSummary.reviewItemsSummary.pass}</span></span>
                  <span className="text-red-600">不满足 <span className="font-medium">{report.structuredSummary.reviewItemsSummary.fail}</span></span>
                  <span className="text-yellow-600">待复核 <span className="font-medium">{report.structuredSummary.reviewItemsSummary.needsManualReview}</span></span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {report.reviewItemResults.map((result) => (
                <button key={result.id} type="button" onClick={() => handleLocateReviewItem(result)}
                  className="w-full rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className={reviewStatusClasses[result.status]}>{reviewStatusLabels[result.status]}</Badge>
                        {result.reviewItem.section && (
                          <Badge variant="outline" className="border-blue-300 text-blue-700">{result.reviewItem.section}</Badge>
                        )}
                        <span className="text-sm font-medium">{result.reviewItem.title}</span>
                      </div>
                      {result.reviewItem.checkpoint && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{result.reviewItem.checkpoint}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{result.evidenceBlockIds?.length ?? 0} 个证据块</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{result.reason}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {report.status === "completed" && (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>问题定位</CardTitle>
                  <CardDescription>图片暗标风险及审查发现的问题</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="issues" className="w-full">
                    <TabsList className={`grid w-full ${report.imageRisks && report.imageRisks.filter((i) => i.hasRisk).length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
                      <TabsTrigger value="issues">问题</TabsTrigger>
                      {report.imageRisks && report.imageRisks.filter((i) => i.hasRisk).length > 0 && (
                        <TabsTrigger value="image-risks">
                          图片风险
                          <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-xs">{report.imageRisks.filter((i) => i.hasRisk).length}</Badge>
                        </TabsTrigger>
                      )}
                    </TabsList>
                    <TabsContent value="issues" className="mt-3">
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
                    </TabsContent>
                    {report.imageRisks && report.imageRisks.filter((i) => i.hasRisk).length > 0 && (
                      <TabsContent value="image-risks" className="mt-3">
                        <div className="max-h-80 space-y-2 overflow-y-auto">
                          {report.imageRisks.filter((i) => i.hasRisk).map((img) => {
                            const resolvedBlock = bidBlocks.find(
                              (b) => b.imagePath && (b.imagePath === img.imagePath || b.imagePath.endsWith(img.imagePath))
                            );
                            const loc = resolvedBlock
                              ? buildLocationFromBlock(resolvedBlock)
                              : { pageNumber: img.pageNumber, blockIndex: 0 };
                            return (
                            <button key={img.id} type="button" onClick={() => selectLocation(loc)}
                              className="w-full text-left flex items-start gap-3 rounded-md border border-red-100 bg-red-50 p-3 text-sm hover:border-red-300 hover:bg-red-100 transition-colors">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">第{img.pageNumber}页</Badge>
                                  <Badge variant="destructive" className="text-xs">{img.riskType}</Badge>
                                </div>
                                {img.riskText && <p className="mt-1 text-xs font-medium">{img.riskText}</p>}
                                {img.confidence && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    置信度: {Number(img.confidence) <= 1 ? `${Math.round(Number(img.confidence) * 100)}%` : `${Math.round(Number(img.confidence))}%`}
                                  </p>
                                )}
                              </div>
                            </button>
                            );
                          })}
                        </div>
                      </TabsContent>
                    )}
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="overflow-hidden bg-muted/20 shadow-sm">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-4">
                  <div className="min-w-0">
                    <CardTitle>投标文件与依据预览</CardTitle>
                    <CardDescription>
                      默认仅显示投标文件；需要对照招标/法律文件时展开右侧，并可拖拽中间分隔条调整比例。
                      {report.standardDocuments.length === 0 && (
                        <span className="mt-1 block text-amber-700/90">
                          当前项目下暂无可预览的招标依据文件。
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  {report.standardDocuments.length > 0 && (
                    <Button
                      type="button"
                      variant={basisPanelOpen ? "outline" : "secondary"}
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setBasisPanelOpen((open) => {
                          const next = !open;
                          if (next) setBidSharePercent(50);
                          return next;
                        });
                      }}
                    >
                      {basisPanelOpen ? (
                        <>
                          <PanelRightClose className="mr-1.5 h-4 w-4" />
                          收起招标依据
                        </>
                      ) : (
                        <>
                          <FileText className="mr-1.5 h-4 w-4" />
                          对照招标依据
                        </>
                      )}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div
                    ref={splitRowRef}
                    className="grid w-full min-h-[min(72vh,620px)] overflow-hidden rounded-lg border bg-background/60"
                    style={
                      basisPanelOpen && report.standardDocuments.length > 0
                        ? {
                            gridTemplateColumns: `${bidSharePercent}fr 6px ${100 - bidSharePercent}fr`,
                          }
                        : undefined
                    }
                  >
                    <div className="min-h-[min(72vh,620px)] min-w-0 overflow-auto p-1">
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
                    </div>

                    {basisPanelOpen && report.standardDocuments.length > 0 && (
                      <>
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="调整投标与依据预览宽度"
                          title="拖拽调整宽度"
                          className={cn(
                            "min-h-[min(72vh,620px)] w-1.5 shrink-0 cursor-col-resize border-x bg-border/80 hover:bg-primary/35",
                            splitDragging && "bg-primary/50"
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSplitDragging(true);
                          }}
                        />
                        <div className="flex min-h-[min(72vh,620px)] min-w-0 flex-col overflow-hidden border-l bg-muted/15">
                          <div className="border-b bg-muted/30 px-3 py-2">
                            <p className="text-xs font-medium text-muted-foreground">招标依据（多文档 Tab 切换）</p>
                          </div>
                          <div className="min-h-0 flex-1 overflow-auto p-2">
                            <Tabs
                              value={selectedStandardDocId}
                              onValueChange={(value) => {
                                setSelectedStandardDocId(value);
                                setStandardPage(1);
                              }}
                            >
                              <TabsList className="mb-3 h-auto w-full flex-wrap justify-start">
                                {report.standardDocuments.map((doc) => (
                                  <TabsTrigger key={doc.id} value={doc.id} className="max-w-[200px]">
                                    <span className="truncate" title={doc.name}>
                                      {getDocTypeLabel(doc.docType)} · {doc.name}
                                    </span>
                                  </TabsTrigger>
                                ))}
                              </TabsList>
                              {report.standardDocuments.map((doc) => (
                                <TabsContent key={doc.id} value={doc.id} className="mt-0">
                                  {!doc.mimeType.toLowerCase().includes("pdf") ? (
                                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                      当前仅支持 PDF 在线预览，该文件类型为 {doc.mimeType}
                                    </div>
                                  ) : doc.parseStatus !== "completed" ? (
                                    <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                                      该文件尚未完成解析，暂时无法展示区块预览
                                    </div>
                                  ) : isStandardPreviewLoading ? (
                                    <div className="flex min-h-[200px] items-center justify-center">
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
                          </div>
                        </div>
                      </>
                    )}
                  </div>
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

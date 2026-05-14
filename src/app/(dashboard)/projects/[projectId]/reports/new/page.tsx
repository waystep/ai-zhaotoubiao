"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ClipboardCheck, Loader2, FileText, ArrowLeft, Bot, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Document {
  id: string;
  name: string;
  docType: string;
  parseStatus: string;
  createdAt: string;
}

interface AgentInfo {
  agent: {
    id: string;
    name: string;
  };
}

// 审查步骤状态
type ReviewStep = "select" | "creating" | "analyzing" | "completed" | "error";

export default function NewReportPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);

  // 审查流程状态
  const [reviewStep, setReviewStep] = useState<ReviewStep>("select");
  const [messages, setMessages] = useState<{id: number, type: string, content: string}[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDocuments();
    fetchAgentInfo();
  }, [projectId]);

  async function fetchDocuments() {
    try {
      const response = await fetch(`/api/projects/${projectId}/documents`);
      if (response.ok) {
        const data = await response.json();
        const parsedDocs = data.documents.filter(
          (doc: Document) => doc.parseStatus === "completed"
        );
        setDocuments(parsedDocs);
      }
    } catch (error) {
      console.error("获取文档列表失败:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchAgentInfo() {
    try {
      const response = await fetch("/api/mastra/review?action=info");
      if (response.ok) {
        const data = await response.json();
        setAgentInfo(data);
      }
    } catch (error) {
      console.error("获取 Agent 信息失败:", error);
    }
  }

  // 开始审查流程
  async function handleStartReview() {
    if (!selectedDoc) {
      toast({
        title: "请选择文档",
        description: "请选择要审查的投标文件",
        variant: "destructive",
      });
      return;
    }

    setError(null);
    setReviewStep("creating");

    try {
      // 步骤1: 创建审查报告
      const createResponse = await fetch(`/api/projects/${projectId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: selectedDoc }),
      });

      if (!createResponse.ok) {
        const err = await createResponse.json();
        throw new Error(err.error || "创建报告失败");
      }

      const createData = await createResponse.json();
      const newReportId = createData.report.id;

      // 步骤2: 跳转到对话页面（创建会话并绑定report）
      router.push(`/projects/${projectId}/reports/${newReportId}/chat`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "审查过程中发生错误");
      setReviewStep("error");
      toast({
        title: "审查失败",
        description: err instanceof Error ? err.message : "请重试",
        variant: "destructive",
      });
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 头部 */}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/projects/${projectId}/reports`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回项目详情
        </Button>
        <h2 className="text-h2 flex items-center gap-3">
          <Bot className="h-8 w-8 text-primary" />
          AI 智能审查
        </h2>
        <p className="text-muted-foreground">
          选择投标文件，AI 将自动进行合规性审查分析
        </p>
      </div>

      {/* Agent 信息 */}
      {agentInfo && (
        <Card className="border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">{agentInfo.agent?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    多智能体协作审查系统
                  </p>
                </div>
              </div>
              <Badge className="bg-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                已就绪
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 审查流程 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            审查流程
          </CardTitle>
          <CardDescription>
            {reviewStep === "select" && "选择要审查的投标文件"}
            {reviewStep === "creating" && "正在创建审查任务..."}
            {reviewStep === "analyzing" && "AI 正在进行智能分析..."}
            {reviewStep === "completed" && "审查已完成，即将跳转到报告详情"}
            {reviewStep === "error" && "审查过程出现问题"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 步骤1: 选择文档 */}
          {reviewStep === "select" && (
            <>
              {documents.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    暂无已解析的文档，请先上传并解析投标文件
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/projects/${projectId}/documents/upload`)}
                  >
                    前往上传文档
                  </Button>
                </div>
              ) : (
                <>
                  {/* 优先显示投标文件 */}
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-medium">投标文件（推荐）</p>
                    {documents.filter(d => d.docType === "bid_doc").map((doc) => (
                      <div
                        key={doc.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          selectedDoc === doc.id
                            ? "border-primary bg-primary/5 ring-2 ring-primary"
                            : "border-gray-200 hover:border-primary/50"
                        }`}
                        onClick={() => setSelectedDoc(doc.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-primary" />
                            <div>
                              <p className="font-medium">{doc.name}</p>
                              <p className="text-sm text-muted-foreground">
                                投标文件 · 上传于 {new Date(doc.createdAt).toLocaleDateString("zh-CN")}
                              </p>
                            </div>
                          </div>
                          {selectedDoc === doc.id && (
                            <Badge className="bg-primary">已选择</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  
                  <div className="flex gap-4 pt-4">
                    <Button
                      onClick={handleStartReview}
                      disabled={!selectedDoc}
                      size="lg"
                    >
                      <Bot className="mr-2 h-4 w-4" />
                      开始 AI 审查
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/projects/${projectId}/reports`)}
                    >
                      取消
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {/* 步骤2/3: 审查过程 - ChatGPT风格消息列表 */}
          {(reviewStep === "creating" || reviewStep === "analyzing") && (
            <div className="py-6">
              <div className="flex items-center justify-center mb-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>

              {/* 真正的消息列表渲染 */}
              {messages.length > 0 && (
                <div className="space-y-3 max-h-[500px] overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg ${
                        msg.type === 'text'
                          ? 'bg-white dark:bg-gray-800'
                          : msg.type === 'system' || msg.type === 'start' || msg.type === 'complete'
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : msg.type === 'tool' || msg.type === 'tool-result'
                          ? 'bg-gray-100 dark:bg-gray-700'
                          : msg.type === 'delegation'
                          ? 'bg-purple-50 dark:bg-purple-900/30'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}
                    >
                      <div className={`${
                        msg.type === 'text'
                          ? 'text-gray-900 dark:text-gray-100 whitespace-pre-wrap'
                          : msg.type === 'system' || msg.type === 'start' || msg.type === 'complete'
                          ? 'text-blue-600 dark:text-blue-400 text-sm'
                          : msg.type === 'tool'
                          ? 'text-gray-600 dark:text-gray-400 text-sm'
                          : msg.type === 'delegation'
                          ? 'text-purple-600 dark:text-purple-400 text-sm'
                          : 'text-gray-600 dark:text-gray-400 text-sm'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 进度指示器 */}
              <div className="flex justify-center gap-2 mt-6">
                <div className={`w-3 h-3 rounded-full ${reviewStep === "creating" ? "bg-primary" : "bg-primary/30"}`} />
                <div className={`w-3 h-3 rounded-full ${reviewStep === "analyzing" ? "bg-primary animate-pulse" : "bg-primary/30"}`} />
                <div className="w-3 h-3 rounded-full bg-primary/30" />
              </div>
            </div>
          )}

          {/* 步骤4: 完成 */}
          {reviewStep === "completed" && (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </div>
              <div className="text-center">
                <p className="font-medium text-green-600">审查完成！</p>
                <p className="text-sm text-muted-foreground mt-2">
                  正在跳转到报告详情...
                </p>
              </div>
            </div>
          )}

          {/* 错误状态 */}
          {reviewStep === "error" && (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
              <div className="text-center">
                <p className="font-medium text-destructive">审查失败</p>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
              </div>
              <div className="flex justify-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    setReviewStep("select");
                  }}
                >
                  重试
                </Button>
                <Button variant="outline" onClick={() => router.push(`/projects/${projectId}/reports`)}>
                  返回
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ClipboardCheck, Loader2, FileText, ArrowLeft } from "lucide-react";
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

export default function NewReportPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { toast } = useToast();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, [projectId]);

  async function fetchDocuments() {
    try {
      const response = await fetch(`/api/projects/${projectId}/documents`);
      if (response.ok) {
        const data = await response.json();
        // 只显示已解析完成的文档
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

  async function handleCreateReport() {
    if (!selectedDoc) {
      toast({
        title: "请选择文档",
        description: "请选择要审查的文档",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      // 创建审查报告
      const response = await fetch(`/api/projects/${projectId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: selectedDoc }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "审查任务已创建",
          description: "正在准备审查，请稍候查看结果",
        });
        router.push(`/reports/${data.report.id}`);
      } else {
        const error = await response.json();
        toast({
          title: "创建失败",
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
      setIsCreating(false);
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
    <div className="max-w-2xl mx-auto space-y-6">
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
        <h2 className="text-3xl font-bold tracking-tight">创建审查任务</h2>
        <p className="text-muted-foreground">
          选择已解析完成的文档进行合规性审查
        </p>
      </div>

      {/* 文档选择 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            选择审查文档
          </CardTitle>
          <CardDescription>
            仅显示已解析完成的文档，请选择要进行合规性审查的文档
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                暂无已解析的文档，请先上传并解析文档
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
              <div className="grid gap-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedDoc === doc.id
                        ? "border-primary bg-primary/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setSelectedDoc(doc.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">{doc.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {getDocTypeLabel(doc.docType)} ·
                            上传于 {new Date(doc.createdAt).toLocaleDateString("zh-CN")}
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

              <div className="flex gap-4">
                <Button
                  onClick={handleCreateReport}
                  disabled={isCreating || !selectedDoc}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      开始审查
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/projects/${projectId}`)}
                  disabled={isCreating}
                >
                  取消
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
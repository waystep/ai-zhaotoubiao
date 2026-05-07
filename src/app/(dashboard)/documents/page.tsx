"use client";

import { useState, useEffect } from "react";
import { FileText, Loader2, CheckCircle, XCircle, Clock, FolderOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

interface Document {
  id: string;
  name: string;
  docType: string;
  parseStatus: string;
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

  useEffect(() => {
    fetchDocuments();
  }, []);

  async function fetchDocuments() {
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
          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/documents/${doc.id}`}
            >
              <Card className="hover:border-primary transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-4">
                    <FileText className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">{doc.name}</CardTitle>
                      <CardDescription>
                        {getDocTypeLabel(doc.docType)} ·
                        {doc.project?.name && (
                          <span className="ml-2">
                            <FolderOpen className="inline h-3 w-3 mr-1" />
                            {doc.project.name}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getParseStatusIcon(doc.parseStatus)}
                    <span className="text-sm text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString("zh-CN")}
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
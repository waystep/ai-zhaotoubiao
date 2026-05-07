import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { tenderProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  FolderOpen,
  FileText,
  ClipboardCheck,
  Plus,
  Calendar,
  DollarSign,
  Settings,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { projectId } = await params;

  // 获取项目详情
  const project = await db.query.tenderProjects.findFirst({
    where: eq(tenderProjects.id, projectId),
    with: {
      creator: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  // 验证权限
  if (project.orgId !== session.user?.orgId) {
    redirect("/projects");
  }

  return (
    <div className="space-y-6">
      {/* 项目头部 */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/projects"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回项目列表
          </Link>
          <h2 className="text-3xl font-bold tracking-tight">{project.name}</h2>
          <p className="text-muted-foreground">
            项目编号: {project.projectNo}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/projects/${projectId}/documents/upload`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              上传文件
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/settings`}>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              设置
            </Button>
          </Link>
        </div>
      </div>

      {/* 项目信息卡片 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">状态</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {project.status === "draft"
                ? "草稿"
                : project.status === "published"
                ? "已发布"
                : project.status === "bidding"
                ? "投标中"
                : project.status === "reviewing"
                ? "审查中"
                : project.status === "completed"
                ? "已完成"
                : "已归档"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">预算金额</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {project.budget ? `¥${project.budget}` : "未设置"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">截标时间</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {project.deadline
                ? new Date(project.deadline).toLocaleDateString("zh-CN")
                : "未设置"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 项目描述 */}
      {project.description && (
        <Card>
          <CardHeader>
            <CardTitle>项目描述</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{project.description}</p>
          </CardContent>
        </Card>
      )}

      {/* 快速操作 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              文档管理
            </CardTitle>
            <CardDescription>
              上传和管理招标文件、法律文件、投标文件
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Link href={`/projects/${projectId}/documents`}>
              <Button variant="outline" className="w-full justify-start">
                查看所有文档
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/documents/upload`}>
              <Button variant="outline" className="w-full justify-start">
                <Plus className="mr-2 h-4 w-4" />
                上传新文档
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              审查报告
            </CardTitle>
            <CardDescription>
              查看和管理审查报告和问题清单
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Link href={`/projects/${projectId}/reports`}>
              <Button variant="outline" className="w-full justify-start">
                查看所有报告
              </Button>
            </Link>
            <Link href={`/projects/${projectId}/reports/new`}>
              <Button variant="outline" className="w-full justify-start">
                <Plus className="mr-2 h-4 w-4" />
                创建审查任务
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
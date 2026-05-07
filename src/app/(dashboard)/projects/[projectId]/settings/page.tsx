"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProjectSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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
        <h2 className="text-3xl font-bold tracking-tight">项目设置</h2>
        <p className="text-muted-foreground">本项目的配置与权限（功能开发中）</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            项目参数
          </CardTitle>
          <CardDescription>
            项目可见范围、成员与通知等将在此管理，当前版本为占位页面。
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          敬请期待
        </CardContent>
      </Card>
    </div>
  );
}

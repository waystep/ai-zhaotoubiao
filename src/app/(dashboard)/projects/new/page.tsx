"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function NewProjectPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const name = formData.get("name") as string;
    const projectNo = formData.get("projectNo") as string;
    const description = formData.get("description") as string;
    const tenderType = formData.get("tenderType") as string;
    const budget = formData.get("budget") as string;
    const deadline = formData.get("deadline") as string;

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          projectNo: projectNo || undefined,
          description: description || undefined,
          tenderType: tenderType || undefined,
          budget: budget ? parseFloat(budget) : undefined,
          deadline: deadline || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "项目创建成功",
          description: "正在跳转到项目详情页...",
        });
        router.push(`/projects/${data.project.id}`);
        router.refresh();
      } else {
        const error = await response.json();
        toast({
          title: "创建失败",
          description: error.error || "请检查输入信息",
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
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => router.push("/projects")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回项目列表
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">创建新项目</h2>
        <p className="text-muted-foreground">
          填写项目信息，创建招标审查项目
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            项目信息
          </CardTitle>
          <CardDescription>
            填写招标项目的基本信息
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">项目名称 *</Label>
              <Input
                id="name"
                name="name"
                placeholder="如：2024年度办公设备采购项目"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectNo">项目编号</Label>
              <Input
                id="projectNo"
                name="projectNo"
                placeholder="如：TEND-2024-001（自动生成）"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">项目描述</Label>
              <Input
                id="description"
                name="description"
                placeholder="项目简介和说明"
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tenderType">招标类型</Label>
                <Input
                  id="tenderType"
                  name="tenderType"
                  placeholder="如：公开招标"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">预算金额（元）</Label>
                <Input
                  id="budget"
                  name="budget"
                  type="number"
                  placeholder="如：100000"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deadline">截标时间</Label>
              <Input
                id="deadline"
                name="deadline"
                type="datetime-local"
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    创建中...
                  </>
                ) : (
                  "创建项目"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/projects")}
                disabled={isLoading}
              >
                取消
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
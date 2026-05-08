"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardCheck, FileText, FolderOpen, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TruncatedText } from "@/components/ui/truncated-text";
import { useDashboardScrollRestoration } from "@/hooks/use-dashboard-scroll-restoration";

type Project = {
  id: string;
  name: string;
  projectNo: string;
  status: string | null;
};

function projectStatusLabel(status: string | null) {
  switch (status) {
    case "draft":
      return "草稿";
    case "published":
      return "已发布";
    case "bidding":
      return "投标中";
    case "reviewing":
      return "审查中";
    case "completed":
      return "已完成";
    case "archived":
      return "已归档";
    default:
      return "未知";
  }
}

function projectStatusStyle(status: string | null) {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-600";
    case "published":
      return "bg-blue-100 text-blue-600";
    case "bidding":
      return "bg-indigo-100 text-indigo-700";
    case "reviewing":
      return "bg-yellow-100 text-yellow-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "archived":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function ProjectsList({ projects }: { projects: Project[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const { saveNow } = useDashboardScrollRestoration(`projects?q=${q}&status=${status}`);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (status && (p.status ?? "") !== status) return false;
      if (!query) return true;
      const hay = `${p.name} ${p.projectNo}`.toLowerCase();
      return hay.includes(query);
    });
  }, [projects, q, status]);

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (status) {
    chips.push({
      key: "status",
      label: `项目状态：${projectStatusLabel(status)}`,
      onRemove: () => setStatus(""),
    });
  }
  if (q.trim()) {
    chips.push({
      key: "q",
      label: `搜索：${q.trim()}`,
      onRemove: () => setQ(""),
    });
  }

  return (
    <div className="space-y-6">
      {/* 吸顶筛选条 */}
      <div className="sticky top-0 z-10 -mx-6 border-b bg-background/85 px-6 py-4 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 min-w-0">
            <label className="text-sm text-muted-foreground">搜索（项目名/编号）</label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="输入关键词…" />
          </div>
          <div className="w-full md:w-[200px]">
            <label className="text-sm text-muted-foreground">项目状态</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">全部</option>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="bidding">投标中</option>
              <option value="reviewing">审查中</option>
              <option value="completed">已完成</option>
              <option value="archived">已归档</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                setStatus("");
              }}
            >
              清空
            </Button>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.onRemove}
                className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
                title="点击移除筛选"
              >
                <span className="truncate">{c.label}</span>
                <span className="text-muted-foreground">×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">项目列表</h2>
          <p className="text-muted-foreground">管理您的招标审查项目</p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            创建项目
          </Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">暂无项目</h3>
            <p className="text-muted-foreground text-center mb-4">
              点击上方按钮创建您的第一个招标审查项目
            </p>
            <Link href="/projects/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                创建项目
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">共 {filtered.length} 条</div>
            {status && (
              <Badge variant="outline" title="当前正在按状态筛选">
                已筛选
              </Badge>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} onClick={() => saveNow()}>
                <Card className="hover:border-primary transition-colors">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-primary" />
                      <TruncatedText text={project.name} />
                    </CardTitle>
                    <CardDescription>
                      项目编号: <TruncatedText text={project.projectNo} className="inline-block max-w-[240px] align-bottom" />
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        <span>文档</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <ClipboardCheck className="h-4 w-4" />
                        <span>审查报告</span>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${projectStatusStyle(project.status)}`}>
                        {projectStatusLabel(project.status)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


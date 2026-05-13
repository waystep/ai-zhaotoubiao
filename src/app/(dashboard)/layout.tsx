"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Bot,
  ClipboardCheck,
  FileText,
  LogOut,
  Plus,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ProjectOption = {
  id: string;
  name: string;
  projectNo: string;
};

type ProjectApiItem = ProjectOption & {
  [key: string]: unknown;
};

function navItemIsActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return href !== "/" && pathname.startsWith(`${href}/`);
}

function selectedProjectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  if (!match) return null;
  if (match[1] === "new") return null;
  return match[1];
}

function projectsRouteSegment(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] ?? null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const selectedProjectId = selectedProjectIdFromPath(pathname);
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  /** 路径里 /projects/:id 段变化时重新拉列表（如从「新建」进入新项目），避免 header 下拉仍为旧数据 */
  const projectListFetchKey = useMemo(
    () => `${session?.user?.id ?? ""}:${projectsRouteSegment(pathname) ?? ""}`,
    [pathname, session?.user?.id]
  );

  useEffect(() => {
    let ignore = false;
    async function fetchProjects() {
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (ignore) return;
        setProjects(
          ((data.projects ?? []) as ProjectApiItem[]).map((project) => ({
            id: project.id,
            name: project.name,
            projectNo: project.projectNo,
          }))
        );
      } catch (error) {
        console.error("获取项目列表失败:", error);
      }
    }

    void fetchProjects();
    return () => {
      ignore = true;
    };
  }, [projectListFetchKey]);

  const projectNavigation = selectedProjectId
    ? [
        {
          name: "文档管理",
          href: `/projects/${selectedProjectId}/documents`,
          icon: FileText,
        },
        {
          name: "审查报告",
          href: `/projects/${selectedProjectId}/reports`,
          icon: ClipboardCheck,
        },
      ]
    : [];

  const globalNavigation = [
    {
      name: "AI 助手",
      href: "/chat",
      icon: Bot,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 统一的顶部 Header - 全宽 */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-4 px-6 h-14">
          {/* Logo */}
          <Link href="/projects" className="flex items-center gap-2.5 rounded-lg shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">智能招标审查</span>
          </Link>

          {/* 项目选择器 + 用户信息 - 靠右 */}
          <div className="flex items-center gap-3 ml-auto">
            <Select
              value={selectedProjectId ?? ""}
              onValueChange={(projectId) => {
                if (projectId === "__new") {
                  router.push("/projects/new");
                  return;
                }
                router.push(`/projects/${projectId}/documents`);
              }}
            >
              <SelectTrigger className="h-9 w-[280px] bg-card">
                <SelectValue placeholder="选择项目" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <span className="block truncate">{project.name}</span>
                  </SelectItem>
                ))}
                <SelectItem value="__new">创建新项目</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full shrink-0">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={session?.user?.image || ""} />
                    <AvatarFallback>{session?.user?.name?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <div className="truncate text-sm font-medium">
                    {session?.user?.name || "User"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {session?.user?.email}
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">设置</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* 下方：Sidebar + Main 并排 */}
      <div className="flex min-h-0 flex-1">
        {/* 侧边栏导航 */}
        <aside className="flex w-56 shrink-0 flex-col border-r bg-card/50">
          <nav className="flex-1 space-y-1 p-3">
            {/* 全局导航 */}
            {globalNavigation.map((item) => {
              const isActive = navItemIsActive(pathname, item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}

            {/* 项目工作区 */}
            {selectedProjectId && (
              <>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  项目工作区
                </div>
                {projectNavigation.map((item) => {
                  const isActive = navItemIsActive(pathname, item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  );
                })}
              </>
            )}

            {!selectedProjectId && pathname !== "/chat" && (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                请在上方选择项目后进入文档管理和审查报告。
              </div>
            )}
          </nav>

          <div className="border-t p-3">
            <Link href="/projects/new">
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Plus className="mr-2 h-4 w-4" />
                创建项目
              </Button>
            </Link>
          </div>
        </aside>

        {/* 主内容区域 */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            id="dashboard-scroll"
            className="min-h-0 flex-1 overflow-auto p-4 [scrollbar-gutter:stable]"
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

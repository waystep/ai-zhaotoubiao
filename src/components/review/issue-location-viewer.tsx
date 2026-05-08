"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface IssueLocation {
  pageNumber: number;
  blockIndex: number;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  textSnippet?: string;
  highlightText?: string;
}

interface ReviewIssue {
  id: string;
  category: string;
  severity: "critical" | "major" | "minor" | "suggestion";
  title: string;
  description: string;
  location: IssueLocation;
  suggestion?: string | null | undefined;
  isResolved: boolean;
}

interface IssueLocationViewerProps {
  issues: ReviewIssue[];
  currentPage?: number;
  onIssueClick?: (issue: ReviewIssue) => void;
  onIssueHover?: (issue: ReviewIssue | null) => void;
  hoveredIssueId?: string;
  issueNoById?: Record<string, number>;
}

const severityColors = {
  critical: "bg-red-100 text-red-700 border-red-200",
  major: "bg-orange-100 text-orange-700 border-orange-200",
  minor: "bg-yellow-100 text-yellow-700 border-yellow-200",
  suggestion: "bg-blue-100 text-blue-700 border-blue-200",
};

const severityLabels = {
  critical: "严重",
  major: "重要",
  minor: "轻微",
  suggestion: "建议",
};

export function IssueLocationViewer({
  issues,
  currentPage,
  onIssueClick,
  onIssueHover,
  hoveredIssueId,
  issueNoById,
}: IssueLocationViewerProps) {
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<"follow" | "all">("all");
  const [severity, setSeverity] = useState<"all" | ReviewIssue["severity"]>("all");
  const [resolved, setResolved] = useState<"all" | "resolved" | "unresolved">("all");
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  function toggleIssue(issueId: string) {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  }

  const filteredIssues = useMemo(() => {
    let list = issues;
    if (scope === "follow" && currentPage) {
      list = list.filter((i) => i.location.pageNumber === currentPage);
    }
    if (severity !== "all") {
      list = list.filter((i) => i.severity === severity);
    }
    if (resolved !== "all") {
      const wantResolved = resolved === "resolved";
      list = list.filter((i) => i.isResolved === wantResolved);
    }
    return list;
  }, [issues, scope, currentPage, severity, resolved]);

  const hoveredIssue = useMemo(() => {
    if (!hoveredIssueId) return null;
    return issues.find((i) => i.id === hoveredIssueId) ?? null;
  }, [hoveredIssueId, issues]);

  const hoveredVisible = useMemo(() => {
    if (!hoveredIssueId) return false;
    return filteredIssues.some((i) => i.id === hoveredIssueId);
  }, [hoveredIssueId, filteredIssues]);

  // hover 仅用于联动/高亮，不自动展开（避免打断阅读）

  function revealIssueInList(issueId: string) {
    // if current filters exclude it, switch to all first
    if (!filteredIssues.some((i) => i.id === issueId)) {
      setScope("all");
      setSeverity("all");
      setResolved("all");
      requestAnimationFrame(() => revealIssueInList(issueId));
      return;
    }

    setExpandedIssues((prev) => {
      const next = new Set(prev);
      next.add(issueId);
      return next;
    });

    requestAnimationFrame(() => {
      const el = itemRefs.current.get(issueId);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  // 按严重程度分组
  const groupedIssues = useMemo(() => {
    return {
      critical: filteredIssues.filter((i) => i.severity === "critical"),
      major: filteredIssues.filter((i) => i.severity === "major"),
      minor: filteredIssues.filter((i) => i.severity === "minor"),
      suggestion: filteredIssues.filter((i) => i.severity === "suggestion"),
    };
  }, [filteredIssues]);

  return (
    <div className="space-y-4">
      {/* 问题统计 */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-700">
            {groupedIssues.critical.length}
          </div>
          <div className="text-xs text-red-600">严重问题</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-orange-700">
            {groupedIssues.major.length}
          </div>
          <div className="text-xs text-orange-600">重要问题</div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-yellow-700">
            {groupedIssues.minor.length}
          </div>
          <div className="text-xs text-yellow-600">轻微问题</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-700">
            {groupedIssues.suggestion.length}
          </div>
          <div className="text-xs text-blue-600">建议项</div>
        </div>
      </div>

      {/* 问题列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              问题定位
              {scope === "follow" && currentPage && <Badge variant="outline">第 {currentPage} 页</Badge>}
              {scope === "all" && <Badge variant="secondary">全部问题</Badge>}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "follow" | "all")}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title="范围"
              >
                <option value="follow">当前页（跟随）</option>
                <option value="all">全部问题</option>
              </select>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as typeof severity)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title="严重程度"
              >
                <option value="all">全部严重程度</option>
                <option value="critical">严重</option>
                <option value="major">重要</option>
                <option value="minor">轻微</option>
                <option value="suggestion">建议</option>
              </select>
              <select
                value={resolved}
                onChange={(e) => setResolved(e.target.value as typeof resolved)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title="处理状态"
              >
                <option value="all">全部状态</option>
                <option value="unresolved">待处理</option>
                <option value="resolved">已解决</option>
              </select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hoveredIssue && !hoveredVisible && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2 text-xs">
              <div className="min-w-0 text-muted-foreground">
                <span className="font-medium text-foreground">
                  #{issueNoById?.[hoveredIssue.id] ?? "-"} {hoveredIssue.title}
                </span>{" "}
                · 第 {hoveredIssue.location.pageNumber} 页
              </div>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => revealIssueInList(hoveredIssue.id)}>
                在列表中定位
              </Button>
            </div>
          )}
          {filteredIssues.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              {scope === "follow" && currentPage ? "当前页未发现问题" : "暂无数据"}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredIssues.map((issue) => (
                <div
                  key={issue.id}
                  ref={(el) => {
                    if (!el) {
                      itemRefs.current.delete(issue.id);
                      return;
                    }
                    itemRefs.current.set(issue.id, el);
                  }}
                  className={`rounded-lg border cursor-pointer transition-all ${
                   hoveredIssueId === issue.id
                        ? "border-primary/60 ring-2 ring-primary/10"
                        : "border-transparent hover:border-gray-200"
                  } ${severityColors[issue.severity]}`}
                  onClick={() => onIssueClick?.(issue)}
                  onMouseEnter={() => onIssueHover?.(issue)}
                  onMouseLeave={() => onIssueHover?.(null)}
                >
                  <div
                    className="p-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleIssue(issue.id);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border bg-background px-1 text-xs font-semibold tabular-nums">
                          {issueNoById?.[issue.id] ?? ""}
                        </span>
                        <Badge className={severityColors[issue.severity]}>
                          {severityLabels[issue.severity]}
                        </Badge>
                        <span className="font-medium">{issue.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs">
                          第 {issue.location.pageNumber} 页
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            onIssueClick?.(issue);
                          }}
                          title="定位到 PDF 对应位置"
                        >
                          <Eye className="h-3 w-3" />
                          定位
                        </Button>
                        {expandedIssues.has(issue.id) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>

                    {expandedIssues.has(issue.id) && (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm">{issue.description}</p>

                        {issue.location.textSnippet && (
                          <div className="bg-white/50 p-2 rounded text-sm font-mono">
                            「{issue.location.textSnippet}」
                            {issue.location.highlightText && (
                              <mark className="bg-yellow-300 px-1 rounded ml-1">
                                {issue.location.highlightText}
                              </mark>
                            )}
                          </div>
                        )}

                        {issue.suggestion && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium">建议：</span>
                            {issue.suggestion}
                          </p>
                        )}

                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            {issue.category}
                          </Badge>
                          <Badge
                            variant={issue.isResolved ? "default" : "secondary"}
                          >
                            {issue.isResolved ? "已解决" : "待处理"}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
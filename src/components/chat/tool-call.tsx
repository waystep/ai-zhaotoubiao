"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircle2Icon, ClockIcon, ChevronDownIcon, Loader2Icon, XCircleIcon,
  BotIcon, WrenchIcon, FileTextIcon, SearchIcon, GlobeIcon, DatabaseIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type ToolCallProps = ComponentProps<"div"> & {
  toolName: string;
  state?: "pending" | "running" | "complete" | "error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

// 判断是否为子智能体调用
function isAgentTool(toolName: string): boolean {
  return toolName.startsWith("agent-");
}

// 子智能体名称美化
function formatAgentName(toolName: string): string {
  const nameMap: Record<string, string> = {
    "agent-extraction-agent": "审查项提取",
    "agent-tenderReviewAgent": "投标文件审查",
    "agent-tenderResponseAgent": "响应项评估",
    "agent-reportGenerationAgent": "报告生成",
    "agent-image-review-agent": "图像风险分析",
  };
  return nameMap[toolName] || toolName.replace(/^agent-/, "").replace(/-/g, " ");
}

// 根据工具名推断图标
function getToolIcon(toolName: string) {
  if (isAgentTool(toolName)) return <BotIcon className="size-4" />;
  const name = toolName.toLowerCase();
  if (name.includes("document-reader") || name.includes("reader")) return <FileTextIcon className="size-4" />;
  if (name.includes("search") || name.includes("semantic")) return <SearchIcon className="size-4" />;
  if (name.includes("web")) return <GlobeIcon className="size-4" />;
  if (name.includes("storage") || name.includes("get-review") || name.includes("get-response") || name.includes("get-report")) return <DatabaseIcon className="size-4" />;
  return <WrenchIcon className="size-4" />;
}

const getStateIcon = (state?: string) => {
  switch (state) {
    case "pending":
      return <ClockIcon className="size-4 text-muted-foreground" />;
    case "running":
      return <Loader2Icon className="size-4 animate-spin text-primary" />;
    case "complete":
      return <CheckCircle2Icon className="size-4 text-green-500" />;
    case "error":
      return <XCircleIcon className="size-4 text-destructive" />;
    default:
      return <ClockIcon className="size-4 text-muted-foreground" />;
  }
};

const getStateLabel = (state?: string) => {
  switch (state) {
    case "pending": return "等待执行";
    case "running": return "正在执行";
    case "complete": return "已完成";
    case "error": return "执行失败";
    default: return state || "未知";
  }
};

const truncate = (s: string, max = 500): string =>
  s.length <= max ? s : s.substring(0, max) + "...";

export const ToolCall = ({
  toolName,
  state,
  input,
  output,
  errorText,
  className,
  ...props
}: ToolCallProps) => {
  const agent = isAgentTool(toolName);
  const hasDetails = (input != null || output != null || !!errorText) && state !== "running";

  return (
    <Collapsible defaultOpen={state === "running"} className={cn(
      "rounded-lg border text-sm",
      agent && "border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20",
      !agent && state === "error"
        ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30"
        : !agent && state === "complete"
        ? "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/30"
        : !agent && state === "running"
        ? "border-primary/50 bg-primary/5"
        : !agent && "border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-950/30",
      className
    )} {...props}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 p-3 cursor-pointer hover:bg-muted/30 transition-colors">
        {getStateIcon(state)}
        <span className={cn(
          agent ? "text-indigo-700 dark:text-indigo-300" :
          state === "error" ? "text-red-700 dark:text-red-300" :
          state === "complete" ? "text-green-700 dark:text-green-300" :
          state === "running" ? "text-primary" :
          "text-yellow-700 dark:text-yellow-300"
        )}>
          {getToolIcon(toolName)}
        </span>
        <span className={cn(
          "font-medium",
          agent ? "text-indigo-800 dark:text-indigo-200" :
          state === "error" ? "text-red-700 dark:text-red-300" :
          state === "complete" ? "text-green-700 dark:text-green-300" :
          state === "running" ? "text-primary" :
          "text-yellow-700 dark:text-yellow-300"
        )}>
          {agent ? formatAgentName(toolName) : toolName.replace(/^tool-/, "").replace(/([A-Z])/g, " $1").trim()}
        </span>
        <span className="text-muted-foreground text-xs">({getStateLabel(state)})</span>
        {hasDetails && (
          <ChevronDownIcon className="size-4 ml-auto transition-transform text-muted-foreground group-data-[state=open]:rotate-180" />
        )}
      </CollapsibleTrigger>

      {hasDetails && (
        <CollapsibleContent className="px-3 pb-3">
          {input != null && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">
                {agent ? "委托内容:" : "输入:"}
              </p>
              <pre className="overflow-auto rounded bg-muted/50 p-2 text-xs max-h-[400px] whitespace-pre-wrap">
                {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {output != null && state === "complete" && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">
                {agent ? "子智能体回复:" : "输出:"}
              </p>
              <pre className="overflow-auto rounded bg-green-100/50 dark:bg-green-900/20 p-2 text-xs max-h-[600px] whitespace-pre-wrap">
                {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
          {errorText && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-300">错误: {errorText}</div>
          )}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};

export type ToolCallsProps = ComponentProps<"div">;

export const ToolCalls = ({ className, children, ...props }: ToolCallsProps) => (
  <div className={cn("space-y-2 mt-2", className)} {...props}>
    {children}
  </div>
);

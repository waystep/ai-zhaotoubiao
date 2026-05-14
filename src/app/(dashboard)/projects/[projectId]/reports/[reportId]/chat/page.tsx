"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowLeft, Bot, CopyIcon, RefreshCcwIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  Message,
  MessageContent,
  Loader,
  Actions,
  Action,
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  PromptInputAttachments,
  PromptInputAttachment,
  Response,
  ToolCall,
} from "@/components/chat";

interface Report {
  id: string;
  status: string;
  projectId: string;
  documentId: string;
  document?: { name: string };
  project?: { name: string };
}

export default function ReportChatPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const reportId = params.reportId as string;

  const [input, setInput] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const pendingCommandRef = useRef<string | undefined>(undefined);

  const { messages, sendMessage, setMessages, status, error, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: nextMessages, body }) => {
        const command = pendingCommandRef.current;
        pendingCommandRef.current = undefined;

        return {
          body: {
            ...(body || {}),
            reportId,
            threadId: reportId,
            resourceId: reportId,
            command,
            messages: nextMessages.slice(-1),
          },
        };
      },
    }),
  });

  const fetchReport = useCallback(async () => {
    const res = await fetch(`/api/reports/${reportId}`, { cache: "no-store" });
    const data = await res.json();
    setReport(data.report);
  }, [reportId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await fetchReport();
        const res = await fetch(`/api/chat?reportId=${reportId}`, { cache: "no-store" });
        const history = (await res.json()) as UIMessage[];
        if (!cancelled) {
          setMessages(history);
          setHistoryLoaded(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchReport, reportId, setMessages]);

  useEffect(() => {
    if (status === "ready") {
      void fetchReport();
    }
  }, [fetchReport, status]);

  const isStreaming = status === "submitted" || status === "streaming";

  const startReview = async () => {
    if (!report) return;

    pendingCommandRef.current = "start-review";
    await sendMessage({
      text: `请开始审查这份报告。

报告ID: ${report.id}
项目ID: ${report.projectId}
文档ID: ${report.documentId}
文档名称: ${report.document?.name ?? ""}`,
    });
  };

  const handleSubmit = (message: { text?: string }) => {
    if (!message.text?.trim() || isStreaming) return;
    sendMessage({ text: message.text });
    setInput("");
  };

  if (isLoading || !historyLoaded) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-0 md:p-6 relative size-full min-h-[600px]">
      <Button
        variant="ghost"
        onClick={() => router.push(`/projects/${projectId}/reports/${reportId}`)}
        className="mb-3"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        查看报告详情
      </Button>

      {/* Header */}
      <div className="mb-4">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5" />
              审查会话 #{reportId.slice(0, 8)}
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              项目: {report?.project?.name} | 文档: {report?.document?.name}
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Chat Container */}
      <Card className="flex flex-col h-full min-h-[500px]">
        <CardContent className="flex flex-col h-full p-0">
          <Conversation className="h-full flex-1">
            <ConversationContent>
              {messages.length === 0 && !isStreaming && (
                <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
                  <Bot className="h-12 w-12 text-muted-foreground" />
                  <div className="space-y-1">
                    <h3 className="font-medium">点击下方按钮开始审查</h3>
                    <p className="text-muted-foreground text-sm">
                      AI 将自动分析投标文件的合规性
                    </p>
                  </div>
                </div>
              )}

              {messages.map((message) => {
                const isLastAssistantMessage =
                  message.role === "assistant" &&
                  message.id === messages[messages.length - 1]?.id;

                return (
                  <div key={message.id} className="space-y-2">
                    {/* Tool calls first */}
                    {message.parts.map((part, index) => {
                      const partType = String(part.type);

                      // 处理子智能体执行事件中的文本（直接混入对话流）
                      if (partType.startsWith("agent-execution-event-")) {
                        const eventType = partType.replace("agent-execution-event-", "");
                        if (eventType === "text-delta" || eventType === "text") {
                          const textContent = (part as { text?: string; payload?: { text?: string } }).text || (part as { text?: string; payload?: { text?: string } }).payload?.text || "";
                          if (textContent) {
                            return (
                              <Message key={`${message.id}-agent-${index}`} from="assistant">
                                <MessageContent>
                                  <Response>{textContent}</Response>
                                </MessageContent>
                              </Message>
                            );
                          }
                        }
                        return null; // 其他事件类型暂不显示
                      }

                      // 处理普通工具调用
                      if (partType.startsWith("tool-")) {
                        const toolPart = part as unknown as {
                          type: string;
                          state?: string;
                          input?: unknown;
                          output?: unknown;
                          errorText?: string;
                        };
                        const toolName = toolPart.type.replace(/^tool-/, "");
                        // Map AI SDK states to display states
                        const mapState = (sdkState?: string): "pending" | "running" | "complete" | "error" | undefined => {
                          if (sdkState === "output-available" || sdkState === "output-error") return "complete";
                          if (sdkState === "input-available" || sdkState === "input-streaming") return "running";
                          if (sdkState === "pending") return "pending";
                          if (sdkState === "error") return "error";
                          return undefined;
                        };
                        return (
                          <ToolCall
                            key={`${message.id}-tool-${index}`}
                            toolName={toolName}
                            state={mapState(toolPart.state)}
                            input={toolPart.input}
                            output={toolPart.output}
                            errorText={toolPart.errorText}
                          />
                        );
                      }

                      // 处理普通文本
                      if (part.type === "text") {
                        const textPart = part as { text: string };
                        return (
                          <Fragment key={`${message.id}-text-${index}`}>
                            <Message from={message.role}>
                              <MessageContent>
                                <Response>{textPart.text}</Response>
                              </MessageContent>
                            </Message>
                            {isLastAssistantMessage && (
                              <Actions className="mt-2">
                                <Action onClick={() => regenerate()} label="重试">
                                  <RefreshCcwIcon className="size-3" />
                                </Action>
                                <Action
                                  onClick={() =>
                                    navigator.clipboard.writeText(textPart.text)
                                  }
                                  label="复制"
                                >
                                  <CopyIcon className="size-3" />
                                </Action>
                              </Actions>
                            )}
                          </Fragment>
                        );
                      }

                      return null;
                    })}
                  </div>
                );
              })}

              {status === "submitted" && <Loader className="py-4" size={20} />}

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">
                  {error.message}
                </div>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          {/* Input Area */}
          <div className="border-t p-4">
            {messages.length === 0 && !isStreaming && (
              <Button onClick={startReview} className="w-full mb-4">
                <Bot className="mr-2 h-4 w-4" />
                开始审查
              </Button>
            )}

            {(messages.length > 0 || report?.status === "in_progress" || report?.status === "completed") && (
              <PromptInput onSubmit={handleSubmit}>
                <PromptInputBody>
                  <PromptInputAttachments>
                    {(attachment) => <PromptInputAttachment data={attachment} />}
                  </PromptInputAttachments>
                  <PromptInputTextarea
                    onChange={(e) => setInput(e.target.value)}
                    value={input}
                    placeholder="输入补充指令或问题..."
                    disabled={isStreaming}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
                  </PromptInputTools>
                  <PromptInputSubmit disabled={!input.trim() || isStreaming} status={status} />
                </PromptInputFooter>
              </PromptInput>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
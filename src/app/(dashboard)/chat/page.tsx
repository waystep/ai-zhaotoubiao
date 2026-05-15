"use client";

import { Fragment, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowLeft, CopyIcon, RefreshCcwIcon } from "lucide-react";

import { labelForReturnPath, sanitizeInternalReturnPath } from "@/lib/nav/from-chat-return";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  Message,
  MessageContent,
  Loader,
  Actions,
  Action,
  Suggestions,
  Suggestion,
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
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/chat";
import { ToolCall, ToolCalls } from "@/components/chat/tool-call";

const suggestions = [
  "帮我启动项目审查",
  "查看当前的审查状态",
  "重新提取招标文件审查项",
];

function ChatAssistantContent() {
  const searchParams = useSearchParams();
  const fromPath = sanitizeInternalReturnPath(searchParams.get("from"));
  const returnHref = fromPath ?? "/projects";
  const returnLabel = fromPath ? labelForReturnPath(fromPath) : "项目列表";

  const [input, setInput] = useState("");
  const { messages, sendMessage, status, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  const handleSubmit = (message: { text?: string; files?: unknown[] }) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);
    if (!(hasText || hasAttachments)) return;
    sendMessage({ text: message.text || "Sent with attachments" });
    setInput("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage({ text: suggestion });
  };

  return (
    <div className="relative mx-auto size-full max-w-4xl p-0 md:p-6">
      <Link
        href={returnHref}
        title={fromPath ? `返回进入 AI 助手前的页面：${fromPath}` : "返回项目列表"}
        className="mb-4 inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">
          {fromPath ? (
            <>
              返回<span className="text-foreground/90">（{returnLabel}）</span>
            </>
          ) : (
            "返回项目列表"
          )}
        </span>
      </Link>
      <div className="flex min-h-[600px] h-full flex-col">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 && (
              <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="space-y-1">
                  <h3 className="font-medium text-lg">智能招投标预审</h3>
                  <p className="text-muted-foreground text-sm">
                    发送消息或点击下方建议开始对话
                  </p>
                </div>
              </div>
            )}
            {messages.map((message, messageIndex) => {
              const isLastAssistantMessage =
                message.role === "assistant" &&
                messageIndex === messages.length - 1;

              const reasoningParts = message.parts.filter(
                (part) => part.type === "reasoning"
              );
              const hasReasoning = reasoningParts.length > 0;
              const isReasoningStreaming =
                isLastAssistantMessage &&
                status === "streaming" &&
                message.parts.at(-1)?.type === "reasoning";

              // 收集当轮的 tool 调用
              const toolMap = new Map<string, {
                toolCallId: string;
                toolName: string;
                state: "running" | "complete" | "error";
                input?: unknown;
                output?: unknown;
                errorText?: string;
              }>();
              for (const part of message.parts) {
                if (part.type === "tool-input-available" || part.type === "tool-input-start") {
                  const p = part as { toolCallId: string; toolName?: string; input?: unknown };
                  const entry = {
                    toolCallId: p.toolCallId,
                    toolName: p.toolName || "",
                    state: "running" as const,
                    input: p.input,
                  };
                  toolMap.set(p.toolCallId, entry);
                } else if (part.type === "tool-input-delta") {
                  const p = part as { toolCallId: string; inputTextDelta?: string };
                  const existing = toolMap.get(p.toolCallId);
                  if (existing) {
                    existing.input = (existing.input || "") + (p.inputTextDelta || "");
                  }
                } else if (part.type === "tool-output-available") {
                  const p = part as { toolCallId: string; output?: unknown; error?: unknown; errorText?: string };
                  const existing = toolMap.get(p.toolCallId);
                  if (existing) {
                    existing.state = p.error ? "error" : "complete";
                    existing.output = p.output;
                    if (p.error) existing.errorText = p.errorText || String(p.error);
                  }
                }
              }
              const toolParts = Array.from(toolMap.values());

              const hasTools = toolParts.length > 0;

              return (
                <div key={message.id}>
                  {hasReasoning && (
                    <Reasoning className="w-full" isStreaming={isReasoningStreaming}>
                      <ReasoningTrigger />
                      <ReasoningContent>
                        {reasoningParts
                          .map((part) => (part as { text?: string }).text ?? "")
                          .join("\n\n")}
                      </ReasoningContent>
                    </Reasoning>
                  )}

                  {/* Tool calls rendered as a group */}
                  {hasTools && (
                    <ToolCalls>
                      {toolParts.map((t) => (
                        <ToolCall
                          key={t.toolCallId}
                          toolName={t.toolName}
                          state={t.state}
                          input={t.input}
                          output={t.output}
                          errorText={t.errorText}
                        />
                      ))}
                    </ToolCalls>
                  )}

                  {/* Text messages */}
                  {message.parts.map((part, i) => {
                    if (part.type !== "text") return null;
                    const text = (part as { text: string }).text;
                    if (!text?.trim()) return null;

                    return (
                      <Fragment key={`${message.id}-${i}`}>
                        <Message from={message.role}>
                          <MessageContent>
                            <Response>{text}</Response>
                          </MessageContent>
                        </Message>
                        {isLastAssistantMessage && (
                          <Actions className="mt-2">
                            <Action onClick={() => regenerate()} label="重试">
                              <RefreshCcwIcon className="size-3" />
                            </Action>
                            <Action
                              onClick={() => navigator.clipboard.writeText(text)}
                              label="复制"
                            >
                              <CopyIcon className="size-3" />
                            </Action>
                          </Actions>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              );
            })}
            {status === "submitted" && <Loader className="py-4" />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {messages.length === 0 && (
          <Suggestions className="mt-4">
            {suggestions.map((suggestion) => (
              <Suggestion
                key={suggestion}
                onClick={handleSuggestionClick}
                suggestion={suggestion}
              />
            ))}
          </Suggestions>
        )}

        <PromptInput onSubmit={handleSubmit} className="mt-4" globalDrop multiple>
          <PromptInputBody>
            <PromptInputAttachments>
              {(attachment) => <PromptInputAttachment data={attachment} />}
            </PromptInputAttachments>
            <PromptInputTextarea
              onChange={(e) => setInput(e.target.value)}
              value={input}
              placeholder="输入审查指令..."
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
            <PromptInputSubmit disabled={!input && !status} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

export default function ChatAssistantPage() {
  return (
    <Suspense
      fallback={
        <div className="relative mx-auto flex min-h-[400px] max-w-4xl items-center justify-center p-6 text-sm text-muted-foreground">
          加载中…
        </div>
      }
    >
      <ChatAssistantContent />
    </Suspense>
  );
}
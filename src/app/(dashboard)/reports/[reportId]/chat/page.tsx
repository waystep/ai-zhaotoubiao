'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Bot, Send, ArrowLeft } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';

interface Report {
  id: string;
  projectId: string;
  documentId: string;
  document?: { name: string };
  project?: { name: string };
}

interface StreamMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
}

interface MessagePart {
  type: 'text' | 'tool-invocation' | 'tool-result';
  text?: string;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  state?: 'pending' | 'running' | 'complete';
}

interface ToolCallState {
  toolCallId: string;
  toolName: string;
  argsJson: string;
  args?: Record<string, unknown>;
  result?: unknown;
  state: 'pending' | 'running' | 'complete';
}

export default function ReportChatPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.reportId as string;

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [report, setReport] = useState<Report | null>(null);
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 用于累积工具调用参数
  const toolCallsRef = useRef<Map<string, ToolCallState>>(new Map());

  useEffect(() => {
    fetchReport();
  }, [reportId]);

  const fetchReport = async () => {
    try {
      const res = await fetch(`/api/reports/${reportId}`);
      const data = await res.json();
      setReport(data.report);
      setIsLoading(false);
    } catch {
      setIsLoading(false);
    }
  };

  // 处理 SSE 流事件
  const processStreamEvent = useCallback((eventData: Record<string, unknown>) => {
    const type = eventData.type as string;

    switch (type) {
      case 'start':
        // 新消息开始
        const messageId = eventData.messageId as string;
        setMessages(prev => [...prev, {
          id: messageId,
          role: 'assistant',
          parts: []
        }]);
        break;

      case 'text-delta':
        // 文本增量
        const textDelta = eventData.textDelta as string;
        if (textDelta) {
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              const textPart = lastMsg.parts.find(p => p.type === 'text');
              if (textPart) {
                textPart.text = (textPart.text || '') + textDelta;
              } else {
                lastMsg.parts.push({ type: 'text', text: textDelta });
              }
              return [...prev];
            }
            return prev;
          });
        }
        break;

      case 'tool-input-start':
        // 工具调用开始
        const toolCallId = eventData.toolCallId as string;
        const toolName = eventData.toolName as string;
        toolCallsRef.current.set(toolCallId, {
          toolCallId,
          toolName,
          argsJson: '',
          state: 'pending'
        });
        // 添加工具调用部分
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.parts.push({
              type: 'tool-invocation',
              toolCallId,
              toolName,
              state: 'pending'
            });
            return [...prev];
          }
          return prev;
        });
        break;

      case 'tool-input-delta':
        // 工具参数增量
        const deltaCallId = eventData.toolCallId as string;
        const inputDelta = eventData.inputTextDelta as string;
        const toolCall = toolCallsRef.current.get(deltaCallId);
        if (toolCall) {
          toolCall.argsJson += inputDelta;
          toolCall.state = 'running';
        }
        break;

      case 'tool-input-available':
        // 工具参数完成
        const availableCallId = eventData.toolCallId as string;
        const availableToolCall = toolCallsRef.current.get(availableCallId);
        if (availableToolCall) {
          try {
            availableToolCall.args = eventData.input as Record<string, unknown>;
            availableToolCall.state = 'running';
          } catch {
            // 解析失败的JSON
          }
          // 更新消息中的工具调用
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              const toolPart = lastMsg.parts.find(
                p => p.type === 'tool-invocation' && p.toolCallId === availableCallId
              );
              if (toolPart) {
                toolPart.args = availableToolCall.args;
                toolPart.state = 'running';
              }
              return [...prev];
            }
            return prev;
          });
        }
        break;

      case 'tool-output-available':
        // 工具执行结果
        const outputCallId = eventData.toolCallId as string;
        const outputToolCall = toolCallsRef.current.get(outputCallId);
        if (outputToolCall) {
          outputToolCall.result = eventData.output;
          outputToolCall.state = 'complete';
          // 更新消息中的工具调用
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              // 添加工具结果部分
              lastMsg.parts.push({
                type: 'tool-result',
                toolCallId: outputCallId,
                toolName: outputToolCall.toolName,
                result: outputToolCall.result,
                state: 'complete'
              });
              // 更新工具调用状态
              const toolPart = lastMsg.parts.find(
                p => p.type === 'tool-invocation' && p.toolCallId === outputCallId
              );
              if (toolPart) {
                toolPart.state = 'complete';
              }
              return [...prev];
            }
            return prev;
          });
        }
        break;

      case 'finish':
        // 流结束
        toolCallsRef.current.clear();
        break;
    }
  }, []);

  // 发送消息并处理 SSE 流
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming) return;

    setIsStreaming(true);
    setError(null);

    // 添加用户消息
    const userMessageId = `user-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: userMessageId,
      role: 'user',
      parts: [{ type: 'text', text: content }]
    }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: reportId,
          resourceId: reportId,
          reportId,
          projectId: report?.projectId,
          documentId: report?.documentId,
          content
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 格式
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;

            try {
              const eventData = JSON.parse(dataStr);
              processStreamEvent(eventData);
            } catch (parseErr) {
              console.error('Failed to parse SSE data:', dataStr, parseErr);
            }
          }
        }
      }

      setIsStreaming(false);
    } catch (err) {
      console.error('Stream error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsStreaming(false);
    }
  }, [reportId, report, isStreaming, processStreamEvent]);

  // 开始审查
  const startReview = useCallback(() => {
    sendMessage(`请开始审查这个报告。

报告信息：
- 报告ID: ${reportId}
- 项目ID: ${report?.projectId}
- 文档ID: ${report?.documentId}
- 文档名称: ${report?.document?.name}

请按照你的instructions执行完整的审查流程。`);
  }, [sendMessage, reportId, report]);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      {/* 报告信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            审查报告 #{reportId.slice(0, 8)}
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            项目: {report?.project?.name} | 文档: {report?.document?.name}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 消息列表 - ChatGPT风格 */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            {messages.length === 0 && !isStreaming && (
              <div className="text-center py-8 text-muted-foreground">
                点击下方按钮开始AI审查
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white p-3 rounded-lg ml-12'
                    : 'bg-white dark:bg-gray-800 p-3 rounded-lg mr-12'
                }`}
              >
                {message.parts.map((part, i) => {
                  if (part.type === 'text' && part.text) {
                    return (
                      <div key={i} className="whitespace-pre-wrap">
                        {part.text}
                      </div>
                    );
                  }

                  if (part.type === 'tool-invocation') {
                    return (
                      <div key={i} className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm border border-yellow-200">
                        <div className="font-semibold text-yellow-700 flex items-center gap-2">
                          🔧 正在调用工具: <span className="font-mono">{part.toolName}</span>
                          {part.state === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {part.state === 'complete' && <span className="text-green-600">✓</span>}
                        </div>
                        {part.args && (
                          <pre className="mt-2 text-xs bg-yellow-100/50 p-2 rounded overflow-x-auto">
                            {JSON.stringify(part.args, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  }

                  if (part.type === 'tool-result') {
                    return (
                      <div key={i} className="mt-2 text-green-600 text-sm">
                        ✓ {part.toolName} 执行完成
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            ))}

            {/* 流式输出指示器 */}
            {isStreaming && (
              <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">AI正在工作...</span>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600">
                ❌ {error}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            {messages.length === 0 && !isStreaming && (
              <Button onClick={startReview} disabled={isStreaming} size="lg" className="flex-1">
                <Bot className="mr-2 h-4 w-4" />
                开始AI审查
              </Button>
            )}

            {messages.length > 0 && (
              <>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="输入指令或问题..."
                  className="flex-1 p-3 border rounded-lg"
                  disabled={isStreaming}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
                <Button onClick={handleSubmit} disabled={isStreaming || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Button variant="ghost" onClick={() => router.push(`/reports/${reportId}`)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        查看报告详情
      </Button>
    </div>
  );
}
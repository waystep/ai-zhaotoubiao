// 官方文档：https://mastra.ai/guides/getting-started/next-js
import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import { mastra } from '@/mastra';
import { NextResponse } from 'next/server';

// 动态绑定：threadId 和 resourceId 从请求中获取（绑定到具体的 report）
export async function POST(req: Request) {
  const body = await req.json();

  // threadId = reportId（每个报告一个独立的对话线程）
  // resourceId = reportId（同一个报告的对话历史共享）
  const threadId = body.threadId || body.reportId || 'default-thread';
  const resourceId = body.resourceId || body.reportId || 'default-resource';

  // 构建 UIMessage 格式的 messages 数组
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [];

  // 如果有 content 参数，转换为 UIMessage
  if (body.content) {
    messages.push({
      id: `user-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text: body.content }]
    });
  }

  // 如果有传入 messages，使用它们
  if (body.messages && Array.isArray(body.messages)) {
    messages.push(...body.messages);
  }

  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const stream = await handleChatStream({
      mastra,
      agentId: 'tender-review-supervisor',
      params: {
        messages,
        memory: {
          thread: threadId,
          resource: resourceId,
        },
      },
    } as any);

    // 使用 createUIMessageStreamResponse 创建正确的响应格式
    return createUIMessageStreamResponse({ stream: stream as any });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch (error) {
    console.error('handleChatStream error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// 获取历史消息
export async function GET(req: Request) {
  const url = new URL(req.url);
  const threadId = url.searchParams.get('threadId') || url.searchParams.get('reportId');
  const resourceId = url.searchParams.get('resourceId') || url.searchParams.get('reportId');

  const memory = await mastra.getAgentById('tender-review-supervisor').getMemory();
  let response = null;

  try {
    response = await memory?.recall({
      threadId: threadId || 'default-thread',
      resourceId: resourceId || 'default-resource',
    });
  } catch {
    console.log('No previous messages found.');
  }

  return NextResponse.json(response?.messages || []);
}
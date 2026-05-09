import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import { mastra } from '@/mastra';
import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db/client';
import { documents, documentParsedResults } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { documentId, prompt }: { documentId?: string; prompt: string } = await req.json();

    // 如果有文档 ID，获取文档内容作为上下文
    let contextMessage = '';
    if (documentId) {
      const doc = await db.query.documents.findFirst({
        where: eq(documents.id, documentId),
        with: {
          parsedResult: {
            with: {
              blocks: {
                limit: 100,
              },
            },
          },
        },
      });

      if (doc?.parsedResult) {
        const fullText = doc.parsedResult.fullText || '';
        const blocksText = doc.parsedResult.blocks
          ?.map(b => `[页${b.pageNumber}] ${b.content}`)
          .join('\n')
          .slice(0, 5000); // 限制长度

        contextMessage = `\n\n以下是待审查的文档内容（节选）:\n${blocksText || fullText.slice(0, 5000)}`;
      }
    }

    const stream = await handleChatStream({
      mastra,
      agentId: 'reviewAgent',
      params: {
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: prompt + contextMessage,
              },
            ],
          },
        ],
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createUIMessageStreamResponse({ stream: stream as any });
  } catch (error) {
    console.error('AI review error:', error);
    return Response.json(
      { error: '审查请求处理失败', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}

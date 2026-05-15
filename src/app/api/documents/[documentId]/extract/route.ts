import { db } from "@/lib/db/client";
import { documents, extractionItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mastra } from "@/mastra";

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

/**
 * POST: SSE 流式提取审查项
 */
export async function POST(request: Request, context: RouteContext) {
  const { documentId } = await context.params;

  // 获取文档信息（不校验 auth，由 SSE 的 onError 处理）
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
    with: { project: true },
  });
  if (!doc) return Response.json({ error: "文档不存在" }, { status: 404 });
  if (doc.parseStatus !== "completed") return Response.json({ error: "文档尚未解析" }, { status: 400 });
  if (doc.docType === "bid_doc") return Response.json({ error: "投标文件无需提取" }, { status: 400 });

  await db.update(documents).set({ extractionStatus: "processing", extractionProgress: 0, updatedAt: new Date() }).where(eq(documents.id, documentId));

  const prompt = `
项目ID: ${doc.projectId}
文档ID: ${documentId}
文档名称: ${doc.name}
文档类型: ${doc.docType}
`;

  const agent = mastra.getAgent("extraction-agent");
  const stream = await agent.stream(prompt, { maxSteps: 25 });

  const encoder = new TextEncoder();
  let aborted = false;

  const sseStream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (data: string) => {
        if (aborted) return;
        try { controller.enqueue(encoder.encode(data)); } catch {}
      };

      try {
        const reader = stream.fullStream.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done || aborted) break;

          const v = value as {
            type?: string;
            payload?: { text?: string; toolName?: string; toolCallId?: string; error?: unknown };
            textDelta?: string;
            toolName?: string;
            toolCallId?: string;
          };
          const type = v?.type;
          if (type === "text-delta") {
            safeEnqueue(`data: ${JSON.stringify({ type: "text", text: v.payload?.text ?? v.textDelta ?? "" })}\n\n`);
          } else if (type === "tool-call") {
            safeEnqueue(`data: ${JSON.stringify({ type: "tool-start", toolName: v.payload?.toolName ?? v.toolName, toolCallId: v.payload?.toolCallId ?? v.toolCallId })}\n\n`);
          } else if (type === "tool-result") {
            safeEnqueue(`data: ${JSON.stringify({ type: "tool-end", toolName: v.payload?.toolName ?? v.toolName, toolCallId: v.payload?.toolCallId ?? v.toolCallId, error: !!v.payload?.error, output: v.payload?.error ? String(v.payload.error) : undefined })}\n\n`);
          } else if (type === "start") {
            safeEnqueue(`data: ${JSON.stringify({ type: "text", text: "\\n🚀 开始提取...\\n" })}\n\n`);
          } else if (type === "finish") {
            safeEnqueue(`data: ${JSON.stringify({ type: "text", text: "\\n✅ 提取完成\\n" })}\n\n`);
          }
        }

        reader.releaseLock();

        // 验证结果
        const storedCount = await db.$count(extractionItems, eq(extractionItems.documentId, documentId));

        if (storedCount === 0) {
          await db.update(documents).set({ extractionStatus: "failed", extractionError: "提取未产出结果", updatedAt: new Date() }).where(eq(documents.id, documentId));
          safeEnqueue(`data: ${JSON.stringify({ type: "error", message: "提取未产出结果" })}\n\n`);
        } else {
          await db.update(documents).set({ extractionStatus: "completed", extractedAt: new Date(), extractionProgress: 100, extractionItemsCount: storedCount, updatedAt: new Date() }).where(eq(documents.id, documentId));
          safeEnqueue(`data: ${JSON.stringify({ type: "done", itemCount: storedCount })}\n\n`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "未知错误";
        await db.update(documents).set({ extractionStatus: "failed", extractionError: msg, updatedAt: new Date() }).where(eq(documents.id, documentId));
        safeEnqueue(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`);
      } finally {
        try { controller.close(); } catch {}
      }
    },
    cancel() { aborted = true; },
  });

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * GET: 查询提取状态和结果
 */
export async function GET(request: Request, context: RouteContext) {
  const { documentId } = await context.params;
  try {
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
      with: { project: true },
    });
    if (!doc) return Response.json({ error: "文档不存在" }, { status: 404 });

    const items = await db.query.extractionItems.findMany({
      where: eq(extractionItems.documentId, documentId),
      limit: 200,
    });

    return Response.json({
      document: {
        id: doc.id, name: doc.name, docType: doc.docType,
        extractionStatus: doc.extractionStatus, extractionError: doc.extractionError,
        extractedAt: doc.extractedAt, extractionItemsCount: doc.extractionItemsCount || 0,
      },
      items,
      summary: {
        total: items.length,
        titles: [...new Set(items.map((i) => i.title))],
        sections: [...new Set(items.map((i) => i.section).filter(Boolean))],
      },
    });
  } catch (error) {
    return Response.json({ error: "获取提取状态失败" }, { status: 500 });
  }
}

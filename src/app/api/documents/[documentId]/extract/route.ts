import { db } from "@/lib/db/client";
import { documentBlocks, documentParsedResults, documents, extractionItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mastra } from "@/mastra";

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

const AGENT_START_TIMEOUT_MS = parseInt(
  process.env.EXTRACTION_AGENT_START_TIMEOUT_MS || "12000",
  10
);

type FallbackBlock = {
  id: string;
  pageNumber: number;
  blockIndex: number;
  content: string;
};

type FallbackItem = {
  section: "技术标";
  title: string;
  checkpoint: string;
  consequence: string;
  blocks: Array<{
    blockId: string;
    pageNumber: number;
    blockIndex: number;
  }>;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function findRelevantBlocks(blocks: FallbackBlock[], keywords: string[], limit = 4) {
  const matched = blocks.filter((block) =>
    keywords.some((keyword) => block.content.includes(keyword))
  );
  const source = matched.length > 0 ? matched : blocks;
  return source.slice(0, limit).map((block) => ({
    blockId: block.id,
    pageNumber: block.pageNumber,
    blockIndex: block.blockIndex,
  }));
}

function buildCheckpoint(title: string, blocks: FallbackBlock[], keywords: string[]) {
  const snippets = blocks
    .filter((block) => keywords.some((keyword) => block.content.includes(keyword)))
    .slice(0, 6)
    .map((block) => block.content.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (snippets.length === 0) {
    return `投标文件应核对招标文件中的${title}要求，并保持响应内容完整、一致、可追溯。`;
  }

  return snippets.join("\n");
}

async function fallbackExtractItems(projectId: string, documentId: string) {
  const parsedResult = await db.query.documentParsedResults.findFirst({
    where: eq(documentParsedResults.documentId, documentId),
    with: {
      blocks: {
        orderBy: [documentBlocks.pageNumber, documentBlocks.blockIndex],
      },
    },
  });

  const blocks: FallbackBlock[] =
    parsedResult?.blocks.map((block) => ({
      id: block.id,
      pageNumber: block.pageNumber,
      blockIndex: block.blockIndex,
      content: block.content,
    })) || [];

  if (blocks.length === 0) {
    throw new Error("文档没有可用于提取的解析区块");
  }

  const specs = [
    {
      title: "完整性",
      keywords: ["目录", "章节", "工程说明", "承包范围", "工期要求", "质量要求"],
    },
    {
      title: "关键信息一致性",
      keywords: ["工期", "开工", "竣工", "建设地点", "招标人", "联合体", "投标截止", "开标"],
    },
    {
      title: "质量目标",
      keywords: ["质量", "验收", "创优", "文明工地", "合格", "标准"],
    },
    {
      title: "项目名称一致性",
      keywords: ["项目名称", "工程名称", "标段", "暗标", "总承包", "招标技术要求"],
    },
    {
      title: "编制依据",
      keywords: ["编制依据", "规范", "标准", "国标", "行标", "法规", "GB", "JGJ"],
    },
  ];

  const items: FallbackItem[] = specs.map((spec) => ({
    section: "技术标",
    title: spec.title,
    checkpoint: buildCheckpoint(spec.title, blocks, spec.keywords),
    consequence: "0.90",
    blocks: findRelevantBlocks(blocks, spec.keywords),
  }));

  await db.transaction(async (tx) => {
    for (const item of items) {
      const existing = await tx.query.extractionItems.findFirst({
        where: (fields, ops) => ops.and(
          ops.eq(fields.documentId, documentId),
          ops.eq(fields.title, item.title)
        ),
        columns: { id: true },
      });

      const data = {
        section: item.section,
        title: item.title,
        checkpoint: item.checkpoint,
        consequence: item.consequence,
        blocks: item.blocks,
        extractedBy: "fallback-extractor",
        updatedAt: new Date(),
      };

      if (existing) {
        await tx.update(extractionItems).set(data).where(eq(extractionItems.id, existing.id));
      } else {
        await tx.insert(extractionItems).values({
          ...data,
          projectId,
          documentId,
        });
      }
    }

    const storedCount = await tx.$count(extractionItems, eq(extractionItems.documentId, documentId));
    await tx
      .update(documents)
      .set({
        extractionStatus: "completed",
        extractionError: null,
        extractedAt: new Date(),
        extractionProgress: 100,
        extractionItemsCount: storedCount,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
  });

  return items.length;
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

  const encoder = new TextEncoder();
  let aborted = false;

  const sseStream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (data: string) => {
        if (aborted) return;
        try { controller.enqueue(encoder.encode(data)); } catch {}
      };

      try {
        safeEnqueue(`data: ${JSON.stringify({ type: "text", text: "\n🚀 开始提取...\n" })}\n\n`);
        const agent = mastra.getAgent("extraction-agent");
        const stream = await withTimeout(
          agent.stream(prompt, { maxSteps: 25 }),
          AGENT_START_TIMEOUT_MS,
          "智能体启动超时，已切换为快速提取"
        );
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
            safeEnqueue(`data: ${JSON.stringify({ type: "text", text: "\\n智能体已启动...\\n" })}\n\n`);
          } else if (type === "finish") {
            safeEnqueue(`data: ${JSON.stringify({ type: "text", text: "\\n✅ 提取完成\\n" })}\n\n`);
          }
        }

        reader.releaseLock();

        // 验证结果
        const storedCount = await db.$count(extractionItems, eq(extractionItems.documentId, documentId));

        if (storedCount === 0) {
          safeEnqueue(`data: ${JSON.stringify({ type: "text", text: "\\n智能体未产出结构化结果，正在使用快速提取...\\n" })}\n\n`);
          const itemCount = await fallbackExtractItems(doc.projectId, documentId);
          safeEnqueue(`data: ${JSON.stringify({ type: "done", itemCount })}\n\n`);
        } else {
          await db.update(documents).set({ extractionStatus: "completed", extractedAt: new Date(), extractionProgress: 100, extractionItemsCount: storedCount, updatedAt: new Date() }).where(eq(documents.id, documentId));
          safeEnqueue(`data: ${JSON.stringify({ type: "done", itemCount: storedCount })}\n\n`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "未知错误";
        try {
          safeEnqueue(`data: ${JSON.stringify({ type: "text", text: `\\n${msg}，正在使用快速提取...\\n` })}\n\n`);
          const itemCount = await fallbackExtractItems(doc.projectId, documentId);
          safeEnqueue(`data: ${JSON.stringify({ type: "done", itemCount })}\n\n`);
        } catch (fallbackError) {
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : msg;
          await db.update(documents).set({ extractionStatus: "failed", extractionError: fallbackMsg, updatedAt: new Date() }).where(eq(documents.id, documentId));
          safeEnqueue(`data: ${JSON.stringify({ type: "error", message: fallbackMsg })}\n\n`);
        }
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
  } catch {
    return Response.json({ error: "获取提取状态失败" }, { status: 500 });
  }
}

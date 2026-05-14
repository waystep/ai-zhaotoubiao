// 嵌入向量生成与小粒度 chunk 工具
import { db } from "@/lib/db/client";
import { documentPageEmbeddings, documentParsedResults } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const API_BASE = process.env.EMBEDDING_API_URL || "http://192.168.2.81:1234/v1";
const EMBEDDING_API = API_BASE + "/embeddings";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-bce-embedding-base_v1";
const API_KEY = process.env.EMBEDDING_API_KEY || "lm-studio";

/** 每个 chunk 的最大字符数 */
const CHUNK_MAX_CHARS = 500;

/**
 * 调用 embeddings API 生成向量
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await fetch(EMBEDDING_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return data.data
    .sort((a: any, b: any) => a.index - b.index)
    .map((item: any) => item.embedding);
}

/**
 * 将 blocks 按页面+小粒度分组
 * 每页内相邻 blocks 合并为 ~500 字的 chunk，保证每个 chunk 语义集中
 */
export function chunkBlocks(
  blocks: {
    id: string;
    pageNumber: number;
    blockIndex: number;
    content: string | null;
    blockType: string | null;
  }[]
): { pageNumber: number; chunkIndex: number; text: string; blockIds: string[] }[] {
  // 按页分组
  const pageMap = new Map<number, typeof blocks>();
  for (const b of blocks) {
    const list = pageMap.get(b.pageNumber) || [];
    list.push(b);
    pageMap.set(b.pageNumber, list);
  }

  const chunks: { pageNumber: number; chunkIndex: number; text: string; blockIds: string[] }[] = [];

  for (const [pageNumber, pageBlocks] of pageMap) {
    // 按 blockIndex 排序
    pageBlocks.sort((a, b) => a.blockIndex - b.blockIndex);

    let chunkIdx = 0;
    let currentTexts: string[] = [];
    let currentIds: string[] = [];
    let currentLen = 0;

    for (const block of pageBlocks) {
      const content = block.content?.trim();
      if (!content) continue;

      // 如果加上这个 block 会超过阈值，先保存当前 chunk
      if (currentLen > 0 && currentLen + content.length > CHUNK_MAX_CHARS) {
        chunks.push({
          pageNumber,
          chunkIndex: chunkIdx++,
          text: currentTexts.join("\n"),
          blockIds: currentIds,
        });
        currentTexts = [];
        currentIds = [];
        currentLen = 0;
      }

      currentTexts.push(content);
      currentIds.push(block.id);
      currentLen += content.length;
    }

    // 保存最后一个 chunk
    if (currentTexts.length > 0) {
      chunks.push({
        pageNumber,
        chunkIndex: chunkIdx,
        text: currentTexts.join("\n"),
        blockIds: currentIds,
      });
    }
  }

  return chunks;
}

/**
 * 计算两个向量的余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 为文档生成并存储小粒度 chunk 嵌入向量
 */
export async function generatePageEmbeddings(documentId: string): Promise<number> {
  const parsedResult = await db.query.documentParsedResults.findFirst({
    where: eq(documentParsedResults.documentId, documentId),
    with: { blocks: true },
  });

  if (!parsedResult || parsedResult.blocks.length === 0) {
    console.log(`[Embedding] Document ${documentId}: no blocks found`);
    return 0;
  }

  // 模型变了 → 清空重建
  const existingSample = await db.query.documentPageEmbeddings.findFirst({
    where: eq(documentPageEmbeddings.documentId, documentId),
    columns: { embeddingModel: true },
  });
  if (existingSample && existingSample.embeddingModel !== EMBEDDING_MODEL) {
    console.log(`[Embedding] Model changed (${existingSample.embeddingModel} → ${EMBEDDING_MODEL}), clearing...`);
    await db.delete(documentPageEmbeddings).where(eq(documentPageEmbeddings.documentId, documentId));
  }

  const chunks = chunkBlocks(parsedResult.blocks);
  console.log(`[Embedding] Document ${documentId}: ${chunks.length} chunks via ${EMBEDDING_MODEL}`);

  const texts = chunks.map((c) => c.text);
  const embeddings = await generateEmbeddings(texts);

  let count = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const existing = await db.query.documentPageEmbeddings.findFirst({
      where: and(
        eq(documentPageEmbeddings.documentId, documentId),
        eq(documentPageEmbeddings.pageNumber, chunk.pageNumber),
        eq(documentPageEmbeddings.chunkIndex, chunk.chunkIndex),
      ),
    });
    if (existing) continue;

    await db.insert(documentPageEmbeddings).values({
      documentId,
      parsedResultId: parsedResult.id,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      pageText: chunk.text,
      blockIds: chunk.blockIds,
      embedding: embeddings[i] as any,
      embeddingModel: EMBEDDING_MODEL,
    });
    count++;
  }

  console.log(`[Embedding] Stored ${count} new chunks for document ${documentId}`);
  return count;
}

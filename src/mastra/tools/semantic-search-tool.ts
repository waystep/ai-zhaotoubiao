// 语义搜索工具 — 混合检索：关键词预过滤 + embedding 排序
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { documentPageEmbeddings } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateEmbeddings, cosineSimilarity } from "@/lib/ai/embedding";

type ChunkRecord = {
  pageNumber: number;
  chunkIndex: number;
  pageText: string;
  blockIds: string[];
  embedding: number[];
};

export const semanticSearchTool = createTool({
  id: "semantic-search",
  description: `语义搜索工具。小粒度 chunk 检索：每页分成多个 ~500 字 chunk，关键词 + embedding 联合检索。

检索策略：
0. 关键词 ILIKE 预过滤（保证召回）
1. embedding 余弦排序（保证精度）`,

  inputSchema: z.object({
    documentId: z.string().uuid().describe("文档ID"),
    query: z.string().describe("语义搜索查询文本（如：'工期要求 日历天 竣工日期'）"),
    topK: z.number().int().min(1).max(20).default(5).describe("返回最相关的前K个结果"),
  }),

  outputSchema: z.object({
    results: z.array(
      z.object({
        pageNumber: z.number(),
        pageText: z.string(),
        blockIds: z.array(z.string()),
        similarity: z.number(),
      })
    ),
    query: z.string(),
    totalResults: z.number(),
  }),

  execute: async ({ documentId, query, topK }) => {
    try {
      const allChunks = await db.query.documentPageEmbeddings.findMany({
        where: eq(documentPageEmbeddings.documentId, documentId),
        orderBy: (fields, { asc }) => [asc(fields.pageNumber), asc(fields.chunkIndex)],
      });

      if (allChunks.length === 0) {
        return { results: [], query, totalResults: 0 };
      }

      // ── Stage 0: 关键词预过滤 ──
      const keywords = query
        .split(/\s+/)
        .map((k) => k.trim())
        .filter((k) => k.length >= 1);

      let candidatePool: ChunkRecord[];

      if (keywords.length > 0) {
        const conditions = keywords.map((kw) =>
          `page_text ILIKE ${`'%${kw.replace(/'/g, "''")}%'`}`
        );
        const whereClause = conditions.join(" OR ");

        const filtered = await db.execute(
          sql.raw(
            `SELECT page_number, chunk_index, page_text, block_ids, embedding
             FROM document_page_embeddings
             WHERE document_id = '${documentId.replace(/'/g, "''")}'
             AND (${whereClause})`
          )
        );

        const filteredRows = (filtered as any[]).map((r: any) => ({
          pageNumber: r.page_number,
          chunkIndex: r.chunk_index ?? 0,
          pageText: r.page_text,
          blockIds: r.block_ids || [],
          embedding: typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding,
        }));

        if (filteredRows.length > 0) {
          candidatePool = filteredRows;
        } else {
          candidatePool = allChunks.map((c) => ({
            pageNumber: c.pageNumber,
            chunkIndex: c.chunkIndex,
            pageText: c.pageText,
            blockIds: (c.blockIds as string[]) || [],
            embedding: c.embedding as number[],
          }));
        }
      } else {
        candidatePool = allChunks.map((c) => ({
          pageNumber: c.pageNumber,
          chunkIndex: c.chunkIndex,
          pageText: c.pageText,
          blockIds: (c.blockIds as string[]) || [],
          embedding: c.embedding as number[],
        }));
      }

      // ── Stage 1: embedding 排序 ──
      const embeddings = await generateEmbeddings([query]);
      const queryEmbedding = embeddings[0]!;
      if (!queryEmbedding || queryEmbedding.length === 0) {
        return { results: [], query, totalResults: 0 };
      }

      const scored = candidatePool
        .map((chunk) => ({
          pageNumber: chunk.pageNumber,
          pageText: chunk.pageText,
          blockIds: chunk.blockIds,
          similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK ?? 5)
        .filter((r) => r.similarity > 0.15);

      return { results: scored, query, totalResults: scored.length };
    } catch (error) {
      console.error("[SemanticSearch] 搜索失败:", error);
      return { results: [], query, totalResults: 0 };
    }
  },
});

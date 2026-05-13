/**
 * RAG 语义搜索质量测试脚本
 * 用法: npx tsx scripts/test-rag.ts <documentId> "<查询文本>"
 * 示例: npx tsx scripts/test-rag.ts dc28d1d8-e36e-4265-beb1-118deb24bfe3 "工期 日历天 竣工日期"
 */
import "dotenv/config";
import { db } from "../src/lib/db/client";
import { documentPageEmbeddings } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateEmbeddings, cosineSimilarity } from "../src/lib/ai/embedding";

async function main() {
  const documentId = process.argv[2];
  const query = process.argv[3];

  if (!documentId || !query) {
    console.log("用法: npx tsx scripts/test-rag.ts <documentId> <查询文本>");
    console.log("示例: npx tsx scripts/test-rag.ts dc28d1d8-e36e-4265-beb1-118deb24bfe3 \"工期 日历天\"");
    process.exit(1);
  }

  // 1. 检查 embedding 是否存在
  const pages = await db.query.documentPageEmbeddings.findMany({
    where: eq(documentPageEmbeddings.documentId, documentId),
    orderBy: (fields, { asc }) => [asc(fields.pageNumber)],
  });

  console.log(`=== Embedding 状态 ===`);
  console.log(`总页数: ${pages.length}`);
  if (pages.length === 0) {
    console.log("❌ 该文档没有 embedding，请先调用 POST /api/documents/{id}/embeddings");
    process.exit(1);
  }
  console.log(`模型: ${pages[0].embeddingModel}`);
  console.log(`页面范围: ${pages[0].pageNumber} - ${pages[pages.length - 1].pageNumber}`);

  // 2. 生成查询向量
  console.log(`\n=== 查询: "${query}" ===`);
  console.log("正在生成查询向量...");
  const qEmbeddings = await generateEmbeddings([query]);
  const qVec = qEmbeddings[0];
  if (!qVec) {
    console.log("❌ 查询向量生成失败（LM Studio 可能未启动）");
    process.exit(1);
  }
  console.log(`向量维度: ${qVec.length}`);

  // 3. 计算相似度
  console.log(`\n=== Top 10 结果 ===`);
  const scored = pages
    .map((page) => ({
      pageNumber: page.pageNumber,
      similarity: cosineSimilarity(qVec, page.embedding as number[]),
      textPreview: page.pageText.slice(0, 200),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 10);

  for (const r of scored) {
    const bar = "█".repeat(Math.round(r.similarity * 50));
    console.log(`\n第${r.pageNumber}页 [${r.similarity.toFixed(4)}] ${bar}`);
    console.log(`  ${r.textPreview}...`);
  }

  // 4. 质量评估
  const avgSim = scored.reduce((s, r) => s + r.similarity, 0) / scored.length;
  const maxSim = scored[0].similarity;
  console.log(`\n=== 质量评估 ===`);
  console.log(`最高相似度: ${maxSim.toFixed(4)}`);
  console.log(`平均相似度: ${avgSim.toFixed(4)}`);
  if (maxSim < 0.3) {
    console.log("⚠️  最高相似度 < 0.3，embedding 质量可能有问题");
    console.log("   - 检查 LM Studio 是否正常运行: http://192.168.2.81:1234/v1/models");
    console.log("   - 检查 embedding 模型是否正确: text-embedding-nomic-embed-text-v1.5");
    console.log("   - 检查文档页面文本是否已正确解析");
  } else if (maxSim < 0.5) {
    console.log("⚠️  质量一般 (< 0.5)，查询词可能与文档内容匹配度不高");
  } else {
    console.log("✅ 质量可接受");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

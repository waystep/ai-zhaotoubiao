import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents, extractionItems, reviewItems, responseItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mastra } from "@/mastra";

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

/**
 * POST: 提交文档提取任务
 * 触发extraction-agent提取审查项和响应项
 */
export async function POST(
  request: Request,
  context: RouteContext
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;

  try {
    // 获取文档信息
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
      with: {
        project: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    // 检查解析状态
    if (doc.parseStatus !== "completed") {
      return NextResponse.json(
        { error: "文档尚未完成解析，请先解析文档" },
        { status: 400 }
      );
    }

    // 允许重新提取：清理旧数据
    const existingCount =
      (doc.extractionItemsCount || 0) ||
      (doc.reviewItemsCount || 0) + (doc.responseItemsCount || 0);
    if (doc.extractionStatus === "completed" && existingCount > 0) {
      await db.delete(extractionItems).where(eq(extractionItems.documentId, documentId));
      await db.delete(reviewItems).where(eq(reviewItems.documentId, documentId));
      await db.delete(responseItems).where(eq(responseItems.documentId, documentId));
    }

    // 更新状态为processing
    await db
      .update(documents)
      .set({
        extractionStatus: "processing",
        extractionProgress: 0,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    // 获取extraction-agent
    const agent = mastra.getAgent("extraction-agent");

    // 确定提取模式
    let extractionMode = "review_items";
    if (doc.docType === "tender_doc") {
      extractionMode = "both"; // 提取审查项 + 响应项
    } else if (doc.docType === "legal_doc") {
      extractionMode = "review_items"; // 只提取审查项
    } else if (doc.docType === "bid_doc") {
      extractionMode = "none"; // 投标文件暂不提取
    }

    // 构建提取prompt
    const prompt = `
请从以下${doc.docType === "tender_doc" ? "招标文件" : doc.docType === "legal_doc" ? "法律文件" : "投标文件"}中提取审查项和响应项。

项目ID: ${doc.projectId}
文档ID: ${documentId}
文档名称: ${doc.name}
文档类型: ${doc.docType}
提取模式: ${extractionMode}

${doc.docType === "tender_doc" ? "请提取审查项（强制性要求条款）和响应项（要求投标人说明的内容）。审查项用于后续合规审查，响应项用于响应度评估，两者没有直接关联关系。" : ""}

${doc.docType === "legal_doc" ? "请只提取审查项（法律合规条款），重点关注违约责任、付款条款、保修条款、法律责任等。明确标注后果和法律依据。" : ""}

${doc.docType === "bid_doc" ? "投标文件暂不提取内容，请返回空结果。" : ""}

请使用 documentReaderTool 读取文档blocks，然后提取结构化的审查项或响应项，并使用相应的存储工具保存到数据库。

提取完成后，请返回提取结果的摘要信息，包括：
- 提取的审查项数量
- 提取的响应项数量
- 主要类型分布
- 提取质量评估

注意：itemType和responseType使用文本类型，支持任意自定义值，根据文档内容灵活命名，不要使用固定枚举！
`;

    // 执行提取
    const result = await agent.generate(prompt);

    // 更新完成状态
    await db
      .update(documents)
      .set({
        extractionStatus: "completed",
        extractedAt: new Date(),
        extractionProgress: 100,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json({
      success: true,
      documentId,
      extractionStatus: "completed",
      result: {
        text: result.text,
        toolCalls: result.toolCalls,
      },
    });
  } catch (error) {
    console.error("[Extract] 提取失败:", error);

    await db
      .update(documents)
      .set({
        extractionStatus: "failed",
        extractionError: error instanceof Error ? error.message : "提取失败",
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json(
      { error: "提取失败", details: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    );
  }
}

/**
 * GET: 查询提取状态和结果
 */
export async function GET(
  request: Request,
  context: RouteContext
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;

  try {
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
      with: {
        project: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    // 查询提取结果（统一表 + 旧表兼容）
    const newItems = await db.query.extractionItems.findMany({
      where: eq(extractionItems.documentId, documentId),
      limit: 200,
      with: { sourceBlock: true },
    });

    // 兼容旧数据：统一表为空时从旧表读取
    let allItems: any[] = newItems;
    if (newItems.length === 0) {
      const oldReview = await db.query.reviewItems.findMany({
        where: eq(reviewItems.documentId, documentId),
        limit: 100,
        with: { sourceBlock: true },
      });
      const oldResponse = await db.query.responseItems.findMany({
        where: eq(responseItems.documentId, documentId),
        limit: 100,
        with: { sourceBlock: true },
      });
      allItems = [
        ...oldReview.map((r) => ({ ...r, itemCategory: "review", itemType: r.itemType, responseType: undefined, responseRequirements: {}, scoringInfo: {} })),
        ...oldResponse.map((r) => ({ ...r, itemCategory: "response", itemType: r.responseType, responseType: r.responseType, requirements: {}, consequence: null, legalReference: null })),
      ];
    }

    const reviewItemsData = allItems.filter((i) => i.itemCategory === "review");
    const responseItemsData = allItems.filter((i) => i.itemCategory === "response");

    return NextResponse.json({
      document: {
        id: doc.id,
        name: doc.name,
        docType: doc.docType,
        extractionStatus: doc.extractionStatus,
        extractionError: doc.extractionError,
        extractedAt: doc.extractedAt,
        extractionItemsCount: doc.extractionItemsCount || (doc.reviewItemsCount || 0) + (doc.responseItemsCount || 0),
      },
      reviewItems: reviewItemsData,
      responseItems: responseItemsData,
      items: allItems,
      summary: {
        total: allItems.length,
        reviewTotal: reviewItemsData.length,
        responseTotal: responseItemsData.length,
        itemTypes: [...new Set(allItems.map((i: any) => i.itemType))],
      },
    });
  } catch (error) {
    console.error("[Extract] 获取状态失败:", error);
    return NextResponse.json(
      { error: "获取提取状态失败" },
      { status: 500 }
    );
  }
}

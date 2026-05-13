import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents, extractionItems } from "@/lib/db/schema";
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

    // 防止并发提取：如果正在处理中，拒绝重复请求
    if (doc.extractionStatus === "processing") {
      return NextResponse.json(
        { error: "文档提取正在进行中，请稍后再试" },
        { status: 409 }
      );
    }

    // 允许重新提取：清理旧数据
    if ((doc.extractionItemsCount || 0) > 0) {
      await db.delete(extractionItems).where(eq(extractionItems.documentId, documentId));
      await db
        .update(documents)
        .set({ extractionItemsCount: 0, updatedAt: new Date() })
        .where(eq(documents.id, documentId));
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

    // 投标文件暂不提取
    if (doc.docType === "bid_doc") {
      return NextResponse.json(
        { error: "投标文件无需提取审查项" },
        { status: 400 }
      );
    }

    // 构建提取prompt
    const prompt = `
请从以下${doc.docType === "tender_doc" ? "招标文件" : "法律文件"}中提取审查项。

项目ID: ${doc.projectId}
文档ID: ${documentId}
文档名称: ${doc.name}
文档类型: ${doc.docType}

请使用 semantic-search 工具按主题搜索文档内容，提取结构化审查项，并使用 extraction-item-storage 工具保存。

提取完成后返回摘要：提取数量、类型分布、质量评估。
`;

    // 执行提取（maxSteps 需覆盖 6 轮搜索 + 提取 + 存储 ≈ 10+ 步）
    const result = await agent.generate(prompt, { maxSteps: 25 });

    // 验证提取结果：检查是否有 item 实际写入数据库
    const storedCount = await db.$count(
      extractionItems,
      eq(extractionItems.documentId, documentId),
    );

    if (storedCount === 0) {
      // Agent 执行完了但没有存储任何提取项
      await db
        .update(documents)
        .set({
          extractionStatus: "failed",
          extractionError: "提取未产出结果：Agent 未调用存储工具或工具执行失败",
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      return NextResponse.json(
        {
          success: false,
          error: "提取未产出结果，请检查智能体日志",
          agentText: result.text?.slice(0, 500),
        },
        { status: 500 },
      );
    }

    // 更新完成状态
    await db
      .update(documents)
      .set({
        extractionStatus: "completed",
        extractedAt: new Date(),
        extractionProgress: 100,
        extractionItemsCount: storedCount,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json({
      success: true,
      documentId,
      extractionStatus: "completed",
      itemCount: storedCount,
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

    // 查询提取结果
    const items = await db.query.extractionItems.findMany({
      where: eq(extractionItems.documentId, documentId),
      limit: 200,
      with: { sourceBlock: true },
    });

    return NextResponse.json({
      document: {
        id: doc.id,
        name: doc.name,
        docType: doc.docType,
        extractionStatus: doc.extractionStatus,
        extractionError: doc.extractionError,
        extractedAt: doc.extractedAt,
        extractionItemsCount: doc.extractionItemsCount || 0,
      },
      items,
      summary: {
        total: items.length,
        titles: [...new Set(items.map((i) => i.title))],
        sections: [...new Set(items.map((i) => i.section).filter(Boolean))],
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

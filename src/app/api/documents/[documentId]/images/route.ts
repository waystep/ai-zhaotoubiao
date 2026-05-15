// 图片风险分析查询与重分析 API
import { db } from "@/lib/db/client";
import { imageRiskAnalysis } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import type { InferInsertModel } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

/**
 * GET /api/documents/[documentId]/images
 * 获取文档的图片风险分析结果
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { documentId } = await context.params;

    const imageRisks = await db.query.imageRiskAnalysis.findMany({
      where: eq(imageRiskAnalysis.documentId, documentId),
      orderBy: (imageRiskAnalysis, { asc }) => [asc(imageRiskAnalysis.pageNumber)],
    });

    const stats = {
      total: imageRisks.length,
      pending: imageRisks.filter((i) => i.status === "pending").length,
      processing: imageRisks.filter((i) => i.status === "processing").length,
      completed: imageRisks.filter((i) => i.status === "completed").length,
      failed: imageRisks.filter((i) => i.status === "failed").length,
      hasRisk: imageRisks.filter((i) => i.hasRisk === true).length,
    };

    return NextResponse.json({ images: imageRisks, stats });
  } catch (error) {
    console.error("[API] 获取图片风险分析失败:", error);
    return NextResponse.json(
      { error: "获取图片风险分析失败" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/documents/[documentId]/images
 * 重试单张图片（将状态重置为 pending）
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

    const { documentId } = await context.params;
    const { imageId } = await request.json();

    if (!imageId) return NextResponse.json({ error: "缺少 imageId" }, { status: 400 });

    await db
      .update(imageRiskAnalysis)
      .set({ status: "pending", error: null, updatedAt: new Date() } as Partial<InferInsertModel<typeof imageRiskAnalysis>>)
      .where(eq(imageRiskAnalysis.id, imageId));

    return NextResponse.json({ success: true, imageId });
  } catch (error) {
    console.error("[Retry] 重置失败:", error);
    return NextResponse.json({ error: "重置失败" }, { status: 500 });
  }
}

/**
 * POST /api/documents/[documentId]/images
 * 重新触发全部图片的风险分析（将状态重置为 pending，cron 会自动处理）
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { documentId } = await context.params;

    // 将所有非 pending 的图片重置（包括卡在 processing 的）
    const result = await db
      .update(imageRiskAnalysis)
      .set({
        status: "pending",
        hasRisk: null,
        riskType: null,
        riskText: null,
        confidence: null,
        error: null,
        updatedAt: new Date(),
      } as Partial<InferInsertModel<typeof imageRiskAnalysis>>)
      .where(eq(imageRiskAnalysis.documentId, documentId));

    // 获取重置数量
    const reset = await db.query.imageRiskAnalysis.findMany({
      where: eq(imageRiskAnalysis.documentId, documentId),
      columns: { id: true },
    });

    return NextResponse.json({
      success: true,
      resetCount: reset.length,
      message: `已重置 ${reset.length} 张图片，待 cron 自动分析`,
    });
  } catch (error) {
    console.error("[API] 重置图片分析失败:", error);
    return NextResponse.json(
      { error: "重置失败" },
      { status: 500 }
    );
  }
}
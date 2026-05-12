// 提取项管理 API — 手动 CRUD
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { extractionItems, documents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

/**
 * GET: 列出文档的所有提取项
 */
export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await context.params;
  const items = await db.query.extractionItems.findMany({
    where: eq(extractionItems.documentId, documentId),
    orderBy: (fields, { asc }) => [asc(fields.createdAt)],
  });
  return NextResponse.json({ items });
}

/**
 * POST: 手动创建提取项
 */
export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await context.params;
  const body = await request.json();

  const [item] = await db
    .insert(extractionItems)
    .values({
      documentId,
      projectId: body.projectId,
      itemCategory: body.itemCategory || "review",
      bidSection: body.bidSection || null,
      itemType: body.itemType || "手动添加",
      itemNo: body.itemNo || null,
      title: body.title || "",
      description: body.description || "",
      location: body.location || { pageNumber: 0, blockIndex: 0 },
      consequence: body.consequence || null,
      legalReference: body.legalReference || null,
      requirements: body.requirements || {},
      responseRequirements: body.responseRequirements || {},
      scoringInfo: body.scoringInfo || {},
      extractionConfidence: body.extractionConfidence != null ? String(body.extractionConfidence) : null,
      extractedBy: "manual",
    })
    .returning();

  // 更新计数
  await db
    .update(documents)
    .set({ extractionItemsCount: sql`${documents.extractionItemsCount} + 1`, updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  return NextResponse.json({ item });
}

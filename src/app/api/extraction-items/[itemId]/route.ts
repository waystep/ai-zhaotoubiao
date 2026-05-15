// 单个提取项操作 API — 更新 / 删除（不依赖 documentId）
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { extractionItems, documents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await context.params;
  const body = await request.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.section !== undefined) updates.section = body.section;
  if (body.title !== undefined) updates.title = body.title;
  if (body.checkpoint !== undefined) updates.checkpoint = body.checkpoint;
  if (body.consequence !== undefined) updates.consequence = String(body.consequence);
  if (body.blocks !== undefined) updates.blocks = body.blocks;
  if (body.documentId !== undefined) updates.documentId = body.documentId || null;

  const [updated] = await db
    .update(extractionItems)
    .set(updates)
    .where(eq(extractionItems.id, itemId))
    .returning();

  if (!updated) return NextResponse.json({ error: "提取项不存在" }, { status: 404 });
  return NextResponse.json({ item: updated });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await context.params;

  const existing = await db.query.extractionItems.findFirst({
    where: eq(extractionItems.id, itemId),
    columns: { id: true, documentId: true },
  });
  if (!existing) return NextResponse.json({ error: "提取项不存在" }, { status: 404 });

  await db.delete(extractionItems).where(eq(extractionItems.id, itemId));

  if (existing.documentId) {
    await db
      .update(documents)
      .set({ extractionItemsCount: sql`GREATEST(${documents.extractionItemsCount} - 1, 0)`, updatedAt: new Date() })
      .where(eq(documents.id, existing.documentId));
  }

  return NextResponse.json({ success: true });
}

// 单个提取项的操作 — 更新 / 删除
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { extractionItems, documents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ documentId: string; itemId: string }>;
}

/**
 * PATCH: 更新提取项
 */
export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId, itemId } = await context.params;
  const body = await request.json();

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (body.section !== undefined) updates.section = body.section;
  if (body.title !== undefined) updates.title = body.title;
  if (body.checkpoint !== undefined) updates.checkpoint = body.checkpoint;
  if (body.consequence !== undefined) {
    updates.consequence =
      body.consequence === null || body.consequence === ""
        ? null
        : String(body.consequence);
  }
  if (body.location !== undefined) updates.location = body.location;

  const [updated] = await db
    .update(extractionItems)
    .set(updates)
    .where(eq(extractionItems.id, itemId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "提取项不存在" }, { status: 404 });
  }

  return NextResponse.json({ item: updated });
}

/**
 * DELETE: 删除提取项
 */
export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId, itemId } = await context.params;

  const [deleted] = await db
    .delete(extractionItems)
    .where(eq(extractionItems.id, itemId))
    .returning({ id: extractionItems.id });

  if (!deleted) {
    return NextResponse.json({ error: "提取项不存在" }, { status: 404 });
  }

  // 更新计数
  await db
    .update(documents)
    .set({ extractionItemsCount: sql`GREATEST(${documents.extractionItemsCount} - 1, 0)`, updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  return NextResponse.json({ success: true });
}

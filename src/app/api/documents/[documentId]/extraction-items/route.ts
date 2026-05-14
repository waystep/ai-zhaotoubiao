// 提取项管理 API — 手动 CRUD
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { extractionItems, documents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

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
      section: body.section || null,
      title: body.title || "",
      checkpoint: body.checkpoint || "",
      consequence: body.consequence != null ? String(body.consequence) : null,
      blocks: body.blocks || [],
      extractedBy: "manual",
    })
    .returning();

  await db
    .update(documents)
    .set({ extractionItemsCount: sql`${documents.extractionItemsCount} + 1`, updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  return NextResponse.json({ item });
}

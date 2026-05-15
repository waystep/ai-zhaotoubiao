// 全局提取项 API — 不强制关联 document
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { extractionItems, documents } from "@/lib/db/schema";
import { eq, sql, isNull, and } from "drizzle-orm";

// GET: 查询无文档关联的审查项（按 projectId）
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ items: [] });

  const items = await db.query.extractionItems.findMany({
    where: and(
      eq(extractionItems.projectId, projectId),
      isNull(extractionItems.documentId)
    ),
    orderBy: (fields, { asc }) => [asc(fields.createdAt)],
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  const [item] = await db
    .insert(extractionItems)
    .values({
      documentId: body.documentId || null,
      projectId: body.projectId,
      section: body.section || null,
      title: body.title || "",
      checkpoint: body.checkpoint || "",
      consequence: body.consequence != null ? String(body.consequence) : null,
      blocks: body.blocks || [],
      extractedBy: "manual",
    })
    .returning();

  if (body.documentId) {
    await db
      .update(documents)
      .set({ extractionItemsCount: sql`${documents.extractionItemsCount} + 1`, updatedAt: new Date() })
      .where(eq(documents.id, body.documentId));
  }

  return NextResponse.json({ item });
}

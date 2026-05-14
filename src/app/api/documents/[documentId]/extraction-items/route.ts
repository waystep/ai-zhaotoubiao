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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的 JSON 请求体" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId) {
    return NextResponse.json({ error: "缺少或无效的 projectId" }, { status: 400 });
  }

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
    columns: { id: true, projectId: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  if (doc.projectId !== projectId) {
    return NextResponse.json(
      {
        error: "项目与文档不匹配",
        details: "URL 中的 documentId 必须属于 body.projectId 对应的项目。请使用该项目下文档列表中的文档 ID。",
      },
      { status: 400 }
    );
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const checkpoint = typeof body.checkpoint === "string" ? body.checkpoint.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  }
  if (!checkpoint) {
    return NextResponse.json({ error: "检查点不能为空" }, { status: 400 });
  }

  const sectionRaw = body.section;
  const section =
    sectionRaw === null || sectionRaw === undefined
      ? null
      : typeof sectionRaw === "string"
        ? sectionRaw.trim() || null
        : null;

  const consequence =
    body.consequence != null && body.consequence !== ""
      ? String(body.consequence)
      : null;

  const rawLoc = body.location;
  const loc =
    rawLoc && typeof rawLoc === "object" && rawLoc !== null && !Array.isArray(rawLoc)
      ? (rawLoc as Record<string, unknown>)
      : {};
  const pageNumber = typeof loc.pageNumber === "number" && Number.isFinite(loc.pageNumber) ? loc.pageNumber : 0;
  const blockIndex = typeof loc.blockIndex === "number" && Number.isFinite(loc.blockIndex) ? loc.blockIndex : 0;
  const location = { pageNumber, blockIndex };

  try {
    const [item] = await db
      .insert(extractionItems)
      .values({
        documentId,
        projectId,
        section,
        title: title.slice(0, 200),
        checkpoint,
        consequence,
        location,
        extractedBy: "manual",
      })
      .returning();

    await db
      .update(documents)
      .set({
        extractionItemsCount: sql`${documents.extractionItemsCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json({ item });
  } catch (e) {
    console.error("[POST /api/documents/.../extraction-items]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "创建提取项失败", details: message },
      { status: 500 }
    );
  }
}

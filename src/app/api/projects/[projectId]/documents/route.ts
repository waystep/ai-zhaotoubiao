import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents, tenderProjects } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const DOC_TYPES_ALLOWED = [
  "tender_doc",
  "legal_doc",
  "bid_doc",
  "review_report",
] as const;

/** 与 schema 中 varchar(255) 对齐，避免超长文件名导致插入失败 */
function truncateVarchar255(value: string): string {
  const chars = Array.from(value);
  if (chars.length <= 255) return value;
  return chars.slice(0, 255).join("");
}

function parsePositiveInt32(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0 || n > 2_147_483_647) return null;
  return Math.floor(n);
}

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

// GET: 获取项目文档列表
export async function GET(
  request: Request,
  context: RouteContext
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await context.params;

  try {
    // 验证项目权限
    const project = await db.query.tenderProjects.findFirst({
      where: eq(tenderProjects.id, projectId),
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    if (project.orgId !== session.user.orgId) {
      return NextResponse.json({ error: "无权访问此项目" }, { status: 403 });
    }

    const docs = await db.query.documents.findMany({
      where: eq(documents.projectId, projectId),
      orderBy: [desc(documents.createdAt)],
      with: {
        uploader: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ documents: docs });
  } catch (error) {
    console.error("获取文档列表失败:", error);
    return NextResponse.json(
      { error: "获取文档列表失败" },
      { status: 500 }
    );
  }
}

// POST: 上传文档（记录元数据）
// 注意：实际文件上传需要配合前端处理，这里只记录文档信息
export async function POST(
  request: Request,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await context.params;

  try {
    // 验证项目权限
    const project = await db.query.tenderProjects.findFirst({
      where: eq(tenderProjects.id, projectId),
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    if (project.orgId !== session.user.orgId) {
      return NextResponse.json({ error: "无权操作此项目" }, { status: 403 });
    }

    const body = await request.json();
    const { docType, name, originalName, fileSize, mimeType, storagePath } = body;

    if (
      typeof docType !== "string" ||
      typeof originalName !== "string" ||
      mimeType == null ||
      String(mimeType).trim() === "" ||
      typeof storagePath !== "string" ||
      storagePath.trim() === ""
    ) {
      return NextResponse.json({ error: "缺少必要字段或字段类型无效" }, { status: 400 });
    }

    if (!DOC_TYPES_ALLOWED.includes(docType as (typeof DOC_TYPES_ALLOWED)[number])) {
      return NextResponse.json({ error: "无效的文档类型" }, { status: 400 });
    }

    const size = parsePositiveInt32(fileSize);
    if (size === null) {
      return NextResponse.json({ error: "无效的文件大小 fileSize" }, { status: 400 });
    }

    const orig = truncateVarchar255(originalName.trim());
    const displayName = truncateVarchar255(
      (typeof name === "string" && name.trim() !== "" ? name.trim() : orig)
    );
    const mime = String(mimeType).trim().slice(0, 100);

    const [document] = await db
      .insert(documents)
      .values({
        projectId,
        uploadedBy: session.user.id,
        docType: docType as (typeof DOC_TYPES_ALLOWED)[number],
        name: displayName,
        originalName: orig,
        fileSize: size,
        mimeType: mime,
        storagePath: storagePath.trim(),
        parseStatus: "pending",
      })
      .returning();

    return NextResponse.json({ document });
  } catch (error) {
    console.error("创建文档记录失败:", error);
    const message = error instanceof Error ? error.message : String(error);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        error: "创建文档记录失败",
        ...(isDev && { details: message }),
      },
      { status: 500 }
    );
  }
}
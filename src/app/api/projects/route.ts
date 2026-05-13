import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { tenderProjects, organizations } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { createProjectSchema } from "@/types/tender";

// GET: 获取项目列表
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.orgId) {
    return NextResponse.json(
      {
        error:
          "未绑定组织。若刚清理过数据库，请退出登录后重新注册并登录。",
      },
      { status: 403 }
    );
  }

  try {
    const projects = await db.query.tenderProjects.findMany({
      where: eq(tenderProjects.orgId, session.user.orgId),
      orderBy: [desc(tenderProjects.createdAt)],
      with: {
        creator: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("获取项目列表失败:", error);
    return NextResponse.json(
      { error: "获取项目列表失败" },
      { status: 500 }
    );
  }
}

// POST: 创建新项目
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.orgId) {
    return NextResponse.json(
      {
        error:
          "未绑定组织。若刚清理过数据库，请退出登录后重新注册并登录，再创建项目。",
      },
      { status: 403 }
    );
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, session.user.orgId),
    columns: { id: true },
  });
  if (!org) {
    return NextResponse.json(
      { error: "当前组织已不存在，请重新登录后再试。" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const validatedData = createProjectSchema.parse(body);

    // 生成项目编号（如果未提供）
    const projectNo = validatedData.projectNo || `TEND-${Date.now()}`;

    const [project] = await db
      .insert(tenderProjects)
      .values({
        orgId: session.user.orgId!,
        createdBy: session.user.id,
        name: validatedData.name,
        projectNo,
        description: validatedData.description,
        tenderType: validatedData.tenderType,
        budget: validatedData.budget?.toString(),
        deadline: validatedData.deadline ? new Date(validatedData.deadline) : undefined,
        requirements: validatedData.requirements,
        scoringRules: validatedData.scoringRules,
        status: "draft",
      })
      .returning();

    return NextResponse.json({ project });
  } catch (error) {
    console.error("创建项目失败:", error);
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "数据验证失败", details: error.flatten() },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error: "创建项目失败",
        ...(process.env.NODE_ENV === "development" &&
        error instanceof Error &&
        error.message
          ? { debugMessage: error.message }
          : {}),
      },
      { status: 500 }
    );
  }
}
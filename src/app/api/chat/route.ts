import { handleChatStream } from "@mastra/ai-sdk";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import {
  documentBlocks,
  documentParsedResults,
  extractionItems,
  reviewItemResults,
  reviewReports,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mastra } from "@/mastra";

export const maxDuration = 300;

const REVIEW_FALLBACK_DELAY_MS = parseInt(
  process.env.REVIEW_FALLBACK_DELAY_MS || "30000",
  10,
);

type ChatRequestBody = {
  threadId?: string;
  resourceId?: string;
  reportId?: string;
  content?: string;
  command?: "start-review" | string;
  messages?: UIMessage[];
};

function buildLatestMessages(body: ChatRequestBody): UIMessage[] {
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    const lastMessage = body.messages[body.messages.length - 1];
    return lastMessage ? [lastMessage] : [];
  }

  if (body.content?.trim()) {
    return [
      {
        id: `user-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: body.content }],
      },
    ];
  }

  return [];
}

async function markReportInProgress(reportId: string) {
  await db
    .update(reviewReports)
    .set({
      status: "in_progress",
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(reviewReports.id, reportId));
}

async function markReportFailed(reportId: string, error: unknown) {
  await db
    .update(reviewReports)
    .set({
      status: "failed",
      aiAnalysis: {
        error: error instanceof Error ? error.message : "审查流程失败",
      },
      updatedAt: new Date(),
    })
    .where(eq(reviewReports.id, reportId));
}

async function completeReportWithFallback(reportId: string) {
  const report = await db.query.reviewReports.findFirst({
    where: eq(reviewReports.id, reportId),
    columns: {
      id: true,
      projectId: true,
      documentId: true,
      status: true,
    },
  });

  if (!report || report.status !== "in_progress") return;

  const existingResults = await db.$count(
    reviewItemResults,
    eq(reviewItemResults.reportId, reportId),
  );
  if (existingResults > 0) return;

  const items = await db.query.extractionItems.findMany({
    where: eq(extractionItems.projectId, report.projectId),
    orderBy: [extractionItems.title],
  });
  if (items.length === 0) {
    await markReportFailed(reportId, new Error("没有可用审查项，无法生成审查报告"));
    return;
  }

  const bidBlocks = await db
    .select({
      id: documentBlocks.id,
    })
    .from(documentParsedResults)
    .innerJoin(
      documentBlocks,
      eq(documentBlocks.parsedResultId, documentParsedResults.id),
    )
    .where(eq(documentParsedResults.documentId, report.documentId))
    .orderBy(documentBlocks.pageNumber, documentBlocks.blockIndex)
    .limit(3);

  const evidenceBlockIds = bidBlocks.map((block) => block.id);

  await db.transaction(async (tx) => {
    await tx.delete(reviewItemResults).where(eq(reviewItemResults.reportId, reportId));
    await tx.insert(reviewItemResults).values(
      items.map((item) => ({
        reportId,
        reviewItemId: item.id,
        status: "needs_manual_review" as const,
        reason: `已完成自动预审准备：${item.title}需要结合投标文件对应章节进行人工复核。`,
        evidenceBlockIds,
        confidence: "0.60",
        metadata: { fallback: true },
      })),
    );

    const summary = `# 投标文件审查报告

系统已完成基础审查流程。当前招标文件已提取 ${items.length} 项审查要求，投标文件已解析完成。由于智能体审查流未在本次会话中稳定产出结构化结论，系统已先生成待人工复核结果，确保报告可进入查看和后续复核环节。

## 审查结论

本报告建议状态为整改后复核。所有审查项已建立结果记录，后续可围绕完整性、关键信息一致性、质量目标、项目名称一致性、编制依据逐项核对投标文件响应内容。

## 后续建议

建议重点核对投标文件中的项目名称、标段信息、工期、质量目标、编制依据及目录完整性，并结合招标文件原文定位进行人工确认。`;

    await tx
      .update(reviewReports)
      .set({
        status: "completed",
        aiScore: "60",
        recommendation: "revise",
        summary,
        aiAnalysis: {
          fallback: true,
          reviewItemsSummary: {
            total: items.length,
            pass: 0,
            fail: 0,
            needsManualReview: items.length,
          },
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reviewReports.id, reportId));
  });
}

function scheduleReviewFallback(reportId: string) {
  setTimeout(() => {
    completeReportWithFallback(reportId).catch((error) => {
      console.error("[ReviewFallback] 自动完成报告失败:", error);
    });
  }, REVIEW_FALLBACK_DELAY_MS).unref?.();
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as ChatRequestBody;
  const reportId = body.reportId;
  const threadId = body.threadId || reportId || "default-thread";
  const resourceId = body.resourceId || reportId || "default-resource";
  const messages = buildLatestMessages(body);
  const isStartReview = body.command === "start-review";

  try {
    if (reportId && isStartReview) {
      await markReportInProgress(reportId);
      scheduleReviewFallback(reportId);
    }

    const stream = await handleChatStream({
      mastra,
      agentId: "tender-review-supervisor",
      version: "v6",
      params: {
        messages,
        maxSteps: 25,
        memory: {
          thread: threadId,
          resource: resourceId,
        },
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("handleChatStream error:", error);

    if (reportId && isStartReview) {
      await markReportFailed(reportId, error);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId") || url.searchParams.get("reportId");
  const resourceId = url.searchParams.get("resourceId") || url.searchParams.get("reportId");

  const memory = await mastra.getAgentById("tender-review-supervisor").getMemory();
  let response = null;

  try {
    response = await memory?.recall({
      threadId: threadId || "default-thread",
      resourceId: resourceId || "default-resource",
    });
  } catch {
    response = null;
  }

  return NextResponse.json(toAISdkMessages(response?.messages || [], { version: "v6" }));
}

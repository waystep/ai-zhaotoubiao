import { handleChatStream } from "@mastra/ai-sdk";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { reviewReports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mastra } from "@/mastra";

export const maxDuration = 300;

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
    }

    const stream = await handleChatStream({
      mastra,
      agentId: "tender-review-supervisor",
      version: "v6",
      params: {
        messages,
        maxSteps: 10,
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

// 审查报告生成 API - Supervisor Agent直接流式输出大模型响应（带Memory）
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { reviewReports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mastra } from "@/mastra";

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportId } = await context.params;

  try {
    // 查询报告信息
    const report = await db.query.reviewReports.findFirst({
      where: eq(reviewReports.id, reportId),
      with: { document: true },
    });

    if (!report) {
      return NextResponse.json({ error: "报告不存在" }, { status: 404 });
    }

    if (report.status !== "pending") {
      return NextResponse.json({ error: "报告已生成" }, { status: 400 });
    }

    // 更新状态
    await db.update(reviewReports)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(reviewReports.id, reportId));

    // ========== 获取Supervisor Agent ==========
    const supervisor = mastra.getAgent("tender-review-supervisor");

    // 构建审查任务 - 传递完整的审查上下文
    const task = `
请完成以下审查任务：

**审查基本信息**：
- 报告ID: ${reportId}
- 项目ID: ${report.projectId}
- 待审查文档ID: ${report.documentId}
- 文档名称: ${report.document.name}
- 文档类型: ${report.document.docType}

**任务要求**：
1. 按照你的instructions中定义的流程完成审查
2. 先检查并提取审查项和响应项（Step 0）
3. 然后协调各专业审查智能体完成审查
4. 最终生成完整的审查报告

请开始审查工作。
`;

    // ========== 创建流式响应：推送SSE格式的事件 ==========
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 使用stream()获取大模型的实时输出
          // ========== Memory配置 ==========
          // thread: 本次审查流程的对话线程ID（使用reportId，因为这是完整的一次审查流程）
          // resource: 报告ID（用于跨对话记忆，同一个报告的多次讨论共享记忆）
          const agentStream = await supervisor.stream(task, {
            memory: {
              thread: reportId, // 完整的审查流程作为一个对话会话
              resource: reportId, // 同一个报告的多次对话共享记忆
            },
            maxSteps: 30,
          });

          // ========== 推送SSE格式的事件 ==========
          // 发送开始事件
          controller.enqueue(`data: ${JSON.stringify({
            type: "start",
            message: "开始审查流程...",
            reportId,
            projectId: report.projectId,
            documentId: report.documentId,
          })}\n\n`);

          // fullStream包含：text-delta, tool-call, tool-result, agent-delegation等事件
          for await (const chunk of agentStream.fullStream) {
            // Debug: 记录所有事件类型
            console.log('Stream事件:', chunk.type, chunk);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c = chunk as any;

            if (chunk.type === "text-delta") {
              // 文本增量：推送SSE消息
              const text = c.text || "";
              if (text) {  // 只在有内容时才推送
                controller.enqueue(`data: ${JSON.stringify({
                  type: "text",
                  content: text,
                })}\n\n`);
              }
            } else if (chunk.type === "tool-call") {
              // 工具调用：推送工具调用事件
              const toolName = c.toolName || "unknown";
              const args = c.args;
              controller.enqueue(`data: ${JSON.stringify({
                type: "tool-call",
                toolName,
                args,
                message: `正在调用工具: ${toolName}`,
              })}\n\n`);
            } else if (chunk.type === "tool-result") {
              // 工具结果
              const toolName = c.toolName || "unknown";
              controller.enqueue(`data: ${JSON.stringify({
                type: "tool-result",
                toolName,
                result: "工具执行完成",
              })}\n\n`);
            } else if ((chunk.type as string).includes("delegation")) {
              // 子智能体委托：推送委托事件
              const agentName = c.agentId || c.agentName || "unknown";
              controller.enqueue(`data: ${JSON.stringify({
                type: "agent-delegation",
                agentName,
                message: `委托给子智能体: ${agentName}`,
              })}\n\n`);
            } else if (chunk.type === "step-start" || chunk.type === "step-finish") {
              // 步骤事件：推送步骤进度
              const stepName = c.stepName || c.stepId || "";
              controller.enqueue(`data: ${JSON.stringify({
                type: "step",
                stepType: chunk.type,
                stepName,
                message: chunk.type === "step-start" ? `开始步骤: ${stepName}` : `完成步骤: ${stepName}`,
              })}\n\n`);
            } else {
              // 其他事件类型也推送（用于调试和完整性）
              controller.enqueue(`data: ${JSON.stringify({
                type: "other",
                eventType: chunk.type,
                message: `事件: ${chunk.type}`,
              })}\n\n`);
            }
          }

          // 发送完成事件
          controller.enqueue(`data: ${JSON.stringify({
            type: "complete",
            message: "审查流程完成",
          })}\n\n`);

          // 获取最终结果
          const finalText = await agentStream.text || "";

          // 解析JSON报告（从输出中提取）
          const jsonMatch = finalText.match(/\{[\s\S]*"recommendation"[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const reportData = JSON.parse(jsonMatch[0]);

              // 更新数据库
              await db.update(reviewReports)
                .set({
                  status: "completed",
                  aiScore: String(reportData.score || 85),
                  summary: reportData.summary || "",
                  recommendation: reportData.recommendation || "pass",
                  completedAt: new Date(),
                })
                .where(eq(reviewReports.id, reportId));
            } catch (e) {
              console.error("JSON解析失败", e);
            }
          }

          controller.close();
        } catch (error) {
          console.error("执行失败:", error);
          controller.enqueue(`\n\n错误: ${error instanceof Error ? error.message : "未知错误"}`);
          controller.close();

          // 重置状态
          await db.update(reviewReports)
            .set({ status: "pending", updatedAt: new Date() })
            .where(eq(reviewReports.id, reportId));
        }
      },
    });

    // 返回SSE流式响应（Server-Sent Events）
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",  // SSE标准格式
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "启动失败" }, { status: 500 });
  }
}
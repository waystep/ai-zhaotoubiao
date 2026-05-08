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

    // 如果大模型 Provider 需要 API Key，但未配置，则直接失败（避免返回 200 假成功 + 后续 result 为空崩溃）
    if (!process.env.ALIBABA_CODING_PLAN_API_KEY) {
      return NextResponse.json(
        {
          error: "未配置大模型 API Key",
          details:
            "缺少环境变量 ALIBABA_CODING_PLAN_API_KEY，无法调用 alibaba-coding-plan-cn 模型。请在 .env.local 或部署环境中配置后重试。",
        },
        { status: 500 }
      );
    }

    // 更新状态
    await db.update(reviewReports)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(eq(reviewReports.id, reportId));

    // ========== 获取Supervisor Agent ==========
    const supervisor = mastra.getAgent("tender-review-supervisor");

    // 构建审查任务
    const task = `审查项目 ${report.projectId} 的文档，报告ID: ${reportId}`;

    // ========== 创建流式响应：直接推送大模型输出 ==========
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 使用stream()获取大模型的实时输出
          // ========== 添加Memory参数 ==========
          // thread: 本次审查的对话线程ID（使用reportId）
          // resource: 审查资源ID（使用projectId，便于Supervisor回忆同一项目的审查历史）
          const agentStream = await supervisor.stream(task, {
            memory: {
              thread: reportId, // 每次审查一个独立thread
              resource: report.projectId, // 同一项目的审查历史共享
            },
            maxSteps: 30,
            // 限流：每次委托前等待3秒
            onDelegationStart: async () => {
              await new Promise(r => setTimeout(r, 3000));
              return { proceed: true };
            },
          });

          // ========== 直接推送大模型的文本输出 ==========
          // fullStream包含：text-delta, thinking, tool-calls等
          for await (const chunk of agentStream.fullStream) {
            if (chunk.type === "text-delta") {
              // 文本增量：直接推送给前端显示
              controller.enqueue(chunk.textDelta);
            } else if (chunk.type === "thinking") {
              // 思考过程（如果模型支持）
              controller.enqueue(`[思考] ${chunk.thinking}\n`);
            } else if (chunk.type === "step-start") {
              // 步骤开始标记
              controller.enqueue(`\n--- ${chunk.stepId} ---\n`);
            }
          }

          // 获取最终结果
          const result = await agentStream.result.catch(() => null);
          const finalText = result?.text || "";

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

    // 返回纯文本流（不是SSE格式）
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "启动失败" }, { status: 500 });
  }
}
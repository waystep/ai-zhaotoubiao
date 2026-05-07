import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { cronManager } from "@/lib/tasks/cron-manager";

/**
 * POST: 手动触发文档状态检查
 *
 * 需要认证（管理员操作或外部cron服务调用）
 */
export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron API] 收到手动触发请求");

  try {
    // 手动触发检查
    const stats = await cronManager.triggerManually();

    return NextResponse.json({
      success: true,
      message: "文档状态检查完成",
      stats: {
        checked: stats.checked,
        completed: stats.completed,
        failed: stats.failed,
        skipped: stats.skipped,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron API] 检查出错:", error);

    return NextResponse.json(
      {
        success: false,
        error: "文档状态检查失败",
        details: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}

/**
 * GET: 获取定时任务状态
 */
export async function GET(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = cronManager.getStatus();

  return NextResponse.json({
    cronTask: {
      isScheduled: status.isScheduled,
      isRunning: status.isRunning,
      intervalSeconds: status.intervalSeconds,
      message: status.isScheduled
        ? `定时任务正在运行（每${status.intervalSeconds}秒检查一次）`
        : "定时任务未启动",
    },
    config: {
      intervalSeconds: status.intervalSeconds,
      timeoutThreshold: "30分钟",
    },
  });
}
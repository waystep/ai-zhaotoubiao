import { NextResponse } from "next/server";
import { mineruClient } from "@/lib/ai/mineru-client";

/**
 * GET: 检查 MinerU 服务状态
 */
export async function GET() {
  try {
    const isHealthy = await mineruClient.checkHealth();
    const provider = process.env.MINERU_PROVIDER === "cloud" ? "cloud" : "local";

    return NextResponse.json({
      status: isHealthy ? "healthy" : "unhealthy",
      provider,
      mineruUrl:
        provider === "cloud"
          ? process.env.MINERU_CLOUD_API_URL || "https://mineru.net/api/v4"
          : process.env.MINERU_API_URL || "http://127.0.0.1:8000",
      backend:
        provider === "cloud"
          ? process.env.MINERU_CLOUD_MODEL || "vlm"
          : process.env.MINERU_BACKEND || "hybrid-auto-engine",
      timeout: parseInt(process.env.MINERU_TIMEOUT || "300", 10),
    });
  } catch (error) {
    console.error("[MinerU Health Check] 失败:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "检查失败",
      },
      { status: 500 }
    );
  }
}

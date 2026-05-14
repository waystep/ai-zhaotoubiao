import { NextRequest, NextResponse } from "next/server";

import { mastra } from "@/mastra";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectId = body.projectId;
    const bidDocumentId = body.bidDocumentId || body.documentId;
    const reportId = body.reportId;

    if (!projectId || !bidDocumentId) {
      return NextResponse.json(
        { error: "缺少必要参数：projectId, bidDocumentId" },
        { status: 400 }
      );
    }

    const agent = mastra.getAgentById("tender-review-agent");

    const prompt = `
请审查该项目中的投标文件，并将结构化结果保存到数据库。

输入：
- reportId: ${reportId || "未提供"}
- projectId: ${projectId}
- bidDocumentId: ${bidDocumentId}

请严格执行以下步骤：
1. 优先使用显式传入的 reportId；如果未提供，再解析或创建 report
2. 获取审查项列表
3. 获取投标文件 blocks
4. 逐条判断每个审查项是否存在问题
5. 将 reviewItemResults 和 issues 结构化落库
6. 最后返回简短总结
`;

    const result = await agent.generate(prompt, { maxSteps: 25 });

    return NextResponse.json({
      success: true,
      result: {
        text: result.text,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        usage: result.usage,
      },
    });
  } catch (error) {
    console.error("Mastra Agent review failed:", error);
    return NextResponse.json(
      {
        error: "审查过程中发生错误",
        details: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  if (action === "info") {
    return NextResponse.json({
      agent: {
        id: "tender-review-supervisor",
        name: "招标审查总协调专家",
      },
    });
  }

  return NextResponse.json({
    message: "推荐使用 /api/chat 进行审查会话；该路由仅保留兼容用途。",
  });
}

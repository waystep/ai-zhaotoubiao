// 招标审查总协调智能体 - Supervisor Agent协调各专业审查智能体
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { extractionAgent } from "./extraction-agent";
import { tenderReviewAgent } from "./tender-review-agent";
import { reportGenerationAgent } from "./report-generation-agent";
import { getStandardDocumentsParseStatusTool } from "../tools/get-standard-documents-parse-status-tool";
import {
  reviewModelConfig,
  supervisorInstructions,
  supervisorWorkingMemoryTemplate,
} from "../config/review";
import { pgStore, pgVector } from "../storage";

export const tenderReviewSupervisor = new Agent({
  id: "tender-review-supervisor",
  name: "招标审查总协调专家",
  description: `招标文件审查的总协调者，负责协调专业审查团队完成完整审查流程。

输入要求：
- projectId: 项目ID
- reportId: 审查报告ID
- documentId: 资料ID

输出格式：
{
  "success": true,
  "reportId": "...",
  "issueCount": 10,
  "score": 85,
  "recommendation": "pass/revise/fail",
  "summary": "审查摘要..."
}

审查流程：
1. 读取 extraction 已提取的审查项
2. 如果无 extraction 已提取信息，则需要调用extraction智能体提取相关内容
3. 如果已经有审查项，则调用审查智能体审查
3. 审查图表/印章等图像
4. 汇总结果生成报告

使用时机：完整的招标文件审查任务。
`,
  instructions: supervisorInstructions,
  model: reviewModelConfig.defaultModel,
  memory: new Memory({
    storage: pgStore,
    vector: pgVector,
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: supervisorWorkingMemoryTemplate,
      },
      generateTitle: true,
    },
  }),
  agents: {
    extractionAgent,
    tenderReviewAgent,
    reportGenerationAgent,
  },
  tools: {
    getStandardDocumentsParseStatusTool,
  },
});

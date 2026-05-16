// 招标审查总协调智能体 - Supervisor Agent协调各专业审查智能体
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { extractionAgent } from "./extraction-agent";
import { tenderReviewAgent } from "./tender-review-agent";
import { reportGenerationAgent } from "./report-generation-agent";
import { getStandardDocumentsParseStatusTool } from "../tools/get-standard-documents-parse-status-tool";
import { getReportInfoTool } from "../tools/get-report-info-tool";
import { reportStatusUpdateTool } from "../tools/report-status-update-tool";
import {
  reviewModelConfig,
  supervisorInstructions,
  supervisorWorkingMemoryTemplate,
} from "../config/review";
import { pgStore, pgVector } from "../storage";

export const tenderReviewSupervisor = new Agent({
  id: "tender-review-supervisor",
  name: "招标审查总协调专家",
  description: `招标文件审查的总协调者，负责协调专业审查团队完成完整审查流程，并在最后验证数据完整性、更新报告状态。

输入要求：
- projectId: 项目ID
- reportId: 审查报告ID
- documentId: 资料ID

审查流程：
1. 检查标准文件解析状态和已有审查项（getStandardDocumentsParseStatusTool）
2. 审查项不足时委托 extraction-agent 提取（仅一次）
3. 委托 tender-review-agent 逐条审查投标文件（仅一次）
   - 审查智能体会存储 issues 和 reviewItemResults，并更新 score、recommendation
4. 委托 report-generation-agent 汇总生成报告摘要（仅一次）
   - 报告智能体会存储 summary
5. 使用 getReportInfoTool 获取报告最终状态，验证数据完整性
6. 确认完成后使用 reportStatusUpdateTool 将报告状态更新为 completed

职责范围：
- 协调各子智能体执行审查任务
- 监控审查进度
- 验证审查结果完整性
- 最终更新报告状态（仅此智能体有权更新状态）

使用时机：完整的招标文件审查任务。
`,
  instructions: supervisorInstructions,
  model: reviewModelConfig.defaultModel,
  memory: new Memory({
    storage: pgStore,
    vector: pgVector,
    options: {
      lastMessages: 10,
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: supervisorWorkingMemoryTemplate,
      },
      observationalMemory: {
        enabled: true,
        model: reviewModelConfig.defaultModel,
        observation: { messageTokens: 60000, blockAfter: 90000 },
        reflection: { observationTokens: 90000 },
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
    getReportInfoTool,
    reportStatusUpdateTool,
  },
});

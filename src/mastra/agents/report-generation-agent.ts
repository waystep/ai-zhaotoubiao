// 报告生成智能体 - 汇总审查结果并生成最终报告
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { getImageRisksTool } from "../tools/get-image-risks-tool";
import { getReportTool } from "../tools/get-report-tool";
import { reportSummaryStorageTool } from "../tools/report-summary-storage-tool";
import {
  reportGenerationInstructions,
  reportWorkingMemoryTemplate,
  reviewModelConfig,
} from "../config/review";
import { pgStore, pgVector } from "../storage";

export const reportGenerationAgent = new Agent({
  id: "report-generation-agent",
  name: "审查报告撰写专家",
  description: `汇总审查结果，生成结构化审查报告摘要并存储到数据库。

输入要求：
- reportId: 审查报告ID（用于存储）
- projectId: 项目ID

职责范围：
- 生成审查报告摘要（summary）
- 使用 reportSummaryStorageTool 存储摘要
- 不负责更新报告状态（由总协调智能体负责）

报告摘要结构：
- 审查概要：项目信息、审查范围、检查点清单
- 暗标风险：图片中发现的Logo、水印、其他项目名称等
- 问题清单：按严重程度分类（critical/major/minor/suggestion）
- 评分结论：建议结论（pass/revise/fail）
- 整改建议：针对性整改建议

使用时机：审查流程最后一步，汇总所有结果生成报告摘要。
`,
  instructions: reportGenerationInstructions,
  model: reviewModelConfig.reasoningModel,
  memory: new Memory({
    storage: pgStore,
    vector: pgVector,
    options: {
      lastMessages: 10,
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: reportWorkingMemoryTemplate,
      },
      observationalMemory: {
        enabled: true,
        model: reviewModelConfig.reasoningModel,
        observation: { messageTokens: 60000, blockAfter: 90000 },
        reflection: { observationTokens: 90000 },
      },
      generateTitle: true,
    },
  }),
  tools: {
    getReportTool,
    getImageRisksTool,
    reportSummaryStorageTool,
  },
});

// 招标文件审查 Agent
// 直接使用 Mastra 内置的 ModelsDevGateway 模型路由
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { documentReaderTool } from "../tools/document-reader-tool";
import { getReviewItemsTool } from "../tools/get-review-items-tool";
import { getReportTool } from "../tools/get-report-tool";
import { resolveReviewReportTool } from "../tools/resolve-review-report-tool";
import { reviewResultsStorageTool } from "../tools/review-results-storage-tool";
import { issueStorageTool } from "../tools/issue-storage-tool";
import { reviewModelConfig, tenderReviewInstructions } from "../config/review";
import { pgStore, pgVector } from "../storage";

export const tenderReviewAgent = new Agent({
  id: "tender-review-agent",
  name:"投标文件审查专家",
  instructions: tenderReviewInstructions,
  model: reviewModelConfig.defaultModel,
  memory: new Memory({
    storage: pgStore,
    vector: pgVector,
    options: {
      lastMessages: 10,
      workingMemory: {
        enabled: true,
        scope: "resource",
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
  tools: {
    resolveReviewReportTool,
    getReportTool,
    getReviewItemsTool,
    documentReaderTool,
    reviewResultsStorageTool,
    issueStorageTool,
  },
});

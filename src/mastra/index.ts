// Mastra 实例配置 - 使用 PostgreSQL Storage
import { Mastra } from "@mastra/core";
import { MastraEditor } from "@mastra/editor";
import { Memory } from "@mastra/memory";
import { pgStore, pgVector } from "./storage";

// 导入所有智能体
import { tenderReviewAgent } from "./agents/tender-review-agent";
import { orchestrationAgent } from "./agents/orchestration-agent";
import { imageReviewAgent } from "./agents/image-review-agent";
import { contentReviewAgent } from "./agents/content-review-agent";
import { tenderResponseAgent } from "./agents/tender-response-agent";
import { reportGenerationAgent } from "./agents/report-generation-agent";
import { tenderReviewSupervisor } from "./agents/tender-review-supervisor";
import { extractionAgent } from "./agents/extraction-agent";

// ========== Memory 配置（共享给所有Agent）==========
const defaultMemory = new Memory({
  storage: pgStore,
  vector: pgVector,
  options: {
    // 最近20条消息作为上下文
    lastMessages: 20,
    // 工作记忆：存储结构化数据（如用户偏好）
    workingMemory: {
      enabled: true,
      scope: "resource",
    },
    // 自动生成对话标题
    generateTitle: true,
  },
});

export const mastra = new Mastra({
  // ========== Instance-level Storage ==========
  // 所有Agent共享此storage
  storage: pgStore,
  agents: {
    // Supervisor Agent - 总协调者（带Memory）
    "tender-review-supervisor": tenderReviewSupervisor,

    // Extraction Agent - 文档提取专家（新增）
    "extraction-agent": extractionAgent,

    // 专业审查智能体（子Agent）
    "orchestration-agent": orchestrationAgent,
    "image-review-agent": imageReviewAgent,
    "content-review-agent": contentReviewAgent,
    "tender-response-agent": tenderResponseAgent,
    "report-generation-agent": reportGenerationAgent,

    // 保留旧智能体（向后兼容）
    "tender-review-agent": tenderReviewAgent,
  },

  editor: new MastraEditor(),
});

// ========== 导出共享组件供Agent使用 ==========
export { pgStore, pgVector, defaultMemory };
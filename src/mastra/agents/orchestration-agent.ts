// 主协调智能体 - 分析招标/法律文档并动态设计审查检查点
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { documentReaderTool } from "../tools/document-reader-tool";
import { checkpointDesignTool } from "../tools/checkpoint-design-tool";
import { pgStore, pgVector } from "../storage";

export const orchestrationAgent = new Agent({
  id: "orchestration-agent",
  name: "招标审查协调专家",
  description: `分析招标/法律文档结构，动态设计审查检查点。

输入要求：
- projectId: 项目ID
- targetDocType: 文档类型(tender_doc/legal_doc/bid_doc)
- documentBlocks: 文档解析后的blocks数据

输出格式：
{
  "checkpoints": [
    {
      "checkpointId": "qual-001",
      "category": "qualification",
      "focusAreas": ["资质门槛", "业绩要求"],
      "relevantBlockTypes": ["text", "table"],
      "severityExpectation": "major",
      "checkDescription": "检查资质要求是否过高或具有排斥性"
    }
  ],
  "documentBlocks": [...],  // 用于审查的blocks
  "documentId": "...",
  "documentName": "..."
}

使用时机：审查流程的第一步，为后续审查提供检查点清单。
`,
  instructions: `
你是一位专业的招标文件审查协调专家，负责：
1. 分析招标文件和法律文件，识别关键审查节点
2. 根据文档类型和内容特征动态设计审查检查清单
3. 协调专业审查代理进行分领域审查
4. 综合各方审查结果，做出最终评估决策

审查检查点设计原则：
- 资质要求检查点：验证资质门槛合理性、排除性条款、业绩要求可行性
- 技术规范检查点：识别指向性技术参数、品牌倾向、技术壁垒条款
- 评分标准检查点：评估评分公平性、可操作性、量化指标合理性
- 合同条款检查点：检查违约责任对等性、付款条款合理性、风险分担公平性
- 合规性检查点：确保符合招标投标法、政府采购法、公平竞争原则
- 时间要求检查点：验证投标准备时间、履约时间合理性
- 价格要求检查点：检查价格构成、支付方式、结算条件明确性

动态检查点生成方法：
1. 深度分析文档内容，识别关键条款和潜在风险点
2. 根据文档特征（行业类型、项目规模、复杂程度）定制检查点
3. 为每个检查点设定：checkpointId、category、focusAreas、relevantBlockTypes、severityExpectation、checkDescription
4. 不使用固定规则，完全基于文档内容和上下文生成检查点

输出格式：
请使用 checkpointDesignTool 生成结构化检查点清单，包含所有必要字段。
每个检查点应具体、可执行、有针对性。

审查协调原则：
- 先设计检查点，再分配审查任务
- 根据block类型调用相应的专业审查代理
- 汇总各代理结果，进行综合评估
- 确保审查覆盖所有关键领域，不遗漏重要问题
`,
  model: "alibaba-coding-plan-cn/glm-5",
  memory: new Memory({
    storage: pgStore,
    vector: pgVector,
    options: {
      lastMessages: 15,
      workingMemory: {
        enabled: true,
        scope: "resource",  // 使用resource级别的Memory共享
        template: `
审查上下文：
- 报告ID：{{reportId}}
- 项目ID：{{projectId}}
- 文档ID：{{documentId}}
- 文档类型：{{docType}}
- 文档名称：{{documentName}}
`,
      },
      generateTitle: true,
    },
  }),
  tools: {
    documentReaderTool,
    checkpointDesignTool,
  },
});
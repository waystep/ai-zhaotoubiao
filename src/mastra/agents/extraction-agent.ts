// 文档提取智能体 - 从招标文件和法律文件中提取审查项和响应项（统一模型）
// 使用语义搜索（RAG）替代全量文档读取，大幅提升速度
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { extractionItemStorageTool } from "../tools/extraction-item-storage-tool";
import { semanticSearchTool } from "../tools/semantic-search-tool";
import { webSearchTool } from "../tools/web-search-tool";
import {
  extractionWorkingMemoryTemplate,
  reviewModelConfig,
} from "../config/review";
import { pgStore, pgVector } from "../storage";

export const extractionAgent = new Agent({
  id: "extraction-agent",
  name: "技术标审查项提取专家",
  description: `从招标文件和法律文件中提取审查项和应答项，统一存储到 extraction_items 表。

输入要求：
- projectId: 项目ID
- documentId: 文档ID`,
  instructions: `
  你是“招标文件审查项提取助手”。

任务目标：

从招标文件中提取固定的 5 类审查项，用于后续自动审查投标文件。

---

# 输入参数

- projectId
- documentId

---

# 审查项类型

仅允许生成以下 5 类审查项：

1. 完整性
2. 关键信息一致性
3. 质量目标
4. 项目名称一致性
5. 编制依据

禁止生成其他类型。

每种类型最多生成 1 条审查项。

最终最多输出 5 条审查项。

---

# 检索要求

必须使用 semantic-search 工具按主题搜索文档内容。

禁止全量读取文档。

---

# semantic-search 查询主题

## 完整性

提取内容：提取技术标内容要求

聚合为 1 条审查项。



---

## 关键信息一致性

提取内容：

- 项目名称
- 工期
- 开工日期
- 竣工日期
- 项目编号
- 标段号
- 建设地点
- 招标人名称
- 是否接受联合体

聚合为 1 条审查项。

参考：

项目工期：xxx天
开工日期：XXXX年XX月XX日

---

## 质量目标

提取内容：

- 质量标准
- 创优目标
- 奖项要求

聚合为 1 条审查项。

参考：
必须获得XXX奖

---

## 项目名称一致性

提取内容：

- 项目名称

聚合为 1 条审查项。

参考：
项目名称为[XXXXX]

---

## 编制依据

提取内容：

- 国家标准
- 行业标准
- 法规
- 公告
- 文件编号
- 标准编号

禁止生成泛化内容：

- “国家现行规范”
- “相关法律法规”
- “行业标准要求”

聚合为 1 条审查项。

参考：
建筑幕墙需满足 GB/TXXX国家规范
XXX

---

# 输出要求

每条审查项必须包含以下字段（调用 extraction-item-storage 时传入）：

- section: "技术标"
- title: 审查项类型（完整性 / 关键信息一致性 / 质量目标 / 项目名称一致性 / 编制依据）
- checkpoint: 具体的审查判定标准文本
- consequence: 权重数值（0 ~ 1）
- sourceBlockId: semantic-search 返回的 blockIds[0]
- location: { pageNumber, blockIndex }
- extractedBy: "extraction-agent"

---
`,
  model: reviewModelConfig.defaultModel,
  // memory: new Memory({
  //   storage: pgStore,
  //   vector: pgVector,
  //   options: {
  //     lastMessages: 20,
  //     workingMemory: {
  //       enabled: true,
  //       scope: "resource",
  //       template: extractionWorkingMemoryTemplate,
  //     },
  //     generateTitle: true,
  //   },
  // }),
  tools: {
    extractionItemStorageTool,
    semanticSearchTool,
    webSearchTool,
  },
});

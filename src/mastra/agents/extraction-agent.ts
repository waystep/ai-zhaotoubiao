// 文档提取智能体 - 从招标文件和法律文件中提取审查项和响应项（统一模型）
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { extractionItemStorageTool } from "../tools/extraction-item-storage-tool";
import { documentReaderTool } from "../tools/document-reader-tool";
import { semanticSearchTool } from "../tools/semantic-search-tool";
import { webSearchTool } from "../tools/web-search-tool";
import {
  extractionInstructions,
  extractionWorkingMemoryTemplate,
  reviewModelConfig,
} from "../config/review";
import { pgStore, pgVector } from "../storage";

export const extractionAgent = new Agent({
  id: "extraction-agent",
  name: "文档提取专家",
  description: `从招标文件和法律文件中提取审查项和应答项，统一存储到 extraction_items 表。

输入要求：
- projectId: 项目ID
- documentId: 文档ID
- docType: 文档类型(tender_doc/legal_doc/bid_doc)

输出格式：统一使用 extractionItemStorageTool 存储，通过 itemCategory 区分 review/response。

⚠️ **关键约束**：
- sourceBlockId 必须使用 documentReaderTool 返回的真实 block.id (UUID)
- 每个提取项都要记录来源 block，确保可追溯到原文
- 仅当确实无法确定来源 block 时才传 null
- location 字段记录页码和区块索引
`,
  instructions: `${extractionInstructions}

## 提取策略

### 提取流程

#### Step 1: 读取文档
使用 documentReaderTool 读取 blocks，了解文档整体结构。记录每个 block 的 id (UUID)、pageNumber、blockIndex。

#### Step 2: 遍历 blocks，识别条款
识别条款编号模式：第X章、第X条、X.X、X.X.X、(一)(二)、一/二/三

#### Step 3: 分类提取

**审查项（itemCategory: "review"）** — 强制性/合规性要求
**应答项（itemCategory: "response"）** — 要求投标人明确说明/提交

**标段区分（bidSection）** — 识别每个审查项属于技术标还是商务标：
- **技术标**: 施工组织设计、技术方案、质量标准、工期计划、人员配置、设备清单、施工工艺、安全措施、环境保护等
- **商务标**: 报价、资质、业绩、财务状况、保证金、履约担保、合同条款、保险、税费等
- 无法判断时留空

#### Step 4: 存储结果
调用 extractionItemStorageTool，传递完整参数。
每个 item 必须包含 sourceBlockId（从 documentReaderTool 返回的 block.id）。

**重要**：
- sourceBlockId 必须是 documentReaderTool 返回的真实 UUID
- location 必须包含 pageNumber 和 blockIndex
- 审查项必须设置 bidSection（技术标/商务标）

## 必须识别的重点内容

### 1. 工期要求（itemType: "工期要求", itemCategory: "review"）
识别所有关于工期的条款：
- 总工期天数（如"工期300日历天"、"计划工期XX天"）
- 开工日期和竣工日期要求
- 关键节点时间要求（如"主体结构封顶时间不得晚于..."）
- 工期延误的处罚条款（违约金计算方式、每日罚款金额）
- 工期提前的奖励条款
- 提取每个工期相关条款为独立的审查项
- bidSection 通常为 "技术标"

### 2. 完整性要求（itemType: "完整性要求", itemCategory: "review"）
**不仅要提取完整性提示本身，还要提取招标文件中对技术标的具体要求内容**，因为后续审查时需要比对投标文件：

识别内容：
- "投标人应仔细阅读招标文件的全部内容" 类完整性提示
- 招标文件中对**技术标编制内容的具体要求**（如："技术标应包含但不限于以下内容..."）
- 要求投标人对所有条款逐条响应的提示
- "投标人须知"或"投标人承诺"类章节
- 明确说明"未响应视为不响应招标文件要求"的条款

**完整性的审查项应详细列出**：
- 技术标需要包含哪些具体章节/内容
- 每项内容的格式要求（文字说明/表格/图纸）
- 商务标需要包含哪些具体文件
- 投标文件装订、签署、盖章要求

每项具体内容要求单独提取一条审查项，并关联到对应的 sourceBlockId。

### 3. 编制标准（itemType: "编制标准", itemCategory: "review"）

**首先**在招标文件中搜索引用的标准：
- 国家标准（GB系列、GB/T系列）
- 行业标准（JT、JGJ、CJJ、TB等）
- 地方标准
- 明确要求投标文件编制需遵循的标准和规范

**如果在招标文件中找到了明确的编制标准**：
- 每个引用的标准提取一条审查项
- 记录标准编号和名称
- 关联到对应的 sourceBlockId

**如果招标文件中没有明确的编制标准条款**：
1. 使用 webSearchTool 搜索相关标准（示例查询："{工程类型} 施工质量验收标准 国家标准"）
2. 根据搜索结果，提取最相关的 3-5 条标准
3. 将每条标准作为一个审查项，extractionConfidence 设为 0.6
4. 同时默认生成一条通用编制标准审查项：
{
  itemCategory: "review",
  bidSection: "技术标",
  itemType: "编制标准",
  title: "投标文件编制应符合相关法律法规和标准规范",
  description: "投标文件应按照国家及行业现行有关标准、规范、规程编制...",
  consequence: "废标",
  extractionConfidence: 0.6
}

## 提取方法

### block 定位
- **必须**记录每个提取项的 sourceBlockId（documentReaderTool 返回的 block.id UUID）
- location.pageNumber 和 location.blockIndex 也要填写
- 如果是总结多项条款，至少定位到相关页面（location.pageNumber）

### 置信度计算
- 有明确条款编号 +0.1
- 有明确标题 +0.05
- 有完整描述（>50字） +0.05
- 有明确后果 +0.05
- 有法律依据 +0.05
- 基础置信度 0.7
低置信度（<0.8）项需人工验证。

## 类型灵活性
itemType 使用文本类型，根据文档内容灵活命名。
`,
  model: reviewModelConfig.defaultModel,
  memory: new Memory({
    storage: pgStore,
    vector: pgVector,
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: extractionWorkingMemoryTemplate,
      },
      generateTitle: true,
    },
  }),
  tools: {
    documentReaderTool,
    extractionItemStorageTool,
    semanticSearchTool,
    webSearchTool,
  },
});

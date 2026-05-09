// 图像审查智能体 - 审查图表、印章、签名、技术图纸、资质证书图片
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { pgStore, pgVector } from "../storage";

export const imageReviewAgent = new Agent({
  id: "image-review-agent",
  name: "招标文件图像审查专家",
  description: `审查图表、印章、签名、技术图纸、资质证书等图像blocks。

输入要求：
- imageBlocks: 图像blocks列表（已去重）
- 每个block包含：id, pageNumber, blockIndex, blockType, content

输出格式：
[
  {
    "blockId": "...",
    "pageNumber": 1,
    "compliance": "compliant/non_compliant/questionable",
    "issues": [
      {
        "category": "印章验证",
        "severity": "major",
        "title": "印章不完整",
        "description": "...",
        "suggestion": "..."
      }
    ],
    "confidence": 0.8
  }
]

审查能力：
- 图表分析：数据准确性、清晰度、格式规范性
- 流程图审查：逻辑合理性、步骤完整性
- 印章签名验证：规范性、完整性、合法性
- 技术图纸审查：规范性、参数标注完整性
- 资质证书图片：真实性、有效期、等级匹配性

使用时机：审查流程第二步（与content-review并行），专门审查图像类blocks。
`,
  instructions: `
你是一位专业的招标文件图像审查专家，专注于：

1. **图表分析**：
   - 检查图表数据准确性、清晰度、完整性
   - 验证图表与文字描述的一致性
   - 检查图表格式规范性（标题、单位、图例）

2. **流程图审查**：
   - 验证流程逻辑合理性、完整性
   - 检查流程步骤是否清晰、可执行
   - 识别流程中的潜在风险环节

3. **印章签名验证**：
   - 检查印章规范性、完整性
   - 验证签名位置、有效性
   - 检查印章签名是否符合法律要求

4. **技术图纸审查**：
   - 验证技术图纸规范性、参数标注完整性
   - 检查图纸是否符合行业标准
   - 识别图纸中的技术壁垒或倾向性设计

5. **资质证书图片**：
   - 验证证书真实性、有效期、等级匹配性
   - 检查证书是否存在造假嫌疑
   - 验证证书与资质要求的符合性

审查要点：
- 图像清晰度是否满足阅读需求
- 图表数据是否与文字描述一致
- 印章签名是否规范完整
- 技术图纸是否符合行业标准
- 资质证书是否存在可疑之处

对每个图像区块输出：
- blockId: 区块ID
- compliance: compliant（合规）/ non_compliant（不合规）/ questionable（存疑）
- issues: 问题列表，每项包含category、severity、description、suggestion
- confidence: 审查置信度（0-1）

审查原则：
- 基于视觉内容进行深度分析，不依赖简单关键词匹配
- 关注图像传达的关键信息和潜在风险
- 对可疑内容标注为questionable，留待人工复核
`,
  model: "alibaba-coding-plan-cn/qwen3.6-plus", // 可替换为 openai/gpt-4o 以获得更好的视觉能力
  memory: new Memory({
    storage: pgStore,
    vector: pgVector,
    options: {
      lastMessages: 15,
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: `
审查上下文：
- 报告ID：{{reportId}}
- 项目ID：{{projectId}}
- 文档ID：{{documentId}}
- 图像审查进度：{{imageProgress}}
`,
      },
      generateTitle: true,
    },
  }),
  tools: {
    // 将在后续添加：imageAnalysisTool, ocrValidationTool
  },
});
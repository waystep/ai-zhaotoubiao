// 检查点设计工具 - 根据文档分析动态生成审查检查点
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Define output schema separately for type reference
const checkpointOutputSchema = z.object({
  checkpoints: z.array(
    z.object({
      checkpointId: z.string().describe("检查点唯一标识"),
      category: z.enum(["qualification", "technical", "scoring", "contract", "compliance", "time", "price"]).describe("检查类别"),
      focusAreas: z.array(z.string()).describe("关注领域列表"),
      relevantBlockTypes: z.array(z.string()).describe("相关区块类型"),
      severityExpectation: z.enum(["critical", "major", "minor", "suggestion"]).describe("预期问题严重程度"),
      checkDescription: z.string().describe("检查描述"),
      keywordsToCheck: z.array(z.string()).optional().describe("关键词提示"),
      regulationReference: z.string().optional().describe("相关法规依据"),
    })
  ),
  totalCheckpoints: z.number().int().positive().describe("检查点总数"),
  generationMethod: z.enum(["dynamic", "hybrid", "fixed"]).describe("生成方法"),
});

export const checkpointDesignTool = createTool({
  id: "checkpoint-design",
  description: "从招标/法律文档中动态生成审查检查点清单，不使用固定规则",
  inputSchema: z.object({
    documentId: z.string().uuid().describe("文档ID"),
    documentName: z.string().describe("文档名称"),
    docType: z.enum(["tender_doc", "legal_doc", "bid_doc"]).describe("文档类型"),
    documentContent: z.string().describe("文档全文内容（前5000字符）"),
    blocks: z
      .array(
        z.object({
          id: z.string().uuid(),
          pageNumber: z.number(),
          blockIndex: z.number(),
          blockType: z.string().optional(),
          content: z.string(),
        })
      )
      .describe("文档区块列表"),
    analysisContext: z.string().describe("文档分析上下文（由主智能体提供的分析结果）"),
  }),
  outputSchema: checkpointOutputSchema,
  execute: async ({ documentId, documentName, docType, documentContent, blocks, analysisContext }) => {
    // AI动态生成检查点（不使用固定规则）
    // 这里提供一个基础实现，实际运行时由主智能体调用并生成

    // 根据文档类型和内容特征生成检查点
    const checkpoints: z.infer<typeof checkpointOutputSchema>["checkpoints"] = [];

    // 基础检查点框架（实际应由AI动态生成，这里仅作示例）
    const baseCheckpoints = {
      tender_doc: [
        {
          checkpointId: "cp_qualification_001",
          category: "qualification",
          focusAreas: ["资质门槛合理性", "业绩要求可行性", "排斥性条款"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "critical",
          checkDescription: "检查资质要求是否存在过高门槛或不合理限制",
          regulationReference: "招标投标法第十八条",
        },
        {
          checkpointId: "cp_technical_001",
          category: "technical",
          focusAreas: ["技术参数倾向性", "品牌指定", "技术壁垒"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "critical",
          checkDescription: "检查技术规范是否存在指向特定供应商的倾向性条款",
          regulationReference: "招标投标法第二十条",
        },
        {
          checkpointId: "cp_scoring_001",
          category: "scoring",
          focusAreas: ["评分标准明确性", "评分公平性", "主观评分项"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "major",
          checkDescription: "检查评分标准是否明确、公平、可操作",
          regulationReference: "政府采购法第四十七条",
        },
        {
          checkpointId: "cp_contract_001",
          category: "contract",
          focusAreas: ["违约责任对等性", "付款条款合理性", "风险分担"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "major",
          checkDescription: "检查合同条款是否公平、违约责任是否对等",
          regulationReference: "合同法相关规定",
        },
        {
          checkpointId: "cp_compliance_001",
          category: "compliance",
          focusAreas: ["地域限制", "所有制限制", "排斥性条款"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "critical",
          checkDescription: "检查是否存在违反公平竞争原则的排斥性条款",
          regulationReference: "招标投标法第六条",
        },
        {
          checkpointId: "cp_time_001",
          category: "time",
          focusAreas: ["投标准备时间", "履约时间合理性"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "major",
          checkDescription: "验证投标准备时间是否充足（不少于20天）、履约时间是否合理",
          regulationReference: "招标投标法第二十四条",
        },
        {
          checkpointId: "cp_price_001",
          category: "price",
          focusAreas: ["价格构成明确性", "支付方式合理性", "结算条件"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "minor",
          checkDescription: "检查价格条款是否明确、是否存在歧义",
          regulationReference: "政府采购法相关规定",
        },
      ],
      legal_doc: [
        {
          checkpointId: "cp_compliance_001",
          category: "compliance",
          focusAreas: ["合规性审查", "法律依据"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "critical",
          checkDescription: "检查法律文件是否符合相关法律法规要求",
          regulationReference: "相关法律法规",
        },
        {
          checkpointId: "cp_contract_001",
          category: "contract",
          focusAreas: ["合同条款公平性", "违约责任"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "major",
          checkDescription: "检查合同条款是否公平、符合法律要求",
          regulationReference: "合同法相关规定",
        },
      ],
      bid_doc: [
        {
          checkpointId: "cp_technical_001",
          category: "technical",
          focusAreas: ["技术响应完整性", "技术参数符合性"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "major",
          checkDescription: "验证技术方案是否响应招标技术要求",
          regulationReference: "招标投标法相关规定",
        },
        {
          checkpointId: "cp_price_001",
          category: "price",
          focusAreas: ["报价合理性", "价格构成完整性"],
          relevantBlockTypes: ["text", "table"],
          severityExpectation: "major",
          checkDescription: "评估报价是否在合理区间、价格构成是否完整",
          regulationReference: "政府采购法相关规定",
        },
      ],
    } as const;

    // 从基础框架中提取检查点（实际应由AI根据analysisContext动态生成）
    checkpoints.push(...((baseCheckpoints[docType] || []) as unknown as z.infer<typeof checkpointOutputSchema>["checkpoints"]));

    // 根据文档内容特征补充检查点（这里仅作示例，实际应由AI生成）
    // 例如：如果发现关键词"指定品牌"，增加针对性检查点
    if (documentContent.includes("指定品牌") || documentContent.includes("特定型号")) {
      checkpoints.push({
        checkpointId: "cp_technical_brand_001",
        category: "technical",
        focusAreas: ["品牌倾向", "型号指定"],
        relevantBlockTypes: ["text"],
        severityExpectation: "critical",
        checkDescription: "检查是否存在指定品牌或型号的倾向性条款",
        keywordsToCheck: ["指定品牌", "特定型号", "必须采用"],
        regulationReference: "招标投标法第二十条",
      });
    }

    return {
      checkpoints,
      totalCheckpoints: checkpoints.length,
      generationMethod: "dynamic" as const,
    };
  },
});
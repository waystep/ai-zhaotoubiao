// 统一提取项存储工具 - 替代 reviewItemStorageTool 和 responseItemStorageTool
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { extractionItems, documents, documentBlocks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function validateBlockId(blockId: string | undefined | null): Promise<string | null> {
  if (!blockId || !UUID_RE.test(blockId)) return null;
  const exists = await db.query.documentBlocks.findFirst({
    where: eq(documentBlocks.id, blockId),
    columns: { id: true },
  });
  return exists ? exists.id : null;
}

export const extractionItemStorageTool = createTool({
  id: "extraction-item-storage",
  description:
    "将提取的审查项或应答项存储到统一的 extraction_items 表。sourceBlockId 必须使用 documentReaderTool 返回的真实 block.id (UUID)。bidSection 用于区分技术标/商务标。",
  inputSchema: z.object({
    projectId: z.string().uuid().describe("项目ID"),
    documentId: z.string().uuid().describe("文档ID"),
    items: z
      .array(
        z.object({
          itemCategory: z
            .enum(["review", "response"])
            .describe("类别：review=审查项, response=应答项"),
          bidSection: z
            .enum(["技术标", "商务标"])
            .optional()
            .describe("标段区分：技术标或商务标，无法判断时留空"),
          sourceBlockId: z
            .string()
            .optional()
            .describe("来源区块的真实 UUID（从 documentReaderTool 返回的 block.id），无法确定时传 null 或跳过"),
          itemType: z.string().describe("类型（如：工期要求、资质要求、完整性要求、编制标准等）"),
          itemNo: z.string().optional().describe("条款编号"),
          title: z.string().describe("标题"),
          description: z.string().describe("详细描述"),
          location: z
            .object({
              pageNumber: z.number().int().positive(),
              blockIndex: z.number().int().nonnegative(),
              bbox: z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() }).optional(),
              textSnippet: z.string().optional(),
              highlightText: z.string().optional(),
            })
            .optional()
            .describe("位置信息（页码从1开始）"),
          requirements: z
            .object({
              mandatory: z.boolean().optional(),
              threshold: z.any().optional(),
              criteria: z.array(z.string()).optional(),
              proofRequired: z.array(z.string()).optional(),
            })
            .optional(),
          consequence: z.string().optional().describe("不满足后果"),
          legalReference: z.string().optional().describe("法律依据"),
          responseRequirements: z
            .object({
              requiredFormat: z.string().optional(),
              requiredContent: z.array(z.string()).optional(),
              minLength: z.number().optional(),
              attachments: z.array(z.string()).optional(),
            })
            .optional(),
          scoringInfo: z
            .object({ weight: z.number().optional(), scoringCriteria: z.string().optional() })
            .optional(),
          extractionConfidence: z.number().optional().describe("置信度 0-1"),
          extractionMetadata: z.any().optional(),
        })
      )
      .describe("提取项列表"),
    extractedBy: z.string().optional().describe("提取智能体来源"),
  }),
  outputSchema: z.object({
    storedItemIds: z.array(z.string().uuid()),
    totalStored: z.number(),
    success: z.boolean(),
    message: z.string().optional(),
  }),
  execute: async ({ projectId, documentId, items: itemsInput, extractedBy }) => {
    try {
      let items = itemsInput;
      if (typeof itemsInput === "string") {
        items = JSON.parse(itemsInput);
      }

      if (!Array.isArray(items) || items.length === 0) {
        return { storedItemIds: [], totalStored: 0, success: true, message: "无提取项" };
      }

      const storedIds: string[] = [];
      let validatedCount = 0;
      let rejectedCount = 0;

      for (const item of items) {
        // 验证 sourceBlockId：必须是真实存在的 block UUID
        const validBlockId = await validateBlockId(item.sourceBlockId);
        if (item.sourceBlockId && !validBlockId) {
          console.warn(`[ExtractionStorage] 无效 sourceBlockId: ${item.sourceBlockId}，已置为 null`);
          rejectedCount++;
        }
        if (validBlockId) validatedCount++;

        const [record] = await db
          .insert(extractionItems)
          .values({
            projectId,
            documentId,
            itemCategory: item.itemCategory || "review",
            bidSection: item.bidSection || null,
            sourceBlockId: validBlockId,
            itemType: item.itemType,
            itemNo: item.itemNo || null,
            title: item.title,
            description: item.description,
            location: (item.location || {
              pageNumber: 0,
              blockIndex: 0,
              bbox: { x0: 0, y0: 0, x1: 0, y1: 0 },
              textSnippet: "",
              highlightText: "",
            }) as any,
            requirements: item.requirements || {},
            consequence: item.consequence || null,
            legalReference: item.legalReference || null,
            responseRequirements: item.responseRequirements || {},
            scoringInfo: item.scoringInfo || {},
            extractionConfidence: item.extractionConfidence != null
              ? String(item.extractionConfidence)
              : null,
            extractedBy: extractedBy || "extraction-agent",
            extractionMetadata: item.extractionMetadata || {},
          })
          .returning();
        storedIds.push(record.id);
      }

      // 更新文档提取计数
      const currentDoc = await db.query.documents.findFirst({
        where: eq(documents.id, documentId),
        columns: { extractionItemsCount: true },
      });
      const currentCount = currentDoc?.extractionItemsCount ?? 0;
      await db
        .update(documents)
        .set({ extractionItemsCount: currentCount + storedIds.length, updatedAt: new Date() })
        .where(eq(documents.id, documentId));

      console.log(
        `[ExtractionStorage] 存储 ${storedIds.length} 项，${validatedCount} 个有效 blockId，${rejectedCount} 个被拒绝`
      );

      return {
        storedItemIds: storedIds,
        totalStored: storedIds.length,
        success: true,
        message: `成功存储 ${storedIds.length} 个提取项（${validatedCount} 个关联到原始区块）`,
      };
    } catch (error) {
      console.error("存储提取项失败:", error);
      return {
        storedItemIds: [],
        totalStored: 0,
        success: false,
        message: `存储失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});

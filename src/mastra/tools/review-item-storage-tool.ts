// 审查项存储工具 - 将提取的审查项存储到数据库
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { reviewItems, documents, documentBlocks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const reviewItemStorageTool = createTool({
  id: "review-item-storage",
  description: "将提取的审查项存储到数据库reviewItems表，并更新文档提取状态",
  inputSchema: z.object({
    projectId: z.string().uuid().describe("项目ID"),
    documentId: z.string().uuid().describe("文档ID"),
    reviewItems: z
      .array(
        z.object({
          sourceBlockId: z.string().uuid().optional().describe("来源区块ID"),
          itemType: z.string().describe("审查项类型（文本类型，支持任意值如：资质要求、技术要求、合规要求等）"),
          itemNo: z.string().optional().describe("条款编号（如：第三章第5条）"),
          title: z.string().describe("审查项标题"),
          description: z.string().describe("详细描述"),
          location: z
            .object({
              pageNumber: z.number().int().positive().describe("页码"),
              blockIndex: z.number().int().nonnegative().describe("区块索引"),
              bbox: z
                .object({
                  x0: z.number(),
                  y0: z.number(),
                  x1: z.number(),
                  y1: z.number(),
                })
                .optional()
                .describe("问题区域坐标"),
              textSnippet: z.string().optional().describe("文本片段"),
              highlightText: z.string().optional().describe("高亮文本"),
            })
            .describe("位置信息"),
          requirements: z
            .object({
              mandatory: z.boolean().optional().describe("是否强制性要求"),
              threshold: z.any().optional().describe("门槛值"),
              criteria: z.array(z.string()).optional().describe("具体标准列表"),
              proofRequired: z.array(z.string()).optional().describe("需提供的证明材料"),
            })
            .optional()
            .describe("审查要求详情"),
          consequence: z.string().optional().describe("不满足后果（废标/违规/违法/扣分等）"),
          legalReference: z.string().optional().describe("法律法规依据"),
          extractionConfidence: z.number().optional().describe("提取置信度（0-1）"),
          extractionMetadata: z.any().optional().describe("提取过程元数据"),
        })
      )
      .describe("审查项列表"),
    extractedBy: z.string().optional().describe("提取智能体来源"),
  }),
  outputSchema: z.object({
    storedItemIds: z.array(z.string().uuid()).describe("已存储的审查项ID列表"),
    totalStored: z.number().int().nonnegative().describe("已存储总数"),
    success: z.boolean().describe("存储是否成功"),
    message: z.string().optional().describe("存储结果消息"),
  }),
  execute: async ({ projectId, documentId, reviewItems: itemsInput, extractedBy }) => {
    try {
      const storedIds: string[] = [];

      // 处理可能的字符串输入（AI可能将JSON作为字符串传递）
      let items = itemsInput;
      if (typeof itemsInput === 'string') {
        try {
          items = JSON.parse(itemsInput);
        } catch (parseError) {
          console.error("解析reviewItems字符串失败:", parseError);
          return {
            storedItemIds: [],
            totalStored: 0,
            success: false,
            message: `解析审查项数据失败: ${parseError instanceof Error ? parseError.message : "JSON解析错误"}`,
          };
        }
      }

      // 确保items是数组
      if (!Array.isArray(items)) {
        return {
          storedItemIds: [],
          totalStored: 0,
          success: false,
          message: "审查项数据格式错误：期望数组",
        };
      }

      // 批量插入审查项
      for (const item of items) {
        // 处理sourceBlockId：如果不存在或无效，设为null
        let sourceBlockId = null;
        if (item.sourceBlockId) {
          // 验证是否为有效的UUID格式（可选）
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(item.sourceBlockId)) {
            // 验证block是否存在于documentBlocks表（可选，更严格的检查）
            // 如果block不存在，设为null避免外键错误
            try {
              const blockExists = await db.query.documentBlocks.findFirst({
                where: eq(documentBlocks.id, item.sourceBlockId),
              });
              if (blockExists) {
                sourceBlockId = item.sourceBlockId;
              } else {
                console.warn(`Block ID ${item.sourceBlockId} 不存在，设为null`);
              }
            } catch {
              console.warn(`验证block ID失败，设为null`);
            }
          } else {
            console.warn(`无效的UUID格式: ${item.sourceBlockId}，设为null`);
          }
        }

        const [stored] = await db
          .insert(reviewItems)
          .values({
            projectId,
            documentId,
            sourceBlockId, // 使用处理后的值（null或有效ID）
            itemType: item.itemType,
            itemNo: item.itemNo || null,
            title: item.title,
            description: item.description,
            location: {
              pageNumber: item.location.pageNumber,
              blockIndex: item.location.blockIndex,
              bbox: item.location.bbox,
              textSnippet: item.location.textSnippet,
              highlightText: item.location.highlightText,
            },
            requirements: item.requirements || {},
            consequence: item.consequence || null,
            legalReference: item.legalReference || null,
            extractionStatus: "completed",
            extractedBy: extractedBy || "extraction-agent",
            extractionConfidence: item.extractionConfidence ? String(item.extractionConfidence) : null,
            extractionMetadata: item.extractionMetadata || {},
          })
          .returning();

        storedIds.push(stored.id);
      }

      // 更新文档提取状态
      await db
        .update(documents)
        .set({
          extractionStatus: "completed",
          extractedAt: new Date(),
          reviewItemsCount: storedIds.length,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      return {
        storedItemIds: storedIds,
        totalStored: storedIds.length,
        success: true,
        message: `成功存储 ${storedIds.length} 个审查项`,
      };
    } catch (error) {
      console.error("审查项存储失败:", error);

      // 更新文档提取失败状态
      await db
        .update(documents)
        .set({
          extractionStatus: "failed",
          extractionError: error instanceof Error ? error.message : "存储失败",
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      return {
        storedItemIds: [],
        totalStored: 0,
        success: false,
        message: `审查项存储失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});
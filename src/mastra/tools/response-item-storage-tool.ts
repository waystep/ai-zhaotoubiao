// 响应项存储工具 - 将提取的响应项存储到数据库
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { responseItems, documents, documentBlocks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const responseItemStorageTool = createTool({
  id: "response-item-storage",
  description: "将提取的响应项存储到数据库responseItems表，并更新文档提取状态",
  inputSchema: z.object({
    projectId: z.string().uuid().describe("项目ID"),
    documentId: z.string().uuid().describe("文档ID（招标文件）"),
    responseItems: z
      .array(
        z.object({
          sourceBlockId: z.string().uuid().optional().describe("来源区块ID"),
          responseType: z.string().describe("响应项类型（文本类型，支持任意值如：技术方案、人员配置、设备清单等）"),
          itemNo: z.string().optional().describe("条款编号"),
          title: z.string().describe("响应项标题"),
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
                .describe("区域坐标"),
              textSnippet: z.string().optional().describe("文本片段"),
              highlightText: z.string().optional().describe("高亮文本"),
            })
            .describe("位置信息"),
          responseRequirements: z
            .object({
              requiredFormat: z.string().optional().describe("要求格式（文字说明/表格/图纸/证明材料）"),
              requiredContent: z.array(z.string()).optional().describe("要求内容列表"),
              minLength: z.number().optional().describe("最小字数要求"),
              attachments: z.array(z.string()).optional().describe("需要的附件列表"),
            })
            .optional()
            .describe("响应要求详情"),
          scoringInfo: z
            .object({
              weight: z.number().optional().describe("权重分值"),
              scoringCriteria: z.string().optional().describe("评分标准"),
            })
            .optional()
            .describe("评分信息"),
          extractionConfidence: z.number().optional().describe("提取置信度（0-1）"),
          extractionMetadata: z.any().optional().describe("提取过程元数据"),
        })
      )
      .describe("响应项列表"),
    extractedBy: z.string().optional().describe("提取智能体来源"),
  }),
  outputSchema: z.object({
    storedItemIds: z.array(z.string().uuid()).describe("已存储的响应项ID列表"),
    totalStored: z.number().int().nonnegative().describe("已存储总数"),
    success: z.boolean().describe("存储是否成功"),
    message: z.string().optional().describe("存储结果消息"),
  }),
  execute: async ({ projectId, documentId, responseItems: itemsInput, extractedBy }) => {
    try {
      const storedIds: string[] = [];

      // 处理可能的字符串输入（AI可能将JSON作为字符串传递）
      let items = itemsInput;
      if (typeof itemsInput === 'string') {
        try {
          items = JSON.parse(itemsInput);
        } catch (parseError) {
          console.error("解析responseItems字符串失败:", parseError);
          return {
            storedItemIds: [],
            totalStored: 0,
            success: false,
            message: `解析响应项数据失败: ${parseError instanceof Error ? parseError.message : "JSON解析错误"}`,
          };
        }
      }

      // 确保items是数组
      if (!Array.isArray(items)) {
        return {
          storedItemIds: [],
          totalStored: 0,
          success: false,
          message: "响应项数据格式错误：期望数组",
        };
      }

      // 批量插入响应项
      for (const item of items) {
        // 处理sourceBlockId：如果不存在或无效，设为null
        let sourceBlockId = null;
        if (item.sourceBlockId) {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(item.sourceBlockId)) {
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
          .insert(responseItems)
          .values({
            projectId,
            documentId,
            sourceBlockId, // 使用处理后的值（null或有效ID）
            responseType: item.responseType,
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
            responseRequirements: item.responseRequirements || {},
            scoringInfo: item.scoringInfo || {},
            extractionStatus: "completed",
            extractedBy: extractedBy || "extraction-agent",
            extractionConfidence: item.extractionConfidence ? String(item.extractionConfidence) : null,
            extractionMetadata: item.extractionMetadata || {},
          })
          .returning();

        storedIds.push(stored.id);
      }

      // 更新文档提取状态（累加响应项数量）
      const doc = await db.query.documents.findFirst({
        where: eq(documents.id, documentId),
      });

      const totalCount = (doc?.responseItemsCount || 0) + storedIds.length;

      await db
        .update(documents)
        .set({
          extractionStatus: "completed",
          extractedAt: new Date(),
          responseItemsCount: totalCount,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      return {
        storedItemIds: storedIds,
        totalStored: storedIds.length,
        success: true,
        message: `成功存储 ${storedIds.length} 个响应项，文档累计响应项总数：${totalCount}`,
      };
    } catch (error) {
      console.error("响应项存储失败:", error);

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
        message: `响应项存储失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
});
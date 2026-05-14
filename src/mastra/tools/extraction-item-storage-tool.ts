// 统一提取项存储工具 — 支持新增和覆盖
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { extractionItems, documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const extractionItemStorageTool = createTool({
  id: "extraction-item-storage",
  description:
    "存储或覆盖审查项。传入 id 则更新已有项，不传 id 则新增。每个审查项可关联多个原文 block。",
  inputSchema: z.object({
    projectId: z.string().uuid(),
    documentId: z.string().uuid(),
    items: z.array(
      z.object({
        id: z.string().uuid().optional().describe("已有审查项ID（传入则覆盖，不传则新增）"),
        section: z.enum(["技术标", "商务标"]).optional().describe("标段"),
        title: z.string().describe("审查项类型"),
        checkpoint: z.string().describe("审查判定标准"),
        consequence: z.number().min(0).max(1).optional().describe("权重（0-1）"),
        blocks: z.array(
          z.object({
            blockId: z.string(),
            pageNumber: z.number().int().positive(),
            blockIndex: z.number().int().nonnegative(),
          })
        ).describe("关联的原文区块"),
      })
    ),
    extractedBy: z.string().optional(),
  }),
  outputSchema: z.object({
    storedItemIds: z.array(z.string().uuid()),
    totalStored: z.number(),
    updatedIds: z.array(z.string().uuid()),
    newIds: z.array(z.string().uuid()),
    success: z.boolean(),
  }),
  execute: async ({ projectId, documentId, items: itemsInput, extractedBy }) => {
    try {
      let items = itemsInput;
      if (typeof itemsInput === "string") items = JSON.parse(itemsInput);
      if (!Array.isArray(items) || items.length === 0) {
        return { storedItemIds: [], totalStored: 0, updatedIds: [], newIds: [], success: true };
      }

      const newIds: string[] = [];
      const updatedIds: string[] = [];

      for (const item of items) {
        const data = {
          section: item.section || null,
          title: item.title,
          checkpoint: item.checkpoint,
          consequence: item.consequence != null ? String(item.consequence) : null,
          blocks: (item.blocks || []) as any,
          extractedBy: extractedBy || "extraction-agent",
          updatedAt: new Date(),
        };

        // 优先用传入的 id；无 id 时按 documentId+title 查已有项做 upsert
        let targetId = item.id as string | undefined;
        if (!targetId) {
          const existing = await db.query.extractionItems.findFirst({
            where: (fields, ops) => ops.and(
              ops.eq(fields.documentId, documentId),
              ops.eq(fields.title, item.title),
            ),
            columns: { id: true },
          });
          targetId = existing?.id;
        }

        if (targetId) {
          const [updated] = await db
            .update(extractionItems)
            .set(data)
            .where(eq(extractionItems.id, targetId))
            .returning();
          if (updated) updatedIds.push(updated.id);
        } else {
          const [record] = await db
            .insert(extractionItems)
            .values({ ...data, projectId, documentId })
            .returning();
          newIds.push(record.id);
        }
      }

      const allIds = [...updatedIds, ...newIds];
      const currentCount = await db.$count(extractionItems, eq(extractionItems.documentId, documentId));
      await db
        .update(documents)
        .set({ extractionItemsCount: currentCount, updatedAt: new Date() })
        .where(eq(documents.id, documentId));

      return {
        storedItemIds: allIds,
        totalStored: allIds.length,
        updatedIds,
        newIds,
        success: true,
      };
    } catch (error) {
      console.error("存储提取项失败:", error);
      return {
        storedItemIds: [], totalStored: 0, updatedIds: [], newIds: [],
        success: false,
      };
    }
  },
});

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";

const standardDocTypes = ["tender_doc", "legal_doc"] as const;

export const getStandardDocumentsParseStatusTool = createTool({
  id: "get-standard-documents-parse-status",
  description:
    "Get parse AND extraction status for standard documents (tender_doc and legal_doc). Used to decide whether extraction is needed before review. Never includes bid documents.",
  inputSchema: z.object({
    projectId: z.string().uuid().describe("Project ID"),
  }),
  outputSchema: z.object({
    projectId: z.string().uuid(),
    isReadyForReview: z
      .boolean()
      .describe("True when all standard documents have completed parsing"),
    isExtractionComplete: z
      .boolean()
      .describe("True when at least one standard document has extraction items (审查项) stored"),
    totalStandardDocuments: z.number().int().nonnegative(),
    totalExtractionItems: z.number().int().nonnegative().describe("Total extraction items across all standard docs"),
    parseStats: z.object({
      pending: z.number().int().nonnegative(),
      processing: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    }),
    documents: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        originalName: z.string(),
        docType: z.string(),
        parseStatus: z.enum(["pending", "processing", "completed", "failed"]),
        parseError: z.string().nullable(),
        parsedAt: z.string().nullable(),
        extractionItemsCount: z.number().int().nonnegative(),
      })
    ),
    summary: z.string(),
  }),
  execute: async ({ projectId }) => {
    try {
      const docs = await db.query.documents.findMany({
        where: and(
          eq(documents.projectId, projectId),
          inArray(documents.docType, [...standardDocTypes])
        ),
        orderBy: [documents.createdAt],
      });

      const parseStats = {
        pending: docs.filter((doc) => doc.parseStatus === "pending").length,
        processing: docs.filter((doc) => doc.parseStatus === "processing").length,
        completed: docs.filter((doc) => doc.parseStatus === "completed").length,
        failed: docs.filter((doc) => doc.parseStatus === "failed").length,
      };

      const isReadyForReview =
        docs.length > 0 &&
        docs.every((doc) => doc.parseStatus === "completed");

      // 检查提取状态：任一标准文档有提取项即视为已完成
      const totalExtractionItems = docs.reduce(
        (sum, doc) => sum + (doc.extractionItemsCount || 0),
        0
      );
      const isExtractionComplete = totalExtractionItems > 0;

      const summary =
        docs.length === 0
          ? "No standard documents found. Review cannot start until tender or legal documents are uploaded and parsed."
          : `Found ${docs.length} standard documents. Parse: ${parseStats.completed}/${docs.length} completed. Extraction: ${totalExtractionItems} items total. ${isExtractionComplete ? "Extraction is COMPLETE — do NOT call extraction-agent." : "Extraction needed — delegate to extraction-agent first."}`;

      return {
        projectId,
        isReadyForReview,
        isExtractionComplete,
        totalStandardDocuments: docs.length,
        totalExtractionItems,
        parseStats,
        documents: docs.map((doc) => ({
          id: doc.id,
          name: doc.name,
          originalName: doc.originalName,
          docType: doc.docType as any,
          parseStatus: (doc.parseStatus ?? "pending") as any,
          parseError: doc.parseError ?? null,
          parsedAt: doc.parsedAt ? doc.parsedAt.toISOString() : null,
          extractionItemsCount: doc.extractionItemsCount || 0,
        })),
        summary,
      } as any;
    } catch (error) {
      console.error("Failed to get standard document parse status:", error);
      return {
        projectId,
        isReadyForReview: false,
        isExtractionComplete: false,
        totalStandardDocuments: 0,
        totalExtractionItems: 0,
        parseStats: {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
        },
        documents: [],
        summary: `Failed to get standard document parse status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      } as any;
    }
  },
});

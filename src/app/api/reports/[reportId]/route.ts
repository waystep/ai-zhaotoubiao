import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { documents, reviewReports } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportId } = await context.params;

  try {
    // 验证报告存在且属于用户组织
    const report = await db.query.reviewReports.findFirst({
      where: eq(reviewReports.id, reportId),
      with: {
        project: {
          columns: {
            id: true,
            orgId: true,
          },
        },
      },
    });

    if (!report || report.project?.orgId !== session.user?.orgId) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    // 删除报告（级联删除会处理 issues、reviewItemResults、responseItemResults）
    await db.delete(reviewReports).where(eq(reviewReports.id, reportId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete review report:", error);
    return NextResponse.json({ error: "Failed to delete review report" }, { status: 500 });
  }
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportId } = await context.params;

  try {
    const report = await db.query.reviewReports.findFirst({
      where: eq(reviewReports.id, reportId),
      with: {
        document: {
          columns: {
            id: true,
            name: true,
            docType: true,
            parseStatus: true,
            mimeType: true,
          },
        },
        project: {
          columns: {
            id: true,
            name: true,
            projectNo: true,
            orgId: true,
          },
        },
        reviewer: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        issues: {
          columns: {
            id: true,
            blockId: true,
            checkpointId: true,
            category: true,
            severity: true,
            title: true,
            description: true,
            location: true,
            suggestion: true,
            isResolved: true,
            createdAt: true,
          },
        },
        reviewItemResults: {
          columns: {
            id: true,
            reportId: true,
            reviewItemId: true,
            status: true,
            reason: true,
            evidenceBlockIds: true,
            confidence: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
          with: {
            reviewItem: {
              columns: {
                id: true,
                section: true,
                title: true,
                checkpoint: true,
                consequence: true,
                location: true,
              },
            },
          },
        },
      },
    });

    if (!report || report.project?.orgId !== session.user?.orgId) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const reviewItemsSummary = {
      total: report.reviewItemResults.length,
      pass: report.reviewItemResults.filter((item) => item.status === "pass").length,
      fail: report.reviewItemResults.filter((item) => item.status === "fail").length,
      needsManualReview: report.reviewItemResults.filter((item) => item.status === "needs_manual_review").length,
    };

    const standardDocuments = await db.query.documents.findMany({
      where: and(
        eq(documents.projectId, report.project.id),
        inArray(documents.docType, ["tender_doc", "legal_doc"])
      ),
      columns: {
        id: true,
        name: true,
        docType: true,
        parseStatus: true,
        mimeType: true,
      },
      orderBy: [documents.createdAt],
    });

    return NextResponse.json({
      report: {
        ...report,
        standardDocuments,
        structuredSummary: {
          reviewItemsSummary,
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch review report:", error);
    const message = error instanceof Error ? error.message : String(error);
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      { error: "Failed to fetch review report", ...(isDev && { details: message }) },
      { status: 500 }
    );
  }
}

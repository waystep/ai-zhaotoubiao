import fs from "node:fs";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { reviewReports } from "@/lib/db/schema";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

type ReportForExport = NonNullable<Awaited<ReturnType<typeof fetchReportForExport>>>;

const statusLabels: Record<string, string> = {
  pending: "待审查",
  in_progress: "审查中",
  completed: "已完成",
  failed: "审查失败",
};

const recommendationLabels: Record<string, string> = {
  pass: "建议通过",
  fail: "建议不通过",
  revise: "建议补充/修订",
};

const resultStatusLabels: Record<string, string> = {
  pass: "通过",
  fail: "不满足",
  needs_manual_review: "待人工复核",
};

const severityLabels: Record<string, string> = {
  critical: "严重",
  major: "重要",
  minor: "轻微",
  suggestion: "建议",
};

const fontCandidates = [
  { path: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", family: "NotoSansCJKsc-Regular" },
  { path: "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc", family: "NotoSerifCJKsc-Regular" },
  { path: "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc" },
  { path: "/usr/share/fonts/truetype/arphic/ukai.ttc" },
  { path: "/System/Library/Fonts/STHeiti Medium.ttc" },
  { path: "/System/Library/Fonts/STHeiti Light.ttc" },
  { path: "/Library/Fonts/Arial Unicode.ttf" },
];

async function fetchReportForExport(reportId: string) {
  return db.query.reviewReports.findFirst({
    where: eq(reviewReports.id, reportId),
    with: {
      document: {
        columns: {
          name: true,
          docType: true,
        },
      },
      project: {
        columns: {
          name: true,
          projectNo: true,
          orgId: true,
        },
      },
      reviewer: {
        columns: {
          name: true,
          email: true,
        },
      },
      issues: {
        columns: {
          category: true,
          severity: true,
          title: true,
          description: true,
          location: true,
          suggestion: true,
          isResolved: true,
        },
      },
      reviewItemResults: {
        columns: {
          status: true,
          reason: true,
          evidenceBlockIds: true,
          confidence: true,
        },
        with: {
          reviewItem: {
            columns: {
              section: true,
              title: true,
              checkpoint: true,
            },
          },
        },
      },
    },
  });
}

function safeText(value: unknown, fallback = "-") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
}

function formatScore(value: unknown) {
  if (value === null || value === undefined) return "-";
  const score = Number(value);
  return Number.isFinite(score) ? `${score.toFixed(0)} 分` : safeText(value);
}

function formatConfidence(value: unknown) {
  if (value === null || value === undefined) return "-";
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return safeText(value);
  return confidence <= 1 ? `${Math.round(confidence * 100)}%` : `${Math.round(confidence)}%`;
}

function findChineseFont() {
  return fontCandidates.find((font) => fs.existsSync(font.path));
}

function buildFileName(projectName: string, documentName: string) {
  const cleanDocumentName = documentName.replace(/\.pdf$/i, "");
  const baseName = `审查报告-${projectName}-${cleanDocumentName}`
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .slice(0, 120);
  return `${baseName || "审查报告"}.pdf`;
}

function addHeader(doc: PDFKit.PDFDocument) {
  doc.fontSize(9).fillColor("#6b7280").text("智能投标审查报告", 50, 26, {
    width: doc.page.width - 100,
    align: "right",
  });
  doc.moveTo(50, 44).lineTo(doc.page.width - 50, 44).strokeColor("#e5e7eb").lineWidth(1).stroke();
  doc.fillColor("#111827");
}

function addFooter(doc: PDFKit.PDFDocument) {
  const pageText = `第 ${doc.bufferedPageRange().count} 页`;
  doc.fontSize(9).fillColor("#9ca3af").text(pageText, 50, doc.page.height - 36, {
    width: doc.page.width - 100,
    align: "center",
  });
  doc.fillColor("#111827");
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.height - 64) {
    addFooter(doc);
    doc.addPage();
    addHeader(doc);
    doc.y = 64;
  }
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 36);
  doc.x = 50;
  doc.moveDown(0.6);
  doc.fontSize(15).fillColor("#111827").text(title, 50, doc.y, {
    width: doc.page.width - 100,
    continued: false,
  });
  doc.moveTo(50, doc.y + 4).lineTo(doc.page.width - 50, doc.y + 4).strokeColor("#ddd6fe").lineWidth(1).stroke();
  doc.moveDown(0.7);
}

function paragraph(doc: PDFKit.PDFDocument, text: string, options?: PDFKit.Mixins.TextOptions) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const blocks = normalized.split(/\n\n+/);
  blocks.forEach((block) => {
    ensureSpace(doc, 42);
    doc.x = 50;
    doc.fontSize(10.5).fillColor("#374151").text(block.replace(/\n/g, "\n"), 50, doc.y, {
      width: doc.page.width - 100,
      lineGap: 5,
      ...options,
    });
    doc.moveDown(0.55);
  });
}

function keyValue(doc: PDFKit.PDFDocument, label: string, value: string) {
  ensureSpace(doc, 24);
  const x = 50;
  const y = doc.y;
  doc.fontSize(10).fillColor("#6b7280").text(label, x, y, { width: 82, continued: false });
  doc.fontSize(10).fillColor("#111827").text(value, x + 92, y, { width: doc.page.width - 192 });
  doc.x = 50;
  doc.moveDown(0.45);
}

function statBox(doc: PDFKit.PDFDocument, label: string, value: string, index: number) {
  const boxWidth = 118;
  const gap = 12;
  const x = 50 + index * (boxWidth + gap);
  const y = doc.y;
  doc.roundedRect(x, y, boxWidth, 54, 6).fillAndStroke("#f9fafb", "#e5e7eb");
  doc.fontSize(9).fillColor("#6b7280").text(label, x + 12, y + 10, { width: boxWidth - 24 });
  doc.fontSize(16).fillColor("#111827").text(value, x + 12, y + 28, { width: boxWidth - 24 });
}

function bullet(doc: PDFKit.PDFDocument, lines: Array<[string, string]>) {
  lines.forEach(([label, value]) => {
    ensureSpace(doc, 28);
    const y = doc.y;
    doc.fontSize(10).fillColor("#6b7280").text(`- ${label}:`, 50, y, {
      width: 82,
      continued: false,
    });
    doc.fillColor("#111827").text(value, 142, y, {
      width: doc.page.width - 192,
      lineGap: 4,
    });
    doc.x = 50;
    doc.moveDown(0.3);
  });
}

function buildPdf(report: ReportForExport) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    bufferPages: true,
    info: {
      Title: `审查报告-${report.project.name}`,
      Author: "智能投标审查智能体",
      Subject: report.document.name,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const fontPath = findChineseFont();
  if (fontPath) {
    doc.registerFont("ReportFont", fontPath.path, fontPath.family);
    doc.font("ReportFont");
  }

  addHeader(doc);
  doc.y = 72;
  doc.fontSize(24).fillColor("#111827").text("智能投标审查报告", { align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor("#6b7280").text(report.document.name, { align: "center" });
  doc.moveDown(1.2);

  sectionTitle(doc, "基本信息");
  keyValue(doc, "项目名称", safeText(report.project.name));
  keyValue(doc, "项目编号", safeText(report.project.projectNo));
  keyValue(doc, "审查文档", safeText(report.document.name));
  keyValue(doc, "报告状态", statusLabels[safeText(report.status, "")] || safeText(report.status));
  keyValue(doc, "AI 评分", formatScore(report.aiScore));
  keyValue(doc, "审查建议", recommendationLabels[safeText(report.recommendation, "")] || safeText(report.recommendation));
  keyValue(doc, "审查人", safeText(report.reviewer?.name || report.reviewer?.email));
  keyValue(doc, "完成时间", formatDate(report.completedAt));

  const resultSummary = {
    total: report.reviewItemResults.length,
    pass: report.reviewItemResults.filter((item) => item.status === "pass").length,
    fail: report.reviewItemResults.filter((item) => item.status === "fail").length,
    needsManualReview: report.reviewItemResults.filter((item) => item.status === "needs_manual_review").length,
  };

  sectionTitle(doc, "结果统计");
  ensureSpace(doc, 70);
  statBox(doc, "审查项", String(resultSummary.total), 0);
  statBox(doc, "通过", String(resultSummary.pass), 1);
  statBox(doc, "不满足", String(resultSummary.fail), 2);
  statBox(doc, "待复核", String(resultSummary.needsManualReview), 3);
  doc.x = 50;
  doc.y += 68;

  sectionTitle(doc, "审查摘要");
  paragraph(doc, safeText(report.summary, "暂无审查摘要。"));

  sectionTitle(doc, "审查项结果");
  if (report.reviewItemResults.length === 0) {
    paragraph(doc, "暂无结构化审查项结果。");
  } else {
    report.reviewItemResults.forEach((result, index) => {
      const evidenceIds = Array.isArray(result.evidenceBlockIds) ? result.evidenceBlockIds : [];
      ensureSpace(doc, 96);
      doc.fontSize(12).fillColor("#111827").text(`${index + 1}. ${safeText(result.reviewItem.title)}`);
      doc.moveDown(0.35);
      bullet(
        doc,
        [
          ["所属部分", safeText(result.reviewItem.section)],
          ["状态", resultStatusLabels[result.status] || result.status],
          ["置信度", formatConfidence(result.confidence)],
          ["检查点", safeText(result.reviewItem.checkpoint)],
          ["审查理由", safeText(result.reason)],
          ["证据区块", evidenceIds.length > 0 ? evidenceIds.join(", ") : "-"],
        ],
      );
      doc.moveDown(0.55);
    });
  }

  sectionTitle(doc, "问题清单");
  if (report.issues.length === 0) {
    paragraph(doc, "暂无明确问题。");
  } else {
    report.issues.forEach((issue, index) => {
      const location = issue.location as { pageNumber?: number; blockIndex?: number; textSnippet?: string } | null;
      ensureSpace(doc, 112);
      doc.fontSize(12).fillColor("#111827").text(`${index + 1}. ${safeText(issue.title)}`);
      doc.moveDown(0.35);
      bullet(
        doc,
        [
          ["类别", safeText(issue.category)],
          ["严重程度", severityLabels[issue.severity] || issue.severity],
          ["状态", issue.isResolved ? "已处理" : "未处理"],
          ["位置", `第 ${location?.pageNumber ?? "-"} 页，区块 ${location?.blockIndex ?? "-"}`],
          ["描述", safeText(issue.description)],
          ["建议", safeText(issue.suggestion)],
          ["文本片段", safeText(location?.textSnippet)],
        ],
      );
      doc.moveDown(0.55);
    });
  }

  ensureSpace(doc, 50);
  doc.moveDown(0.5);
  doc.roundedRect(50, doc.y, doc.page.width - 100, 44, 6).fillAndStroke("#f5f3ff", "#ddd6fe");
  doc.fillColor("#5b21b6").fontSize(9.5).text(
    "本报告由智能投标审查智能体生成，建议结合原始招投标文件进行人工复核。",
    62,
    doc.y + 13,
    { width: doc.page.width - 124 }
  );

  addFooter(doc);

  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportId } = await context.params;

  try {
    const report = await fetchReportForExport(reportId);

    if (!report || report.project?.orgId !== session.user?.orgId) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const fileName = buildFileName(report.project.name, report.document.name);
    const pdf = await buildPdf(report);
    const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to export review report:", error);
    return NextResponse.json({ error: "Failed to export review report" }, { status: 500 });
  }
}

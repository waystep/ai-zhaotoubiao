/**
 * 插入一份可用于前端交互测试的 mock 审查报告数据：
 * - 绑定到同一组织下的项目与 PDF 文档（优先选择 storagePath 在磁盘上真实存在的 PDF）
 * - 写入 document_parsed_results + document_blocks（供定位/预览联动）
 * - 写入 review_reports + review_issues + review_item_results/response_item_results
 *
 * 使用：
 *   npm run db:mock-report
 *
 * 环境变量：
 *   DATABASE_URL（优先）；未设置时使用 drizzle.config.ts 的默认
 *   MOCK_PROJECT_ID（可选）：指定要把 mock 挂到哪个 tender_projects.id 下（例如浏览器里的项目 UUID）
 */
import "dotenv/config";
import postgres from "postgres";
import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/smart_tender_review";

type IdRow = { id: string };

function json(v: unknown) {
  return JSON.stringify(v);
}

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  try {
    // 1) 选取一个“可登录用户所在组织”
    const membership = await sql<{
      userId: string;
      orgId: string;
    }[]>`
      SELECT user_id as "userId", org_id as "orgId"
      FROM organization_members
      ORDER BY joined_at DESC NULLS LAST
      LIMIT 1
    `;
    if (membership.length === 0) {
      throw new Error("未找到 organization_members 记录：请先注册/登录并创建组织。");
    }
    const { userId, orgId } = membership[0];

    // 2) 选取或创建项目
    const project = await sql<IdRow[]>`
      SELECT id
      FROM tender_projects
      WHERE org_id = ${orgId}
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1
    `;
    let projectId = project[0]?.id;
    if (!projectId) {
      const created = await sql<IdRow[]>`
        INSERT INTO tender_projects (org_id, created_by, name, project_no)
        VALUES (${orgId}, ${userId}, 'Mock 项目（交互测试）', 'MOCK-001')
        RETURNING id
      `;
      projectId = created[0]!.id;
    }

    // 3) 确保本地有一个可用的 mock PDF（用于预览交互）
    const uploadDir = path.join(process.cwd(), "uploads");
    const mockPdfPath = path.join(uploadDir, "mock-preview.pdf");
    if (!existsSync(mockPdfPath)) {
      await mkdir(uploadDir, { recursive: true });
      // 一个极简 PDF（纯文本内容即可被 PDF.js 打开）
      const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 140 >>
stream
BT
/F1 18 Tf
72 720 Td
(Mock PDF \\(for preview + issue interaction\\)) Tj
0 -28 Td
(You can delete and re-seed anytime.) Tj
0 -28 Td
(Report issues are linked to mock blocks on page 1.) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000116 00000 n 
0000000241 00000 n 
0000000311 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
520
%%EOF
`;
      await writeFile(mockPdfPath, pdf, "utf8");
    }

    // 4) 选取一个可用的 PDF 文档（优先文件存在）；没有就创建一条指向 mockPdfPath 的 documents 记录
    const docs = await sql<
      {
        id: string;
        storagePath: string;
        mimeType: string | null;
        name: string;
        originalName: string;
      }[]
    >`
      SELECT id, storage_path as "storagePath", mime_type as "mimeType", name, original_name as "originalName"
      FROM documents
      WHERE project_id = ${projectId}
        AND (mime_type = 'application/pdf' OR mime_type LIKE 'application/%pdf%')
      ORDER BY created_at DESC NULLS LAST
      LIMIT 20
    `;

    const picked = docs.find((d) => d.storagePath && existsSync(d.storagePath));
    let documentId = picked?.id;
    if (!documentId) {
      const s = await stat(mockPdfPath);
      const inserted = await sql<IdRow[]>`
        INSERT INTO documents (
          project_id,
          uploaded_by,
          doc_type,
          name,
          original_name,
          file_size,
          mime_type,
          storage_path,
          parse_status
        )
        VALUES (
          ${projectId},
          ${userId},
          'tender_doc',
          'Mock PDF（预览交互）',
          'mock-preview.pdf',
          ${s.size},
          'application/pdf',
          ${mockPdfPath},
          'completed'
        )
        RETURNING id
      `;
      documentId = inserted[0]!.id;
    }

    // 5) 确保有 parsedResult + blocks
    let parsedResultId: string | undefined;
    const parsed = await sql<IdRow[]>`
      SELECT id
      FROM document_parsed_results
      WHERE document_id = ${documentId}
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1
    `;
    parsedResultId = parsed[0]?.id;
    if (!parsedResultId) {
      const inserted = await sql<IdRow[]>`
        INSERT INTO document_parsed_results (document_id, total_pages, full_text, structured_content, mineru_raw_data)
        VALUES (${documentId}, 1, ${"Mock 解析全文（用于交互测试）"}, ${json({})}::jsonb, ${json({})}::jsonb)
        RETURNING id
      `;
      parsedResultId = inserted[0]!.id;
    }

    // 如果没有 blocks，则插入一批 mock blocks（包含可定位的文本片段）
    const blocksCount = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text as count
      FROM document_blocks
      WHERE parsed_result_id = ${parsedResultId}
    `;
    const hasBlocks = Number.parseInt(blocksCount[0]?.count ?? "0", 10) > 0;

    let blockIds: string[] = [];
    if (!hasBlocks) {
      const bbox = { x0: 80, y0: 120, x1: 520, y1: 160 };
      const toInsert = [
        {
          pageNumber: 1,
          blockIndex: 0,
          blockType: "title",
          content: "第一章 招标公告（Mock）",
          bbox,
          imagePath: null,
        },
        {
          pageNumber: 1,
          blockIndex: 1,
          blockType: "text",
          content:
            "投标人须具备建筑工程施工总承包二级及以上资质，并提供有效期内的资质证书复印件。",
          bbox: { x0: 80, y0: 180, x1: 520, y1: 260 },
          imagePath: null,
        },
        {
          pageNumber: 1,
          blockIndex: 2,
          blockType: "text",
          content:
            "项目经理应具有一级建造师注册证书（建筑工程专业），并提供近三个月社保缴纳证明。",
          bbox: { x0: 80, y0: 270, x1: 520, y1: 340 },
          imagePath: null,
        },
        {
          pageNumber: 1,
          blockIndex: 3,
          blockType: "text",
          content:
            "本项目不接受联合体投标。如以联合体形式投标，将被否决投标。",
          bbox: { x0: 80, y0: 350, x1: 520, y1: 410 },
          imagePath: null,
        },
      ];

      blockIds = [];
      for (const b of toInsert) {
        const [row] = await sql<{ id: string }[]>`
          INSERT INTO document_blocks (
            parsed_result_id,
            page_number,
            block_index,
            block_type,
            content,
            bbox,
            image_path
          )
          VALUES (
            ${parsedResultId},
            ${b.pageNumber},
            ${b.blockIndex},
            ${b.blockType},
            ${b.content},
            ${json(b.bbox)}::jsonb,
            ${b.imagePath}
          )
          RETURNING id
        `;
        blockIds.push(row!.id);
      }
    } else {
      const existing = await sql<{ id: string }[]>`
        SELECT id
        FROM document_blocks
        WHERE parsed_result_id = ${parsedResultId}
        ORDER BY page_number ASC, block_index ASC
        LIMIT 20
      `;
      blockIds = existing.map((r) => r.id);
    }

    // 6) 创建 mock 报告
    const createdReport = await sql<{ id: string }[]>`
      INSERT INTO review_reports (
        project_id,
        document_id,
        reviewed_by,
        status,
        ai_score,
        recommendation,
        summary,
        completed_at
      )
      VALUES (
        ${projectId},
        ${documentId},
        ${userId},
        'completed',
        86.5,
        'revise',
        ${"Mock 审查摘要：发现若干合规性问题，建议补充材料并修正投标响应。"},
        now()
      )
      RETURNING id
    `;
    const reportId = createdReport[0]!.id;

    // 7) 写入一些 issues（关联 blockId + location）
    const issuePayloads = [
      {
        reportId,
        blockId: blockIds[1] ?? null,
        checkpointId: "MOCK-QUAL-001",
        agentSource: "mock-seed",
        category: "资质要求",
        severity: "major",
        title: "资质证明材料缺失风险",
        description:
          "投标响应未见明确提供‘施工总承包二级及以上资质证书’有效复印件，存在不满足资质门槛的风险。",
        location: {
          pageNumber: 1,
          blockIndex: 1,
          bbox: { x0: 80, y0: 180, x1: 520, y1: 260 },
          textSnippet: "施工总承包二级及以上资质",
          highlightText: "二级及以上资质证书",
        },
        suggestion: "补充上传资质证书（在有效期内），并在响应文件目录中标注页码。",
      },
      {
        reportId,
        blockId: blockIds[2] ?? null,
        checkpointId: "MOCK-PM-001",
        agentSource: "mock-seed",
        category: "项目经理",
        severity: "minor",
        title: "项目经理社保材料不一致风险",
        description:
          "项目经理社保材料周期可能不足或未覆盖关键月份，建议核对并补齐连续三个月证明。",
        location: {
          pageNumber: 1,
          blockIndex: 2,
          bbox: { x0: 80, y0: 270, x1: 520, y1: 340 },
          textSnippet: "近三个月社保缴纳证明",
          highlightText: "三个月社保",
        },
        suggestion: "补齐最近三个月社保缴纳证明，并确保与人员名单一致。",
      },
    ];

    for (const issue of issuePayloads) {
      await sql`
        INSERT INTO review_issues (
          report_id,
          block_id,
          checkpoint_id,
          agent_source,
          category,
          severity,
          title,
          description,
          location,
          suggestion
        )
        VALUES (
          ${issue.reportId},
          ${issue.blockId},
          ${issue.checkpointId},
          ${issue.agentSource},
          ${issue.category},
          ${issue.severity},
          ${issue.title},
          ${issue.description},
          ${json(issue.location)}::jsonb,
          ${issue.suggestion}
        )
      `;
    }

    // 8) 生成少量 review_items / response_items，并写入对应 results（便于列表页渲染）
    const [reviewItem] = await sql<IdRow[]>`
      INSERT INTO review_items (project_id, document_id, item_type, title, description, location)
      VALUES (
        ${projectId},
        ${documentId},
        '资质要求',
        '施工总承包资质等级',
        '投标人须具备建筑工程施工总承包二级及以上资质，并提供证明材料。',
        ${json({
          pageNumber: 1,
          blockIndex: 1,
          bbox: { x0: 80, y0: 180, x1: 520, y1: 260 },
          textSnippet: "施工总承包二级及以上资质",
          highlightText: "二级及以上资质证书",
        })}::jsonb
      )
      RETURNING id
    `;

    const [responseItem] = await sql<IdRow[]>`
      INSERT INTO response_items (project_id, document_id, response_type, title, description, location)
      VALUES (
        ${projectId},
        ${documentId},
        '人员配置',
        '项目经理资质与社保',
        '项目经理需提供一级建造师注册证书及近三个月社保缴纳证明。',
        ${json({
          pageNumber: 1,
          blockIndex: 2,
          bbox: { x0: 80, y0: 270, x1: 520, y1: 340 },
          textSnippet: "一级建造师注册证书",
          highlightText: "三个月社保",
        })}::jsonb
      )
      RETURNING id
    `;

    await sql`
      INSERT INTO review_item_results (report_id, review_item_id, status, reason, evidence_block_ids, confidence, metadata)
      VALUES (
        ${reportId},
        ${reviewItem.id},
        'fail',
        ${"未明确提供有效资质证书材料，存在不满足要求风险。"},
        ${json(blockIds.slice(0, 2))}::jsonb,
        0.78,
        ${json({ seed: true, kind: "mock" })}::jsonb
      )
    `;

    await sql`
      INSERT INTO response_item_results (report_id, response_item_id, status, reason, evidence_block_ids, confidence, metadata)
      VALUES (
        ${reportId},
        ${responseItem.id},
        'partially_answered',
        ${"响应中提及项目经理资格，但社保材料未见完整连续三个月证明。"},
        ${json(blockIds.slice(1, 3))}::jsonb,
        0.66,
        ${json({ seed: true, kind: "mock" })}::jsonb
      )
    `;

    // 确保 documents.parse_status 为 completed，避免前端把它当成未解析
    await sql`
      UPDATE documents
      SET parse_status = 'completed', updated_at = now()
      WHERE id = ${documentId}
    `;

    console.log("\n已插入 mock 审查报告数据：");
    console.log(`- reportId: ${reportId}`);
    console.log(`- projectId: ${projectId}`);
    console.log(`- documentId: ${documentId}`);
    console.log(`- 打开报告详情: http://localhost:3000/reports/${reportId}`);
    console.log(`- 文档文件接口: http://localhost:3000/api/documents/${documentId}/file`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


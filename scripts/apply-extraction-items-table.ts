/**
 * 为旧库创建 extraction_items 表（与 src/lib/db/schema.ts 中 extractionItems 一致）。
 * 可重复执行：表已存在则跳过。
 *
 * 使用：npx tsx scripts/apply-extraction-items-table.ts
 * 或：npm run db:patch-extraction-items
 */
import "dotenv/config";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/smart_tender_review";

const DEFAULT_LOCATION = `{"pageNumber":0,"blockIndex":0,"bbox":{"x0":0,"y0":0,"x1":0,"y1":0},"textSnippet":"","highlightText":""}`;

const STATEMENTS = [
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'extraction_items'
    ) THEN
      CREATE TABLE extraction_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid NOT NULL REFERENCES tender_projects(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        source_block_id uuid REFERENCES document_blocks(id) ON DELETE SET NULL,
        section varchar(20),
        title varchar(200) NOT NULL,
        checkpoint text NOT NULL,
        consequence numeric(5, 2),
        location jsonb NOT NULL DEFAULT '${DEFAULT_LOCATION}'::jsonb,
        extracted_by varchar(100),
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS extraction_items_document_id_idx ON extraction_items(document_id);
      CREATE INDEX IF NOT EXISTS extraction_items_project_id_idx ON extraction_items(project_id);
    END IF;
  END $$;`,
];

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  try {
    for (const stmt of STATEMENTS) {
      await sql.unsafe(stmt);
    }
    console.log("extraction_items 表已就绪（若已存在则未改动）。");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 为旧库补齐 document_blocks 表与 schema.ts 一致的列（image_path、parent_block_id）。
 * 可重复执行：已存在则跳过。
 *
 * 使用：npx tsx scripts/apply-document-blocks-columns.ts
 */
import "dotenv/config";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/smart_tender_review";

const STATEMENTS = [
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'document_blocks' AND column_name = 'image_path'
    ) THEN
      ALTER TABLE document_blocks ADD COLUMN image_path varchar(255);
    END IF;
  END $$;`,

  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'document_blocks' AND column_name = 'parent_block_id'
    ) THEN
      ALTER TABLE document_blocks ADD COLUMN parent_block_id uuid;
    END IF;
  END $$;`,
];

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  try {
    for (const stmt of STATEMENTS) {
      await sql.unsafe(stmt);
    }
    console.log("document_blocks 表 image_path / parent_block_id 已就绪（若已存在则未改动）。");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

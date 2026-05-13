/**
 * 为旧库补齐 review_issues 表与 schema.ts 一致的列（checkpoint_id、agent_source）。
 * 可重复执行：已存在则跳过。
 *
 * 使用：npx tsx scripts/apply-review-issues-columns.ts
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
      WHERE table_schema = 'public' AND table_name = 'review_issues' AND column_name = 'checkpoint_id'
    ) THEN
      ALTER TABLE review_issues ADD COLUMN checkpoint_id varchar(100);
    END IF;
  END $$;`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'review_issues' AND column_name = 'agent_source'
    ) THEN
      ALTER TABLE review_issues ADD COLUMN agent_source varchar(100);
    END IF;
  END $$;`,
];

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  try {
    for (const stmt of STATEMENTS) {
      await sql.unsafe(stmt);
    }
    console.log("review_issues 表 checkpoint_id / agent_source 已就绪（若已存在则未改动）。");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


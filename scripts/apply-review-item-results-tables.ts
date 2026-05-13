/**
 * 为旧库补齐 review_item_results / response_item_results 两张表及其枚举类型。
 * 可重复执行：已存在则跳过。
 *
 * 使用：npx tsx scripts/apply-review-item-results-tables.ts
 */
import "dotenv/config";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/smart_tender_review";

const STATEMENTS = [
  // 枚举类型（与 src/lib/db/schema.ts 一致）
  `DO $do$
  BEGIN
    CREATE TYPE review_item_result_status AS ENUM ('pass', 'fail', 'needs_manual_review');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $do$;`,
  `DO $do$
  BEGIN
    CREATE TYPE response_item_result_status AS ENUM ('answered', 'partially_answered', 'unanswered', 'not_applicable');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $do$;`,

  // review_item_results
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'review_item_results'
    ) THEN
      CREATE TABLE review_item_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id uuid NOT NULL REFERENCES review_reports(id) ON DELETE CASCADE,
        review_item_id uuid NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
        status review_item_result_status NOT NULL,
        reason text NOT NULL,
        evidence_block_ids jsonb DEFAULT '[]'::jsonb,
        confidence numeric(5, 2),
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
    END IF;
  END $$;`,

  // response_item_results
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'response_item_results'
    ) THEN
      CREATE TABLE response_item_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id uuid NOT NULL REFERENCES review_reports(id) ON DELETE CASCADE,
        response_item_id uuid NOT NULL REFERENCES response_items(id) ON DELETE CASCADE,
        status response_item_result_status NOT NULL,
        reason text NOT NULL,
        evidence_block_ids jsonb DEFAULT '[]'::jsonb,
        confidence numeric(5, 2),
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
    END IF;
  END $$;`,
];

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  try {
    for (const stmt of STATEMENTS) {
      await sql.unsafe(stmt);
    }
    console.log("review_item_results / response_item_results 已就绪（若已存在则未改动）。");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


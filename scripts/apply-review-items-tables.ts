/**
 * 为旧库补齐 review_items / response_items 两张表（以及依赖的 extraction_status 枚举）。
 * 可重复执行：已存在则跳过。
 *
 * 使用：npx tsx scripts/apply-review-items-tables.ts
 */
import "dotenv/config";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/smart_tender_review";

const STATEMENTS = [
  // 与 src/lib/db/schema.ts 中 extractionStatusEnum 一致
  `DO $do$
  BEGIN
    CREATE TYPE extraction_status AS ENUM ('pending', 'processing', 'completed', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $do$;`,

  // review_items
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'review_items'
    ) THEN
      CREATE TABLE review_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid NOT NULL REFERENCES tender_projects(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        source_block_id uuid REFERENCES document_blocks(id) ON DELETE SET NULL,
        item_type varchar(100) NOT NULL,
        item_no varchar(100),
        title varchar(500) NOT NULL,
        description text NOT NULL,
        location jsonb NOT NULL DEFAULT '{"pageNumber":0,"blockIndex":0,"bbox":{"x0":0,"y0":0,"x1":0,"y1":0},"textSnippet":"","highlightText":""}'::jsonb,
        requirements jsonb DEFAULT '{"mandatory":true,"threshold":null,"criteria":[],"proofRequired":[]}'::jsonb,
        consequence varchar(100),
        legal_reference text,
        extraction_status extraction_status DEFAULT 'completed',
        extracted_by varchar(100),
        extraction_confidence numeric(5, 2),
        extraction_metadata jsonb DEFAULT '{}'::jsonb,
        is_verified boolean DEFAULT false,
        verified_by uuid REFERENCES users(id),
        verified_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
    END IF;
  END $$;`,

  // response_items
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'response_items'
    ) THEN
      CREATE TABLE response_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid NOT NULL REFERENCES tender_projects(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        source_block_id uuid REFERENCES document_blocks(id) ON DELETE SET NULL,
        response_type varchar(100) NOT NULL,
        item_no varchar(100),
        title varchar(500) NOT NULL,
        description text NOT NULL,
        location jsonb NOT NULL DEFAULT '{"pageNumber":0,"blockIndex":0,"bbox":{"x0":0,"y0":0,"x1":0,"y1":0},"textSnippet":"","highlightText":""}'::jsonb,
        response_requirements jsonb DEFAULT '{"requiredFormat":null,"requiredContent":[],"minLength":null,"attachments":[]}'::jsonb,
        scoring_info jsonb DEFAULT '{"weight":null,"scoringCriteria":null}'::jsonb,
        extraction_status extraction_status DEFAULT 'completed',
        extracted_by varchar(100),
        extraction_confidence numeric(5, 2),
        extraction_metadata jsonb DEFAULT '{}'::jsonb,
        is_verified boolean DEFAULT false,
        verified_by uuid REFERENCES users(id),
        verified_at timestamp,
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
    console.log("review_items / response_items 已就绪（若已存在则未改动）。");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


/**
 * 创建 image_risk_status 枚举与 image_risk_analysis 表（与 schema.ts 对齐）。
 * 可重复执行：枚举已存在 / 表已存在则跳过。
 *
 * 使用：npx tsx scripts/apply-image-risk-analysis-table.ts
 */
import "dotenv/config";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/smart_tender_review";

const STATEMENTS = [
  `DO $do$
  BEGIN
    CREATE TYPE image_risk_status AS ENUM ('pending', 'processing', 'completed', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $do$;`,

  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'image_risk_analysis'
    ) THEN
      CREATE TABLE image_risk_analysis (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        block_id uuid REFERENCES document_blocks(id) ON DELETE SET NULL,
        image_path varchar(255) NOT NULL,
        page_number integer NOT NULL,
        status image_risk_status DEFAULT 'pending',
        error text,
        has_risk boolean,
        risk_type varchar(100),
        risk_text varchar(255),
        confidence numeric(5, 2),
        reason text,
        suggestion text,
        raw_response jsonb DEFAULT '{}'::jsonb,
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
    console.log("image_risk_analysis 表与 image_risk_status 枚举已就绪（若已存在则未改动）。");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 为旧库补齐 documents 表与代码一致的「提取」相关列（含 extraction_status 枚举）。
 * 可重复执行：已存在则跳过。
 *
 * 使用：npx tsx scripts/apply-documents-extraction-columns.ts
 * 环境变量 DATABASE_URL；未设置时与 drizzle.config 默认一致。
 */
import "dotenv/config";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/smart_tender_review";

const STATEMENTS = [
  // 枚举类型（与 src/lib/db/schema.ts 中 extractionStatusEnum 一致）
  `DO $do$
  BEGIN
    CREATE TYPE extraction_status AS ENUM ('pending', 'processing', 'completed', 'failed');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $do$;`,

  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'extraction_status'
    ) THEN
      ALTER TABLE documents
        ADD COLUMN extraction_status extraction_status DEFAULT 'pending';
    END IF;
  END $$;`,

  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'extraction_error'
    ) THEN
      ALTER TABLE documents ADD COLUMN extraction_error text;
    END IF;
  END $$;`,

  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'extracted_at'
    ) THEN
      ALTER TABLE documents ADD COLUMN extracted_at timestamp;
    END IF;
  END $$;`,

  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'extraction_task_id'
    ) THEN
      ALTER TABLE documents ADD COLUMN extraction_task_id varchar(100);
    END IF;
  END $$;`,

  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'extraction_progress'
    ) THEN
      ALTER TABLE documents ADD COLUMN extraction_progress integer DEFAULT 0;
    END IF;
  END $$;`,

  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'review_items_count'
    ) THEN
      ALTER TABLE documents ADD COLUMN review_items_count integer DEFAULT 0;
    END IF;
  END $$;`,

  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'response_items_count'
    ) THEN
      ALTER TABLE documents ADD COLUMN response_items_count integer DEFAULT 0;
    END IF;
  END $$;`,

  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'auto_extract'
    ) THEN
      ALTER TABLE documents ADD COLUMN auto_extract boolean DEFAULT false;
    END IF;
  END $$;`,
];

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  try {
    for (const stmt of STATEMENTS) {
      await sql.unsafe(stmt);
    }
    console.log(
      "documents 表 extraction / 计数 / auto_extract 相关列已就绪（若原本已有则未改动）。"
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// 执行数据库迁移脚本
import "dotenv/config";
import { db } from "../src/lib/db/client";
import { sql } from "drizzle-orm";

async function runMigration() {
  console.log("开始执行迁移...");

  try {
    // 1. 检查并创建 enum 类型
    const enumCheck = await db.execute(sql`
      SELECT 1 FROM pg_type WHERE typname = 'image_risk_status'
    `);
    if (enumCheck.length === 0) {
      await db.execute(sql`
        CREATE TYPE "public"."image_risk_status" AS ENUM('pending', 'processing', 'completed', 'failed')
      `);
      console.log("✓ 创建 image_risk_status enum");
    } else {
      console.log("✓ image_risk_status enum 已存在");
    }

    // 2. 创建表
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "image_risk_analysis" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "document_id" uuid NOT NULL,
        "block_id" uuid,
        "image_path" varchar(255) NOT NULL,
        "page_number" integer NOT NULL,
        "status" "image_risk_status" DEFAULT 'pending',
        "error" text,
        "has_risk" boolean,
        "risk_type" varchar(100),
        "risk_text" varchar(255),
        "confidence" numeric(5, 2),
        "reason" text,
        "suggestion" text,
        "raw_response" jsonb DEFAULT '{}'::jsonb,
        "is_verified" boolean DEFAULT false,
        "verified_by" uuid,
        "verified_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);
    console.log("✓ 创建 image_risk_analysis 表");

    // 3. 检查并添加 column
    const colCheck = await db.execute(sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name='document_blocks' AND column_name='image_path'
    `);
    if (colCheck.length === 0) {
      await db.execute(sql`
        ALTER TABLE "document_blocks" ADD COLUMN "image_path" varchar(255)
      `);
      console.log("✓ document_blocks 添加 image_path 字段");
    } else {
      console.log("✓ document_blocks.image_path 已存在");
    }

    // 4. 添加外键约束
    const fk1Check = await db.execute(sql`
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'image_risk_analysis_document_id_documents_id_fk'
    `);
    if (fk1Check.length === 0) {
      await db.execute(sql`
        ALTER TABLE "image_risk_analysis" ADD CONSTRAINT "image_risk_analysis_document_id_documents_id_fk"
        FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action
      `);
    }

    const fk2Check = await db.execute(sql`
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'image_risk_analysis_block_id_document_blocks_id_fk'
    `);
    if (fk2Check.length === 0) {
      await db.execute(sql`
        ALTER TABLE "image_risk_analysis" ADD CONSTRAINT "image_risk_analysis_block_id_document_blocks_id_fk"
        FOREIGN KEY ("block_id") REFERENCES "public"."document_blocks"("id") ON DELETE set null ON UPDATE no action
      `);
    }

    const fk3Check = await db.execute(sql`
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'image_risk_analysis_verified_by_users_id_fk'
    `);
    if (fk3Check.length === 0) {
      await db.execute(sql`
        ALTER TABLE "image_risk_analysis" ADD CONSTRAINT "image_risk_analysis_verified_by_users_id_fk"
        FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action
      `);
    }
    console.log("✓ 添加外键约束");

    console.log("\n迁移完成！");
  } catch (error) {
    console.error("迁移失败:", error);
    process.exit(1);
  }

  process.exit(0);
}

runMigration();
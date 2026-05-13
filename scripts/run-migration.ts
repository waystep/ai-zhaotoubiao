import "dotenv/config";
import { db } from "../src/lib/db/client";
import { sql } from "drizzle-orm";

async function main() {
  // Migration 0009: add chunk_index
  console.log("Adding chunk_index column...");
  try {
    await db.execute(sql.raw(`ALTER TABLE "document_page_embeddings" ADD COLUMN IF NOT EXISTS "chunk_index" integer DEFAULT 0 NOT NULL`));
    console.log("  OK");
  } catch (e: any) {
    console.log("  (may already exist):", e.message);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

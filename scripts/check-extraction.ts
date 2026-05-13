import "dotenv/config";
import { db } from "../src/lib/db/client";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'extraction_items' ORDER BY ordinal_position`);
  console.log("extraction_items columns:");
  for (const row of result) {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

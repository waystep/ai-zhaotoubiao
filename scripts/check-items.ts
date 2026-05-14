import "dotenv/config";
import { db } from "../src/lib/db/client";
import { sql } from "drizzle-orm";

async function main() {
  const projectId = "6696d655-25b9-4f48-9533-a290a2a56eba";
  console.log("Checking project:", projectId);

  const r = await db.execute(sql`
    SELECT count(*) as cnt, section, title
    FROM extraction_items
    WHERE project_id = ${projectId}
    GROUP BY section, title
  `);
  console.log("Count by section/title:", JSON.stringify(r, null, 2));

  const all = await db.execute(sql`
    SELECT id, section, title, checkpoint, consequence
    FROM extraction_items
    WHERE project_id = ${projectId}
    LIMIT 5
  `);
  console.log("Sample items:", JSON.stringify(all, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });

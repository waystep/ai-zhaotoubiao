import "dotenv/config";
import { db } from "../src/lib/db/client";
import { reviewReports, reviewItemResults, reviewIssues, responseItemResults } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const reportId = "47f08140-c28b-4fc5-9929-332ca8ded72c";

  const report = await db.query.reviewReports.findFirst({
    where: eq(reviewReports.id, reportId),
  });
  console.log("=== Report ===");
  console.log("id:", report?.id);
  console.log("status:", report?.status);
  console.log("score:", report?.aiScore);
  console.log("recommendation:", report?.recommendation);
  console.log("summary:", report?.summary?.slice(0, 200));
  console.log("error:", JSON.stringify(report?.aiAnalysis));

  const items = await db.query.reviewItemResults.findMany({
    where: eq(reviewItemResults.reportId, reportId),
  });
  console.log("\n=== Review Item Results ===");
  console.log("count:", items.length);
  for (const item of items) {
    console.log(`  [${item.status}] reviewItemId=${item.reviewItemId} reason=${item.reason?.slice(0, 100)}`);
  }

  const issues = await db.query.reviewIssues.findMany({
    where: eq(reviewIssues.reportId, reportId),
  });
  console.log("\n=== Issues ===");
  console.log("count:", issues.length);
  for (const issue of issues.slice(0, 5)) {
    console.log(`  [${issue.severity}] ${issue.title} — ${issue.description?.slice(0, 100)}`);
  }

  const respItems = await db.query.responseItemResults.findMany({
    where: eq(responseItemResults.reportId, reportId),
  });
  console.log("\n=== Response Item Results ===");
  console.log("count:", respItems.length);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

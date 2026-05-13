/**
 * 清空 public schema 下除 Drizzle 迁移表外的所有表（本地测试数据）。
 * 使用 DATABASE_URL；未设置时与 drizzle.config 默认一致。
 */
import "dotenv/config";
import postgres from "postgres";

const EXCLUDED = new Set(["__drizzle_migrations", "drizzle_migrations"]);

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/smart_tender_review";

async function main() {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const rows = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `;
    const tables = rows
      .map((r) => r.tablename)
      .filter((n) => !EXCLUDED.has(n))
      .sort();

    if (tables.length === 0) {
      console.log("public 下没有可清空的表。");
      return;
    }

    const quoted = tables.map((t) => `"${t.replace(/"/g, '""')}"`).join(", ");
    await sql.unsafe(
      `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
    );
    console.log(`已 TRUNCATE（RESTART IDENTITY CASCADE）共 ${tables.length} 张表：`);
    console.log(tables.join(", "));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

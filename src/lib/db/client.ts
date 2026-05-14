import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  max: 10,            // 最大连接数
  idle_timeout: 20,   // 空闲连接 20 秒后释放
  connect_timeout: 10,
});
export const db = drizzle(client, { schema });

export type Database = typeof db;

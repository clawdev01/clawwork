import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import { checkEnv } from "@/lib/check-env";

checkEnv();

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "clawwork.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-migrate: add columns that may be missing
try {
  sqlite.exec("ALTER TABLE agents ADD COLUMN email TEXT");
} catch {
  // Column already exists
}

export const db = drizzle(sqlite, { schema });
export { schema };

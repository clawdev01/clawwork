import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import { checkEnv } from "@/lib/check-env";

checkEnv();

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "clawwork.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
// FK enforcement disabled — integrity managed at application level
sqlite.pragma("foreign_keys = OFF");

// Auto-migrate: create missing tables and add columns
const autoMigrate = () => {
  const addColumn = (table: string, col: string, type: string) => {
    try { sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch { /* exists */ }
  };

  // Users table (SIWE wallet-based human identity)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL UNIQUE,
      display_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
  `);

  // Core tables that may be missing on older deployments
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
      raised_by TEXT NOT NULL, raised_by_role TEXT NOT NULL, reason TEXT NOT NULL,
      description TEXT, buyer_evidence TEXT, agent_evidence TEXT,
      status TEXT DEFAULT 'open', resolution TEXT, resolution_note TEXT,
      refund_percentage INTEGER, response_deadline TEXT,
      resolved_at TEXT, resolved_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trust_scores (
      id TEXT PRIMARY KEY, wallet_address TEXT NOT NULL, role TEXT NOT NULL,
      score REAL DEFAULT 50, tasks_completed INTEGER DEFAULT 0,
      tasks_disputed INTEGER DEFAULT 0, disputes_won INTEGER DEFAULT 0,
      disputes_lost INTEGER DEFAULT 0, total_volume_usdc REAL DEFAULT 0,
      flags TEXT DEFAULT '[]', banned_at TEXT, banned_reason TEXT,
      last_dispute_lost_at TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS abuse_log (
      id TEXT PRIMARY KEY, wallet_address TEXT NOT NULL,
      action TEXT NOT NULL, reason TEXT NOT NULL, severity TEXT NOT NULL,
      metadata TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id),
      type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
      task_id TEXT REFERENCES tasks(id), read INTEGER DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auto_bid_rules (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id),
      name TEXT, enabled INTEGER DEFAULT 1, categories TEXT, skills TEXT,
      min_budget_usdc REAL, max_budget_usdc REAL,
      bid_strategy TEXT DEFAULT 'match_budget', fixed_bid_usdc REAL,
      bid_message TEXT, max_active_tasks INTEGER DEFAULT 3,
      total_bids_placed INTEGER DEFAULT 0, total_bids_accepted INTEGER DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id),
      event_type TEXT NOT NULL, payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0,
      last_attempt_at TEXT, delivered_at TEXT, error TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_disputes_task_id ON disputes(task_id);
    CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
    CREATE INDEX IF NOT EXISTS idx_trust_scores_wallet ON trust_scores(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_trust_scores_wallet_role ON trust_scores(wallet_address, role);
    CREATE INDEX IF NOT EXISTS idx_abuse_log_wallet ON abuse_log(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_notifications_agent_id ON notifications(agent_id);
    CREATE INDEX IF NOT EXISTS idx_auto_bid_rules_agent_id ON auto_bid_rules(agent_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_agent_id ON webhook_events(agent_id);
  `);

  // Column migrations for older DBs
  addColumn("agents", "owner_id", "TEXT");
  addColumn("agents", "email", "TEXT");
  addColumn("agents", "webhook_url", "TEXT");
  addColumn("agents", "webhook_secret", "TEXT");
  addColumn("agents", "max_concurrent_tasks", "INTEGER DEFAULT 5");
  addColumn("tasks", "auto_accept", "INTEGER DEFAULT 0");
  addColumn("tasks", "auto_accept_min_reputation", "REAL");
  addColumn("tasks", "auto_accept_max_budget", "REAL");
  addColumn("tasks", "auto_accept_preferred_skills", "TEXT");
  addColumn("bids", "auto_bid", "INTEGER DEFAULT 0");
  addColumn("portfolios", "input_example", "TEXT");
  addColumn("portfolios", "output_example", "TEXT");
  addColumn("agents", "availability_schedule", "TEXT");
  addColumn("agents", "input_schema", "TEXT");
  addColumn("tasks", "task_inputs", "TEXT");
  addColumn("tasks", "additional_notes", "TEXT");
  addColumn("tasks", "deliverables", "TEXT");
};

autoMigrate();

export const db = drizzle(sqlite, { schema });
export { schema };

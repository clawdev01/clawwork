import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "clawwork.db");

export function runMigrations() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT,
      bio TEXT,
      avatar_url TEXT,
      platform TEXT DEFAULT 'custom',
      moltbook_id TEXT,
      wallet_address TEXT,
      skills TEXT DEFAULT '[]',
      hourly_rate_usdc REAL,
      task_rate_usdc REAL,
      status TEXT DEFAULT 'active',
      reputation_score REAL DEFAULT 0,
      tasks_completed INTEGER DEFAULT 0,
      total_earned_usdc REAL DEFAULT 0,
      api_key TEXT NOT NULL,
      api_key_prefix TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolios (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'other',
      proof_url TEXT,
      proof_type TEXT DEFAULT 'other',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT DEFAULT 'other',
      posted_by_type TEXT NOT NULL,
      posted_by_id TEXT NOT NULL,
      budget_usdc REAL NOT NULL,
      deadline TEXT,
      required_skills TEXT DEFAULT '[]',
      status TEXT DEFAULT 'open',
      assigned_agent_id TEXT REFERENCES agents(id),
      escrow_tx_hash TEXT,
      completion_tx_hash TEXT,
      bid_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      amount_usdc REAL NOT NULL,
      proposal TEXT NOT NULL,
      estimated_hours REAL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      reviewer_id TEXT NOT NULL,
      reviewer_type TEXT NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES tasks(id),
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount_usdc REAL NOT NULL,
      tx_hash TEXT,
      chain TEXT DEFAULT 'base',
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
    CREATE INDEX IF NOT EXISTS idx_bids_task_id ON bids(task_id);
    CREATE INDEX IF NOT EXISTS idx_bids_agent_id ON bids(agent_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_agent_id ON reviews(agent_id);
    CREATE INDEX IF NOT EXISTS idx_portfolios_agent_id ON portfolios(agent_id);
  `);

  sqlite.close();
}

// Run if called directly
runMigrations();
console.log("✅ Database migrated successfully");

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "clawwork.db");

export function runMigrations() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // ============ CORE TABLES ============
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
      webhook_url TEXT,
      webhook_secret TEXT,
      max_concurrent_tasks INTEGER DEFAULT 5,
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
      auto_accept INTEGER DEFAULT 0,
      auto_accept_min_reputation REAL,
      auto_accept_max_budget REAL,
      auto_accept_preferred_skills TEXT,
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
      auto_bid INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS auto_bid_rules (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      name TEXT,
      enabled INTEGER DEFAULT 1,
      categories TEXT,
      skills TEXT,
      min_budget_usdc REAL,
      max_budget_usdc REAL,
      bid_strategy TEXT DEFAULT 'match_budget',
      fixed_bid_usdc REAL,
      bid_message TEXT,
      max_active_tasks INTEGER DEFAULT 3,
      total_bids_placed INTEGER DEFAULT 0,
      total_bids_accepted INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      last_attempt_at TEXT,
      delivered_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      task_id TEXT REFERENCES tasks(id),
      read INTEGER DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_by_id TEXT NOT NULL REFERENCES agents(id),
      status TEXT DEFAULT 'draft',
      current_step INTEGER DEFAULT 0,
      total_steps INTEGER NOT NULL,
      total_budget_usdc REAL NOT NULL,
      spent_usdc REAL DEFAULT 0,
      auto_match INTEGER DEFAULT 1,
      is_template INTEGER DEFAULT 0,
      template_category TEXT,
      usage_count INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id),
      step_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      required_skills TEXT DEFAULT '[]',
      category TEXT DEFAULT 'other',
      budget_usdc REAL NOT NULL,
      input_from TEXT,
      input_description TEXT,
      output_format TEXT DEFAULT 'text',
      output_description TEXT,
      status TEXT DEFAULT 'pending',
      task_id TEXT REFERENCES tasks(id),
      assigned_agent_id TEXT REFERENCES agents(id),
      output TEXT,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workflows_created_by ON workflows(created_by_id);
    CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
    CREATE INDEX IF NOT EXISTS idx_workflows_template ON workflows(is_template);
    CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_steps_task ON workflow_steps(task_id);
    CREATE INDEX IF NOT EXISTS idx_auto_bid_rules_agent_id ON auto_bid_rules(agent_id);
    CREATE INDEX IF NOT EXISTS idx_auto_bid_rules_enabled ON auto_bid_rules(enabled);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_agent_id ON webhook_events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_agent_id ON notifications(agent_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
  `);

  // ============ MIGRATIONS (add columns to existing tables) ============
  const addColumnIfNotExists = (table: string, column: string, type: string) => {
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch {
      // Column already exists
    }
  };

  // v2 columns for agents
  addColumnIfNotExists("agents", "webhook_url", "TEXT");
  addColumnIfNotExists("agents", "webhook_secret", "TEXT");
  addColumnIfNotExists("agents", "max_concurrent_tasks", "INTEGER DEFAULT 5");

  // v2 columns for tasks
  addColumnIfNotExists("tasks", "auto_accept", "INTEGER DEFAULT 0");
  addColumnIfNotExists("tasks", "auto_accept_min_reputation", "REAL");
  addColumnIfNotExists("tasks", "auto_accept_max_budget", "REAL");
  addColumnIfNotExists("tasks", "auto_accept_preferred_skills", "TEXT");

  // v2 columns for bids
  addColumnIfNotExists("bids", "auto_bid", "INTEGER DEFAULT 0");

  sqlite.close();
}

// Run if called directly
runMigrations();
console.log("✅ Database migrated successfully");

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ============ AGENTS ============
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(), // uuid
  name: text("name").notNull().unique(), // slug-friendly unique name
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  platform: text("platform").default("custom"), // openclaw, moltbook, langchain, crewai, custom
  moltbookId: text("moltbook_id"),
  walletAddress: text("wallet_address"), // crypto wallet for payments
  skills: text("skills").default("[]"), // JSON array of skill tags
  hourlyRateUsdc: real("hourly_rate_usdc"),
  taskRateUsdc: real("task_rate_usdc"),
  status: text("status").default("active"), // active, inactive, suspended
  reputationScore: real("reputation_score").default(0), // 0-100
  tasksCompleted: integer("tasks_completed").default(0),
  totalEarnedUsdc: real("total_earned_usdc").default(0),
  apiKey: text("api_key").notNull(), // hashed API key for auth
  apiKeyPrefix: text("api_key_prefix").notNull(), // first 8 chars for identification
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============ PORTFOLIOS ============
export const portfolios = sqliteTable("portfolios", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").default("other"), // research, coding, design, data, writing, automation, other
  proofUrl: text("proof_url"),
  proofType: text("proof_type").default("other"), // github_pr, document, image, api_response, other
  createdAt: text("created_at").notNull(),
});

// ============ TASKS ============
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").default("other"),
  postedByType: text("posted_by_type").notNull(), // human, agent
  postedById: text("posted_by_id").notNull(),
  budgetUsdc: real("budget_usdc").notNull(),
  deadline: text("deadline"),
  requiredSkills: text("required_skills").default("[]"), // JSON array
  status: text("status").default("open"), // open, in_progress, review, completed, cancelled, disputed
  assignedAgentId: text("assigned_agent_id").references(() => agents.id),
  escrowTxHash: text("escrow_tx_hash"),
  completionTxHash: text("completion_tx_hash"),
  bidCount: integer("bid_count").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============ BIDS ============
export const bids = sqliteTable("bids", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  amountUsdc: real("amount_usdc").notNull(),
  proposal: text("proposal").notNull(), // why this agent is right for the job
  estimatedHours: real("estimated_hours"),
  status: text("status").default("pending"), // pending, accepted, rejected, withdrawn
  createdAt: text("created_at").notNull(),
});

// ============ REVIEWS ============
export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  reviewerId: text("reviewer_id").notNull(),
  reviewerType: text("reviewer_type").notNull(), // human, agent
  agentId: text("agent_id").notNull().references(() => agents.id),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: text("created_at").notNull(),
});

// ============ TRANSACTIONS ============
export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => tasks.id),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  amountUsdc: real("amount_usdc").notNull(),
  txHash: text("tx_hash"),
  chain: text("chain").default("base"), // base, ethereum, arbitrum
  type: text("type").notNull(), // escrow_deposit, escrow_release, refund, platform_fee
  status: text("status").default("pending"), // pending, confirmed, failed
  createdAt: text("created_at").notNull(),
});

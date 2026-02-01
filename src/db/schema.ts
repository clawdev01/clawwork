import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ============ USERS (Human wallet-based identity) ============
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  displayName: text("display_name"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============ AGENTS ============
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(), // uuid
  ownerId: text("owner_id"), // references users.id — nullable for backward compat
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
  status: text("status").default("active"), // active, draining, inactive, suspended
  reputationScore: real("reputation_score").default(0), // 0-100
  tasksCompleted: integer("tasks_completed").default(0),
  totalEarnedUsdc: real("total_earned_usdc").default(0),
  apiKey: text("api_key").notNull(), // hashed API key for auth
  apiKeyPrefix: text("api_key_prefix").notNull(), // first 8 chars for identification
  email: text("email"), // optional contact email for notifications
  webhookUrl: text("webhook_url"), // URL to notify agent of matching tasks
  webhookSecret: text("webhook_secret"), // HMAC secret for webhook verification
  maxConcurrentTasks: integer("max_concurrent_tasks").default(5), // capacity limit
  availabilitySchedule: text("availability_schedule"), // JSON: { type: "always"|"scheduled"|"manual", schedule?: { days, startHour, endHour, timezone } }
  inputSchema: text("input_schema"), // JSON — structured input definition (see InputSchema type)
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
  inputExample: text("input_example"), // example input to demonstrate capability
  outputExample: text("output_example"), // example output to demonstrate capability
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
  taskInputs: text("task_inputs"), // JSON — filled-in values matching agent's inputSchema
  additionalNotes: text("additional_notes"), // free-form extra context from employer
  escrowTxHash: text("escrow_tx_hash"),
  completionTxHash: text("completion_tx_hash"),
  bidCount: integer("bid_count").default(0),
  // Auto-accept settings (poster sets these when creating task)
  autoAccept: integer("auto_accept").default(0), // 1 = enabled
  autoAcceptMinReputation: real("auto_accept_min_reputation"), // min reputation score
  autoAcceptMaxBudget: real("auto_accept_max_budget"), // accept if bid <= this amount
  autoAcceptPreferredSkills: text("auto_accept_preferred_skills"), // JSON array — bonus matching
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
  autoBid: integer("auto_bid").default(0), // 1 = submitted by auto-bid rule
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

// ============ AUTO-BID RULES ============
export const autoBidRules = sqliteTable("auto_bid_rules", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  name: text("name"), // friendly name for the rule
  enabled: integer("enabled").default(1), // 1 = active
  // Matching criteria
  categories: text("categories"), // JSON array — match these task categories
  skills: text("skills"), // JSON array — match tasks requiring any of these skills
  minBudgetUsdc: real("min_budget_usdc"), // only bid if budget >= this
  maxBudgetUsdc: real("max_budget_usdc"), // only bid if budget <= this
  // Bid settings
  bidStrategy: text("bid_strategy").default("match_budget"), // match_budget, undercut_10, fixed_rate, hourly_calc
  fixedBidUsdc: real("fixed_bid_usdc"), // for fixed_rate strategy
  bidMessage: text("bid_message"), // template proposal message (supports {task_title}, {skills}, {budget} placeholders)
  // Capacity control
  maxActiveTasks: integer("max_active_tasks").default(3), // don't bid if agent has >= this many active tasks
  // Stats
  totalBidsPlaced: integer("total_bids_placed").default(0),
  totalBidsAccepted: integer("total_bids_accepted").default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============ WEBHOOK EVENTS ============
export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  eventType: text("event_type").notNull(), // task_match, bid_accepted, bid_rejected, task_assigned, payment_received
  payload: text("payload").notNull(), // JSON payload sent
  status: text("status").default("pending"), // pending, delivered, failed
  attempts: integer("attempts").default(0),
  lastAttemptAt: text("last_attempt_at"),
  deliveredAt: text("delivered_at"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
});

// ============ DISPUTES ============
export const disputes = sqliteTable("disputes", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  raisedBy: text("raised_by").notNull(), // wallet address or agent id
  raisedByRole: text("raised_by_role").notNull(), // "buyer" | "agent"
  reason: text("reason").notNull(), // not_delivered, wrong_output, quality_issue, scam, other
  description: text("description"),
  buyerEvidence: text("buyer_evidence"), // JSON: { text, links[] }
  agentEvidence: text("agent_evidence"), // JSON: { text, links[] }
  status: text("status").default("open"), // open, reviewing, resolved
  resolution: text("resolution"), // full_refund, partial_refund, agent_paid, split
  resolutionNote: text("resolution_note"),
  refundPercentage: integer("refund_percentage"), // 0-100 for partial refunds
  responseDeadline: text("response_deadline"), // ISO timestamp — other party must respond by this
  resolvedAt: text("resolved_at"),
  resolvedBy: text("resolved_by"), // admin id or "auto"
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============ TRUST SCORES ============
export const trustScores = sqliteTable("trust_scores", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  role: text("role").notNull(), // "buyer" | "agent"
  score: real("score").default(50), // 0-100, starts at 50
  tasksCompleted: integer("tasks_completed").default(0),
  tasksDisputed: integer("tasks_disputed").default(0),
  disputesWon: integer("disputes_won").default(0),
  disputesLost: integer("disputes_lost").default(0),
  totalVolumeUsdc: real("total_volume_usdc").default(0),
  flags: text("flags").default("[]"), // JSON array of flag strings
  bannedAt: text("banned_at"),
  bannedReason: text("banned_reason"),
  lastDisputeLostAt: text("last_dispute_lost_at"),
  updatedAt: text("updated_at").notNull(),
});

// ============ ABUSE LOG ============
export const abuseLog = sqliteTable("abuse_log", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  action: text("action").notNull(), // dispute_spam, lost_dispute, sybil_detected, rate_limit_hit, etc.
  reason: text("reason").notNull(),
  severity: text("severity").notNull(), // warning, restriction, ban
  metadata: text("metadata"), // JSON with extra details
  createdAt: text("created_at").notNull(),
});

// ============ NOTIFICATIONS (in-app, for agents without webhooks) ============
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  type: text("type").notNull(), // task_match, bid_accepted, bid_rejected, task_assigned, payment_received, auto_bid_placed
  title: text("title").notNull(),
  message: text("message").notNull(),
  taskId: text("task_id").references(() => tasks.id),
  read: integer("read").default(0), // 0 = unread, 1 = read
  createdAt: text("created_at").notNull(),
});

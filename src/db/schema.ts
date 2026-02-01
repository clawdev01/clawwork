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
  email: text("email"), // optional contact email for notifications
  webhookUrl: text("webhook_url"), // URL to notify agent of matching tasks
  webhookSecret: text("webhook_secret"), // HMAC secret for webhook verification
  maxConcurrentTasks: integer("max_concurrent_tasks").default(5), // capacity limit
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

// ============ WORKFLOWS ============
export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdById: text("created_by_id").notNull().references(() => agents.id),
  status: text("status").default("draft"), // draft, running, paused, completed, failed, cancelled
  currentStep: integer("current_step").default(0), // which step is active (0-indexed)
  totalSteps: integer("total_steps").notNull(),
  totalBudgetUsdc: real("total_budget_usdc").notNull(),
  spentUsdc: real("spent_usdc").default(0),
  autoMatch: integer("auto_match").default(1), // 1 = auto-find agents for each step
  isTemplate: integer("is_template").default(0), // 1 = reusable template
  templateCategory: text("template_category"), // marketing, content, development, research, design
  usageCount: integer("usage_count").default(0), // how many times this template has been used
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ============ WORKFLOW STEPS ============
export const workflowSteps = sqliteTable("workflow_steps", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull().references(() => workflows.id),
  stepIndex: integer("step_index").notNull(), // 0-based order
  title: text("title").notNull(),
  description: text("description"),
  requiredSkills: text("required_skills").default("[]"), // JSON array
  category: text("category").default("other"),
  budgetUsdc: real("budget_usdc").notNull(),
  // Input/output configuration
  inputFrom: text("input_from"), // "step_0", "step_1", etc. or null for first step
  inputDescription: text("input_description"), // what this step receives
  outputFormat: text("output_format").default("text"), // text, image, audio, video, file, json
  outputDescription: text("output_description"), // what this step should produce
  // Execution state
  status: text("status").default("pending"), // pending, waiting_input, open, in_progress, review, completed, failed, skipped
  taskId: text("task_id").references(() => tasks.id), // linked task when step is active
  assignedAgentId: text("assigned_agent_id").references(() => agents.id),
  output: text("output"), // stored output from completed step (text or URL)
  error: text("error"), // error message if failed
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
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

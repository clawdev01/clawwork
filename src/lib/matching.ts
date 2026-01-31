/**
 * ClawWork Matching Engine
 *
 * When a task is posted:
 * 1. Find agents with matching skills
 * 2. Check auto-bid rules → auto-submit bids
 * 3. Send webhook notifications to matching agents
 * 4. Create in-app notifications
 * 5. If task has auto-accept + qualifying bid → instant match
 *
 * The goal: task posted → bid → accepted → work begins. All in seconds.
 */

import { db, schema } from "@/db";
import { eq, and, ne } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import crypto from "crypto";

// ============ TYPES ============

interface TaskMatchResult {
  matchedAgents: number;
  autoBidsPlaced: number;
  autoAccepted: boolean;
  webhooksSent: number;
  notificationsCreated: number;
  acceptedBidId?: string;
  acceptedAgentId?: string;
}

// ============ MAIN MATCHING FUNCTION ============

/**
 * Process a newly posted task — find matches, auto-bid, auto-accept
 * Called after task creation in POST /api/tasks
 */
export async function processNewTask(taskId: string): Promise<TaskMatchResult> {
  const result: TaskMatchResult = {
    matchedAgents: 0,
    autoBidsPlaced: 0,
    autoAccepted: false,
    webhooksSent: 0,
    notificationsCreated: 0,
  };

  try {
    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, taskId),
    });
    if (!task || task.status !== "open") return result;

    const taskSkills: string[] = JSON.parse(task.requiredSkills || "[]");
    const taskCategory = task.category || "other";

    // 1. Find all active agents (excluding poster)
    const allAgents = await db.query.agents.findMany({
      where: and(eq(schema.agents.status, "active"), ne(schema.agents.id, task.postedById)),
    });

    // 2. Score and match agents
    const matchedAgents = allAgents.filter((agent) => {
      const agentSkills: string[] = JSON.parse(agent.skills || "[]");
      if (taskSkills.length === 0) return true; // no skills required = open to all
      return taskSkills.some((s) =>
        agentSkills.some((as) => as.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(as.toLowerCase()))
      );
    });

    result.matchedAgents = matchedAgents.length;

    // 3. Process auto-bid rules for each matched agent
    for (const agent of matchedAgents) {
      const autoBidResult = await processAutoBidRules(agent, task, taskSkills, taskCategory);
      if (autoBidResult.bidPlaced) {
        result.autoBidsPlaced++;

        // 4. Check auto-accept on the task
        if (task.autoAccept && autoBidResult.bidId) {
          const accepted = await checkAutoAccept(task, autoBidResult.bidId, agent);
          if (accepted) {
            result.autoAccepted = true;
            result.acceptedBidId = autoBidResult.bidId;
            result.acceptedAgentId = agent.id;
            // Task is now in_progress, stop processing more agents
            break;
          }
        }
      }

      // 5. Send webhook notification (even if no auto-bid, so agent knows about the task)
      if (agent.webhookUrl) {
        await sendWebhook(agent, "task_match", {
          taskId: task.id,
          title: task.title,
          category: taskCategory,
          budgetUsdc: task.budgetUsdc,
          requiredSkills: taskSkills,
          deadline: task.deadline,
          autoBidPlaced: autoBidResult.bidPlaced,
          bidId: autoBidResult.bidId,
        });
        result.webhooksSent++;
      }

      // 6. Create in-app notification
      await createNotification(agent.id, "task_match", task);
      result.notificationsCreated++;
    }

    return result;
  } catch (error) {
    console.error("Task matching error:", error);
    return result;
  }
}

// ============ AUTO-BID PROCESSING ============

interface AutoBidResult {
  bidPlaced: boolean;
  bidId?: string;
  ruleId?: string;
}

async function processAutoBidRules(
  agent: typeof schema.agents.$inferSelect,
  task: typeof schema.tasks.$inferSelect,
  taskSkills: string[],
  taskCategory: string
): Promise<AutoBidResult> {
  try {
    // Get active auto-bid rules for this agent
    const rules = await db.query.autoBidRules.findMany({
      where: and(eq(schema.autoBidRules.agentId, agent.id), eq(schema.autoBidRules.enabled, 1)),
    });

    if (rules.length === 0) return { bidPlaced: false };

    // Check agent capacity — how many active tasks do they have?
    const activeTasks = await db.query.tasks.findMany({
      where: and(eq(schema.tasks.assignedAgentId, agent.id), eq(schema.tasks.status, "in_progress")),
    });

    // Check for existing bid on this task
    const existingBid = await db.query.bids.findFirst({
      where: and(eq(schema.bids.taskId, task.id), eq(schema.bids.agentId, agent.id)),
    });
    if (existingBid) return { bidPlaced: false }; // already bid

    for (const rule of rules) {
      // Check capacity
      const maxActive = rule.maxActiveTasks || 3;
      if (activeTasks.length >= maxActive) continue;

      // Check category match
      if (rule.categories) {
        const ruleCategories: string[] = JSON.parse(rule.categories);
        if (ruleCategories.length > 0 && !ruleCategories.includes(taskCategory)) continue;
      }

      // Check skill match
      if (rule.skills) {
        const ruleSkills: string[] = JSON.parse(rule.skills);
        if (ruleSkills.length > 0) {
          const hasMatch = taskSkills.some((ts) =>
            ruleSkills.some((rs) => rs.toLowerCase().includes(ts.toLowerCase()) || ts.toLowerCase().includes(rs.toLowerCase()))
          );
          if (!hasMatch) continue;
        }
      }

      // Check budget range
      if (rule.minBudgetUsdc && task.budgetUsdc < rule.minBudgetUsdc) continue;
      if (rule.maxBudgetUsdc && task.budgetUsdc > rule.maxBudgetUsdc) continue;

      // All checks passed — calculate bid amount
      const bidAmount = calculateBidAmount(rule, task);

      // Generate proposal from template
      const proposal = generateProposal(rule, task, agent, taskSkills);

      // Place the bid
      const bidId = uuid();
      const now = new Date().toISOString();

      await db.insert(schema.bids).values({
        id: bidId,
        taskId: task.id,
        agentId: agent.id,
        amountUsdc: bidAmount,
        proposal,
        autoBid: 1,
        createdAt: now,
      });

      // Update task bid count
      await db.update(schema.tasks).set({
        bidCount: (task.bidCount || 0) + 1,
        updatedAt: now,
      }).where(eq(schema.tasks.id, task.id));

      // Update rule stats
      await db.update(schema.autoBidRules).set({
        totalBidsPlaced: (rule.totalBidsPlaced || 0) + 1,
        updatedAt: now,
      }).where(eq(schema.autoBidRules.id, rule.id));

      // Notify agent about the auto-bid
      await createNotification(agent.id, "auto_bid_placed", task, `Auto-bid of $${bidAmount} USDC placed on "${task.title}"`);

      return { bidPlaced: true, bidId, ruleId: rule.id };
    }

    return { bidPlaced: false };
  } catch (error) {
    console.error("Auto-bid processing error:", error);
    return { bidPlaced: false };
  }
}

function calculateBidAmount(
  rule: typeof schema.autoBidRules.$inferSelect,
  task: typeof schema.tasks.$inferSelect
): number {
  switch (rule.bidStrategy) {
    case "match_budget":
      return task.budgetUsdc;
    case "undercut_10":
      return Math.round(task.budgetUsdc * 0.9 * 100) / 100;
    case "fixed_rate":
      return rule.fixedBidUsdc || task.budgetUsdc;
    case "hourly_calc":
      // Estimate hours based on budget and agent's hourly rate
      return rule.fixedBidUsdc || task.budgetUsdc;
    default:
      return task.budgetUsdc;
  }
}

function generateProposal(
  rule: typeof schema.autoBidRules.$inferSelect,
  task: typeof schema.tasks.$inferSelect,
  agent: typeof schema.agents.$inferSelect,
  taskSkills: string[]
): string {
  if (rule.bidMessage) {
    const agentSkills: string[] = JSON.parse(agent.skills || "[]");
    const matchingSkills = taskSkills.filter((ts) =>
      agentSkills.some((as) => as.toLowerCase().includes(ts.toLowerCase()))
    );

    return rule.bidMessage
      .replace(/\{task_title\}/g, task.title)
      .replace(/\{skills\}/g, matchingSkills.join(", ") || agentSkills.join(", "))
      .replace(/\{budget\}/g, task.budgetUsdc.toString())
      .replace(/\{agent_name\}/g, agent.displayName || agent.name)
      .replace(/\{reputation\}/g, (agent.reputationScore || 0).toString())
      .replace(/\{completed\}/g, (agent.tasksCompleted || 0).toString());
  }

  // Default proposal
  const agentSkills: string[] = JSON.parse(agent.skills || "[]");
  const matchingSkills = taskSkills.filter((ts) =>
    agentSkills.some((as) => as.toLowerCase().includes(ts.toLowerCase()))
  );

  return `I'm ${agent.displayName || agent.name}, and I'm a great fit for this task. ` +
    (matchingSkills.length > 0
      ? `I have direct experience with: ${matchingSkills.join(", ")}. `
      : `My skills include: ${agentSkills.slice(0, 5).join(", ")}. `) +
    `I've completed ${agent.tasksCompleted || 0} tasks with a reputation score of ${agent.reputationScore || 0}/100. ` +
    `I can deliver quality results efficiently.`;
}

// ============ AUTO-ACCEPT ============

async function checkAutoAccept(
  task: typeof schema.tasks.$inferSelect,
  bidId: string,
  agent: typeof schema.agents.$inferSelect
): Promise<boolean> {
  try {
    if (!task.autoAccept) return false;

    // Check minimum reputation
    if (task.autoAcceptMinReputation && (agent.reputationScore || 0) < task.autoAcceptMinReputation) {
      return false;
    }

    // Check bid amount against max budget
    const bid = await db.query.bids.findFirst({
      where: eq(schema.bids.id, bidId),
    });
    if (!bid) return false;

    if (task.autoAcceptMaxBudget && bid.amountUsdc > task.autoAcceptMaxBudget) {
      return false;
    }

    // Check preferred skills bonus (not required, just gives priority)
    // For now, if all checks pass, auto-accept

    const now = new Date().toISOString();

    // Accept the bid
    await db.update(schema.bids).set({ status: "accepted" }).where(eq(schema.bids.id, bidId));

    // Reject all other bids on this task
    await db.update(schema.bids).set({ status: "rejected" }).where(
      and(eq(schema.bids.taskId, task.id), ne(schema.bids.id, bidId))
    );

    // Update task to in_progress
    await db.update(schema.tasks).set({
      status: "in_progress",
      assignedAgentId: agent.id,
      updatedAt: now,
    }).where(eq(schema.tasks.id, task.id));

    // Notify the agent
    await createNotification(agent.id, "bid_accepted", task, `Your bid was auto-accepted for "${task.title}"! Work begins now.`);

    // Webhook notification
    if (agent.webhookUrl) {
      await sendWebhook(agent, "bid_accepted", {
        taskId: task.id,
        bidId,
        title: task.title,
        budgetUsdc: task.budgetUsdc,
        autoAccepted: true,
      });
    }

    return true;
  } catch (error) {
    console.error("Auto-accept error:", error);
    return false;
  }
}

// ============ WEBHOOKS ============

async function sendWebhook(
  agent: typeof schema.agents.$inferSelect,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!agent.webhookUrl) return;

  const eventId = uuid();
  const now = new Date().toISOString();
  const payloadStr = JSON.stringify({
    event: eventType,
    timestamp: now,
    data: payload,
  });

  // Record the event
  await db.insert(schema.webhookEvents).values({
    id: eventId,
    agentId: agent.id,
    eventType,
    payload: payloadStr,
    createdAt: now,
  });

  // Send asynchronously (don't block the matching flow)
  deliverWebhook(eventId, agent.webhookUrl, agent.webhookSecret, payloadStr).catch((err) =>
    console.error("Webhook delivery error:", err)
  );
}

async function deliverWebhook(
  eventId: string,
  url: string,
  secret: string | null,
  payload: string
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-ClawWork-Event-ID": eventId,
  };

  // HMAC signature for verification
  if (secret) {
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    headers["X-ClawWork-Signature"] = `sha256=${signature}`;
  }

  const maxAttempts = 3;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      const now = new Date().toISOString();

      if (response.ok) {
        await db.update(schema.webhookEvents).set({
          status: "delivered",
          attempts: attempt,
          lastAttemptAt: now,
          deliveredAt: now,
        }).where(eq(schema.webhookEvents.id, eventId));
        return;
      }

      lastError = `HTTP ${response.status}: ${response.statusText}`;
    } catch (err: any) {
      lastError = err.message || "Unknown error";
    }

    // Exponential backoff between retries
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  // All attempts failed
  await db.update(schema.webhookEvents).set({
    status: "failed",
    attempts: maxAttempts,
    lastAttemptAt: new Date().toISOString(),
    error: lastError,
  }).where(eq(schema.webhookEvents.id, eventId));
}

// ============ NOTIFICATIONS ============

async function createNotification(
  agentId: string,
  type: string,
  task: typeof schema.tasks.$inferSelect,
  customMessage?: string
): Promise<void> {
  const titles: Record<string, string> = {
    task_match: "New matching task!",
    bid_accepted: "Bid accepted!",
    bid_rejected: "Bid not accepted",
    task_assigned: "Task assigned to you",
    payment_received: "Payment received!",
    auto_bid_placed: "Auto-bid placed",
  };

  const messages: Record<string, string> = {
    task_match: `"${task.title}" matches your skills — $${task.budgetUsdc} USDC`,
    bid_accepted: `Your bid on "${task.title}" was accepted! Time to work.`,
    bid_rejected: `Your bid on "${task.title}" was not selected.`,
    task_assigned: `You've been assigned "${task.title}" — $${task.budgetUsdc} USDC`,
    payment_received: `Payment of $${task.budgetUsdc} USDC received for "${task.title}"`,
    auto_bid_placed: customMessage || `Auto-bid placed on "${task.title}"`,
  };

  await db.insert(schema.notifications).values({
    id: uuid(),
    agentId,
    type,
    title: titles[type] || "Notification",
    message: customMessage || messages[type] || `Update on "${task.title}"`,
    taskId: task.id,
    createdAt: new Date().toISOString(),
  });
}

// ============ NOTIFY ON BID ACCEPTANCE (called from accept route) ============

export async function notifyBidAccepted(taskId: string, bidId: string, agentId: string): Promise<void> {
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  const agent = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentId) });
  if (!task || !agent) return;

  await createNotification(agentId, "bid_accepted", task);

  if (agent.webhookUrl) {
    await sendWebhook(agent, "bid_accepted", {
      taskId,
      bidId,
      title: task.title,
      budgetUsdc: task.budgetUsdc,
    });
  }
}

// ============ NOTIFY ON PAYMENT (called from approve route) ============

export async function notifyPaymentReceived(taskId: string, agentId: string, amount: number): Promise<void> {
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  const agent = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentId) });
  if (!task || !agent) return;

  await createNotification(agentId, "payment_received", task, `$${amount} USDC received for "${task.title}"`);

  if (agent.webhookUrl) {
    await sendWebhook(agent, "payment_received", {
      taskId,
      title: task.title,
      amountUsdc: amount,
    });
  }
}

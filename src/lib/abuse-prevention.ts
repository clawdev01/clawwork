/**
 * ClawWork Abuse Prevention System
 *
 * Rate limiting, cooldowns, escalating penalties, sybil detection,
 * and auto-approval timers.
 */

import { db, schema } from "@/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";

// ============ CONSTANTS ============

const MAX_ACTIVE_DISPUTES = 3;
const DISPUTE_COOLDOWN_DAYS = 7;
const MIN_COMPLETED_TASKS_FOR_DISPUTE = 2;
const AUTO_APPROVE_HOURS = 72;
const AUTO_RESOLVE_RESPONSE_HOURS = 48;

// Escalation thresholds
const ESCALATION = {
  warningThreshold: 1,     // 1st offense → warning
  restrictionThreshold: 2, // 2nd offense → restricted
  banThreshold: 3,         // 3rd offense → banned
};

// ============ RATE LIMITING ============

/**
 * Check if user can raise a new dispute (max 3 active at a time)
 */
export async function checkDisputeRateLimit(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  activeCount?: number;
}> {
  const activeDisputes = await db.query.disputes.findMany({
    where: and(
      eq(schema.disputes.raisedBy, userId),
      inArray(schema.disputes.status, ["open", "reviewing"])
    ),
  });

  if (activeDisputes.length >= MAX_ACTIVE_DISPUTES) {
    return {
      allowed: false,
      reason: `Maximum ${MAX_ACTIVE_DISPUTES} active disputes allowed. You have ${activeDisputes.length}.`,
      activeCount: activeDisputes.length,
    };
  }

  return { allowed: true, activeCount: activeDisputes.length };
}

// ============ COOLDOWN ============

/**
 * After losing a dispute, 7-day cooldown before can dispute again
 */
export async function checkDisputeCooldown(walletAddress: string): Promise<{
  allowed: boolean;
  reason?: string;
  cooldownEndsAt?: string;
}> {
  const normalized = walletAddress.toLowerCase();

  // Check trust scores for lastDisputeLostAt
  const trustRecords = await db.query.trustScores.findMany({
    where: eq(schema.trustScores.walletAddress, normalized),
  });

  for (const record of trustRecords) {
    if (record.lastDisputeLostAt) {
      const lostAt = new Date(record.lastDisputeLostAt).getTime();
      const cooldownEnd = lostAt + DISPUTE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

      if (Date.now() < cooldownEnd) {
        const endsAt = new Date(cooldownEnd).toISOString();
        return {
          allowed: false,
          reason: `Dispute cooldown active. You lost a dispute recently. Cooldown ends: ${endsAt}`,
          cooldownEndsAt: endsAt,
        };
      }
    }
  }

  return { allowed: true };
}

// ============ MINIMUM TASK HISTORY ============

/**
 * New accounts can't dispute until they've been involved in 2 completed tasks
 * (either as worker OR as poster/buyer)
 */
export async function checkMinimumTaskHistory(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  completedTasks?: number;
}> {
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, userId),
  });

  // Count tasks completed as worker
  const workerCompleted = agent?.tasksCompleted || 0;

  // Also count tasks posted by this agent/user that reached completion
  const postedCompleted = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.postedById, userId),
      eq(schema.tasks.status, "completed")
    ),
  });

  const completedTasks = workerCompleted + postedCompleted.length;

  if (completedTasks < MIN_COMPLETED_TASKS_FOR_DISPUTE) {
    return {
      allowed: false,
      reason: `You need at least ${MIN_COMPLETED_TASKS_FOR_DISPUTE} completed tasks before you can raise disputes. You have ${completedTasks}.`,
      completedTasks,
    };
  }

  return { allowed: true, completedTasks };
}

// ============ ESCALATING PENALTIES ============

/**
 * Log an abuse event and apply escalating penalties
 */
export async function logAbuse(
  walletAddress: string,
  action: string,
  reason: string,
  severity: "warning" | "restriction" | "ban",
  metadata?: Record<string, unknown>
): Promise<{
  logged: boolean;
  escalated: boolean;
  currentLevel: "warning" | "restriction" | "ban";
  totalOffenses: number;
}> {
  const normalized = walletAddress.toLowerCase();
  const now = new Date().toISOString();

  // Count previous offenses
  const previousOffenses = await db.query.abuseLog.findMany({
    where: eq(schema.abuseLog.walletAddress, normalized),
  });

  const totalOffenses = previousOffenses.length + 1;

  // Determine escalated severity
  let escalatedSeverity = severity;
  if (totalOffenses >= ESCALATION.banThreshold) {
    escalatedSeverity = "ban";
  } else if (totalOffenses >= ESCALATION.restrictionThreshold) {
    escalatedSeverity = "restriction";
  }

  // Log the abuse event
  await db.insert(schema.abuseLog).values({
    id: uuid(),
    walletAddress: normalized,
    action,
    reason,
    severity: escalatedSeverity,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: now,
  });

  // Apply ban if escalated to ban level
  if (escalatedSeverity === "ban") {
    const { banWallet } = await import("./trust-score");
    // Ban both roles
    await banWallet(normalized, "buyer", `Auto-banned: ${totalOffenses} offenses. Last: ${reason}`);
    await banWallet(normalized, "agent", `Auto-banned: ${totalOffenses} offenses. Last: ${reason}`);
  }

  return {
    logged: true,
    escalated: escalatedSeverity !== severity,
    currentLevel: escalatedSeverity,
    totalOffenses,
  };
}

// ============ SYBIL DETECTION ============

/**
 * Flag if same IP/device creates multiple wallets
 * Call this during account creation with request metadata
 */
export async function checkSybilIndicators(
  walletAddress: string,
  ip?: string,
  userAgent?: string
): Promise<{
  suspicious: boolean;
  flags: string[];
}> {
  const flags: string[] = [];

  if (!ip && !userAgent) return { suspicious: false, flags };

  // Check abuse log for same IP
  if (ip) {
    const ipLogs = await db.query.abuseLog.findMany({
      where: eq(schema.abuseLog.action, "account_created"),
    });

    const sameIpEntries = ipLogs.filter((log) => {
      if (!log.metadata) return false;
      try {
        const meta = JSON.parse(log.metadata);
        return meta.ip === ip && meta.walletAddress !== walletAddress.toLowerCase();
      } catch {
        return false;
      }
    });

    if (sameIpEntries.length >= 2) {
      flags.push(`same_ip_multiple_wallets:${sameIpEntries.length + 1}`);
    }
  }

  // Log this creation for future sybil checks
  const now = new Date().toISOString();
  await db.insert(schema.abuseLog).values({
    id: uuid(),
    walletAddress: walletAddress.toLowerCase(),
    action: "account_created",
    reason: "Account creation logged for sybil detection",
    severity: "warning",
    metadata: JSON.stringify({ ip, userAgent, walletAddress: walletAddress.toLowerCase() }),
    createdAt: now,
  });

  return {
    suspicious: flags.length > 0,
    flags,
  };
}

// ============ AUTO-APPROVE CHECK ============

/**
 * Get tasks in "review" status that should be auto-approved (>72h with no buyer action)
 */
export async function getTasksForAutoApproval(): Promise<Array<typeof schema.tasks.$inferSelect>> {
  const cutoff = new Date(Date.now() - AUTO_APPROVE_HOURS * 60 * 60 * 1000).toISOString();

  const reviewTasks = await db.query.tasks.findMany({
    where: eq(schema.tasks.status, "review"),
  });

  return reviewTasks.filter((task) => task.updatedAt < cutoff);
}

// ============ AUTO-RESOLVE CHECK ============

/**
 * Get disputes where response deadline has passed
 */
export async function getDisputesForAutoResolve(): Promise<Array<typeof schema.disputes.$inferSelect>> {
  const now = new Date().toISOString();

  const openDisputes = await db.query.disputes.findMany({
    where: eq(schema.disputes.status, "open"),
  });

  return openDisputes.filter((d) => d.responseDeadline && d.responseDeadline < now);
}

// ============ GET ABUSE HISTORY ============

export async function getAbuseHistory(walletAddress: string): Promise<Array<typeof schema.abuseLog.$inferSelect>> {
  const normalized = walletAddress.toLowerCase();

  return db.query.abuseLog.findMany({
    where: eq(schema.abuseLog.walletAddress, normalized),
  });
}

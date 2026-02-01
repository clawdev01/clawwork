/**
 * ClawWork Dispute Resolution System
 *
 * Evidence-based disputes with structured resolution outcomes.
 * Both buyer and agent can submit proof (text + links).
 * Auto-resolves if parties don't respond within deadlines.
 */

import { db, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { releaseEscrow, refundEscrow } from "./payments";
import { updateTrustScore } from "./trust-score";
import { logAbuse, checkDisputeRateLimit, checkDisputeCooldown, checkMinimumTaskHistory } from "./abuse-prevention";

// ============ TYPES ============

export type DisputeReason = "not_delivered" | "wrong_output" | "quality_issue" | "scam" | "other";
export type DisputeStatus = "open" | "reviewing" | "resolved";
export type DisputeResolution = "full_refund" | "partial_refund" | "agent_paid" | "split";

export interface Evidence {
  text: string;
  links: string[];
}

export interface RaiseDisputeParams {
  taskId: string;
  raisedBy: string; // agent id
  reason: DisputeReason;
  description?: string;
  evidence?: Evidence;
}

export interface ResolveDisputeParams {
  disputeId: string;
  resolution: DisputeResolution;
  refundPercentage?: number; // 0-100, used for partial_refund and split
  note?: string;
  resolvedBy: string; // admin id or "auto"
}

export interface SubmitEvidenceParams {
  disputeId: string;
  submittedBy: string; // agent id
  evidence: Evidence;
}

// ============ VALID REASONS ============

export const DISPUTE_REASONS: DisputeReason[] = [
  "not_delivered",
  "wrong_output",
  "quality_issue",
  "scam",
  "other",
];

export const DISPUTE_RESOLUTIONS: DisputeResolution[] = [
  "full_refund",
  "partial_refund",
  "agent_paid",
  "split",
];

// Response deadline: 48 hours
const RESPONSE_DEADLINE_MS = 48 * 60 * 60 * 1000;

// ============ RAISE DISPUTE ============

export async function raiseDispute(params: RaiseDisputeParams): Promise<{
  success: boolean;
  dispute?: typeof schema.disputes.$inferSelect;
  error?: string;
}> {
  const { taskId, raisedBy, reason, description, evidence } = params;
  const now = new Date().toISOString();

  // Validate reason
  if (!DISPUTE_REASONS.includes(reason)) {
    return { success: false, error: `Invalid reason. Must be one of: ${DISPUTE_REASONS.join(", ")}` };
  }

  // Get task
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
  if (!task) return { success: false, error: "Task not found" };

  // Can only dispute during in_progress or review
  if (!["in_progress", "review"].includes(task.status || "")) {
    return { success: false, error: "Task can only be disputed during in_progress or review status" };
  }

  // Must be poster or assigned agent
  const isBuyer = task.postedById === raisedBy;
  const isAgent = task.assignedAgentId === raisedBy;
  if (!isBuyer && !isAgent) {
    return { success: false, error: "Only the task poster or assigned agent can dispute" };
  }

  const role = isBuyer ? "buyer" : "agent";

  // Get wallet for abuse checks
  const raiserAgent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, raisedBy),
  });
  const wallet = raiserAgent?.walletAddress || raisedBy;

  // Check abuse prevention rules
  const rateLimitCheck = await checkDisputeRateLimit(raisedBy);
  if (!rateLimitCheck.allowed) {
    return { success: false, error: rateLimitCheck.reason };
  }

  const cooldownCheck = await checkDisputeCooldown(wallet);
  if (!cooldownCheck.allowed) {
    return { success: false, error: cooldownCheck.reason };
  }

  const historyCheck = await checkMinimumTaskHistory(raisedBy);
  if (!historyCheck.allowed) {
    return { success: false, error: historyCheck.reason };
  }

  // Check no existing open dispute for this task
  const existingDispute = await db.query.disputes.findFirst({
    where: and(
      eq(schema.disputes.taskId, taskId),
      inArray(schema.disputes.status, ["open", "reviewing"])
    ),
  });
  if (existingDispute) {
    return { success: false, error: "An active dispute already exists for this task" };
  }

  const responseDeadline = new Date(Date.now() + RESPONSE_DEADLINE_MS).toISOString();

  const disputeId = uuid();
  const disputeData = {
    id: disputeId,
    taskId,
    raisedBy,
    raisedByRole: role,
    reason,
    description: description || null,
    buyerEvidence: isBuyer && evidence ? JSON.stringify(evidence) : null,
    agentEvidence: isAgent && evidence ? JSON.stringify(evidence) : null,
    status: "open" as const,
    resolution: null,
    resolutionNote: null,
    refundPercentage: null,
    responseDeadline,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.disputes).values(disputeData);

  // Update task status
  await db.update(schema.tasks).set({
    status: "disputed",
    updatedAt: now,
  }).where(eq(schema.tasks.id, taskId));

  // Update trust score — mark dispute
  await updateTrustScore(wallet, role as "buyer" | "agent", { tasksDisputed: 1 });

  const dispute = await db.query.disputes.findFirst({
    where: eq(schema.disputes.id, disputeId),
  });

  return { success: true, dispute: dispute! };
}

// ============ SUBMIT EVIDENCE ============

export async function submitEvidence(params: SubmitEvidenceParams): Promise<{
  success: boolean;
  error?: string;
}> {
  const { disputeId, submittedBy, evidence } = params;
  const now = new Date().toISOString();

  const dispute = await db.query.disputes.findFirst({
    where: eq(schema.disputes.id, disputeId),
  });
  if (!dispute) return { success: false, error: "Dispute not found" };
  if (dispute.status === "resolved") return { success: false, error: "Dispute already resolved" };

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, dispute.taskId),
  });
  if (!task) return { success: false, error: "Task not found" };

  const isBuyer = task.postedById === submittedBy;
  const isAgent = task.assignedAgentId === submittedBy;
  if (!isBuyer && !isAgent) {
    return { success: false, error: "Only the task poster or assigned agent can submit evidence" };
  }

  const evidenceJson = JSON.stringify(evidence);
  const update: Record<string, unknown> = { updatedAt: now, status: "reviewing" };

  if (isBuyer) {
    update.buyerEvidence = evidenceJson;
  } else {
    update.agentEvidence = evidenceJson;
  }

  await db.update(schema.disputes).set(update).where(eq(schema.disputes.id, disputeId));

  return { success: true };
}

// ============ RESOLVE DISPUTE ============

export async function resolveDispute(params: ResolveDisputeParams): Promise<{
  success: boolean;
  error?: string;
  paymentResult?: Record<string, unknown>;
}> {
  const { disputeId, resolution, refundPercentage, note, resolvedBy } = params;
  const now = new Date().toISOString();

  if (!DISPUTE_RESOLUTIONS.includes(resolution)) {
    return { success: false, error: `Invalid resolution. Must be one of: ${DISPUTE_RESOLUTIONS.join(", ")}` };
  }

  const dispute = await db.query.disputes.findFirst({
    where: eq(schema.disputes.id, disputeId),
  });
  if (!dispute) return { success: false, error: "Dispute not found" };
  if (dispute.status === "resolved") return { success: false, error: "Dispute already resolved" };

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, dispute.taskId),
  });
  if (!task) return { success: false, error: "Task not found" };

  // Get buyer and agent info
  const buyer = await db.query.agents.findFirst({
    where: eq(schema.agents.id, task.postedById),
  });
  const agent = task.assignedAgentId
    ? await db.query.agents.findFirst({ where: eq(schema.agents.id, task.assignedAgentId) })
    : null;

  let paymentResult: Record<string, unknown> = {};

  // Execute financial resolution
  switch (resolution) {
    case "full_refund": {
      if (buyer?.walletAddress) {
        const result = await refundEscrow(task.id, buyer.walletAddress, task.budgetUsdc);
        paymentResult = { type: "full_refund", ...result };
      }
      // Buyer wins dispute
      if (buyer?.walletAddress) {
        await updateTrustScore(buyer.walletAddress, "buyer", { disputesWon: 1 });
      }
      if (agent?.walletAddress) {
        await updateTrustScore(agent.walletAddress, "agent", { disputesLost: 1 });
        await logAbuse(agent.walletAddress, "lost_dispute", `Lost dispute on task ${task.id}`, "warning");
      }
      break;
    }
    case "partial_refund": {
      const pct = refundPercentage || 50;
      const refundAmount = task.budgetUsdc * (pct / 100);
      const agentAmount = task.budgetUsdc - refundAmount;

      if (buyer?.walletAddress && refundAmount > 0) {
        await refundEscrow(task.id, buyer.walletAddress, refundAmount);
      }
      if (agent?.walletAddress && agentAmount > 0) {
        await releaseEscrow(task.id, agent.walletAddress, agentAmount);
      }
      paymentResult = { type: "partial_refund", refundPercentage: pct, refundAmount, agentAmount };
      break;
    }
    case "agent_paid": {
      if (agent?.walletAddress) {
        const result = await releaseEscrow(task.id, agent.walletAddress, task.budgetUsdc);
        paymentResult = { type: "agent_paid", ...result };
      }
      // Agent wins dispute
      if (agent?.walletAddress) {
        await updateTrustScore(agent.walletAddress, "agent", { disputesWon: 1 });
      }
      if (buyer?.walletAddress) {
        await updateTrustScore(buyer.walletAddress, "buyer", { disputesLost: 1 });
        await logAbuse(buyer.walletAddress, "lost_dispute", `Lost dispute on task ${task.id}`, "warning");
      }
      break;
    }
    case "split": {
      const splitPct = refundPercentage || 50; // buyer gets this %, agent gets rest
      const buyerAmount = task.budgetUsdc * (splitPct / 100);
      const agentAmount = task.budgetUsdc - buyerAmount;

      if (buyer?.walletAddress && buyerAmount > 0) {
        await refundEscrow(task.id, buyer.walletAddress, buyerAmount);
      }
      if (agent?.walletAddress && agentAmount > 0) {
        await releaseEscrow(task.id, agent.walletAddress, agentAmount);
      }
      paymentResult = { type: "split", buyerAmount, agentAmount, splitPercentage: splitPct };
      break;
    }
  }

  // Update dispute status
  await db.update(schema.disputes).set({
    status: "resolved",
    resolution,
    resolutionNote: note || null,
    refundPercentage: refundPercentage || null,
    resolvedAt: now,
    resolvedBy,
    updatedAt: now,
  }).where(eq(schema.disputes.id, disputeId));

  // Update task status based on resolution
  const newTaskStatus = resolution === "agent_paid" ? "completed" : "cancelled";
  await db.update(schema.tasks).set({
    status: newTaskStatus,
    updatedAt: now,
  }).where(eq(schema.tasks.id, task.id));

  return { success: true, paymentResult };
}

// ============ GET DISPUTE ============

export async function getDispute(disputeId: string) {
  return db.query.disputes.findFirst({
    where: eq(schema.disputes.id, disputeId),
  });
}

// ============ GET DISPUTES FOR TASK ============

export async function getDisputesForTask(taskId: string) {
  return db.query.disputes.findMany({
    where: eq(schema.disputes.taskId, taskId),
  });
}

// ============ GET ACTIVE DISPUTES FOR USER ============

export async function getActiveDisputesForUser(userId: string) {
  return db.query.disputes.findMany({
    where: and(
      eq(schema.disputes.raisedBy, userId),
      inArray(schema.disputes.status, ["open", "reviewing"])
    ),
  });
}

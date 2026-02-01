/**
 * ClawWork Auto-Resolution System
 *
 * Handles automatic approval and dispute resolution based on deadlines:
 * - Tasks in "review" for >72h with no buyer action → auto-approve payment to agent
 * - Disputes where response deadline passed → resolve in favor of responding party
 */

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { releaseEscrow } from "./payments";
import { updateTrustScore } from "./trust-score";
import { getTasksForAutoApproval, getDisputesForAutoResolve } from "./abuse-prevention";
import { resolveDispute } from "./disputes";

// ============ AUTO-APPROVE STALE REVIEWS ============

export interface AutoApproveResult {
  processed: number;
  approved: number;
  errors: Array<{ taskId: string; error: string }>;
}

/**
 * Auto-approve tasks that have been in "review" status for >72h
 * with no buyer action. Releases escrow to the agent.
 */
export async function autoApproveStaleTasks(): Promise<AutoApproveResult> {
  const result: AutoApproveResult = { processed: 0, approved: 0, errors: [] };

  const staleTasks = await getTasksForAutoApproval();
  result.processed = staleTasks.length;

  for (const task of staleTasks) {
    try {
      const now = new Date().toISOString();

      // Get assigned agent
      if (!task.assignedAgentId) {
        result.errors.push({ taskId: task.id, error: "No assigned agent" });
        continue;
      }

      const agent = await db.query.agents.findFirst({
        where: eq(schema.agents.id, task.assignedAgentId),
      });

      if (!agent) {
        result.errors.push({ taskId: task.id, error: "Agent not found" });
        continue;
      }

      // Release escrow if agent has a wallet
      if (agent.walletAddress && task.escrowTxHash) {
        const release = await releaseEscrow(task.id, agent.walletAddress, task.budgetUsdc);
        if (!release.success) {
          result.errors.push({ taskId: task.id, error: `Escrow release failed: ${release.error}` });
          // Still mark as completed even if on-chain fails (will be pending)
        }
      }

      // Mark task as completed
      await db.update(schema.tasks).set({
        status: "completed",
        updatedAt: now,
      }).where(eq(schema.tasks.id, task.id));

      // Update agent stats
      const { calculateFees } = await import("./crypto");
      const fees = calculateFees(task.budgetUsdc);

      await db.update(schema.agents).set({
        tasksCompleted: (agent.tasksCompleted || 0) + 1,
        totalEarnedUsdc: (agent.totalEarnedUsdc || 0) + fees.agentPayout,
        updatedAt: now,
      }).where(eq(schema.agents.id, agent.id));

      // Update trust scores
      if (agent.walletAddress) {
        await updateTrustScore(agent.walletAddress, "agent", {
          tasksCompleted: 1,
          volumeUsdc: fees.agentPayout,
        });
      }

      // Update buyer trust score
      const buyer = await db.query.agents.findFirst({
        where: eq(schema.agents.id, task.postedById),
      });
      if (buyer?.walletAddress) {
        await updateTrustScore(buyer.walletAddress, "buyer", {
          tasksCompleted: 1,
          volumeUsdc: task.budgetUsdc,
        });
      }

      result.approved++;
    } catch (error: any) {
      result.errors.push({ taskId: task.id, error: error.message || "Unknown error" });
    }
  }

  return result;
}

// ============ AUTO-RESOLVE STALE DISPUTES ============

export interface AutoResolveDisputeResult {
  processed: number;
  resolved: number;
  errors: Array<{ disputeId: string; error: string }>;
}

/**
 * Auto-resolve disputes where the response deadline has passed.
 * If buyer raised dispute and agent didn't respond → full refund to buyer
 * If agent raised dispute and buyer didn't respond → agent gets paid
 */
export async function autoResolveStaleDisputes(): Promise<AutoResolveDisputeResult> {
  const result: AutoResolveDisputeResult = { processed: 0, resolved: 0, errors: [] };

  const staleDisputes = await getDisputesForAutoResolve();
  result.processed = staleDisputes.length;

  for (const dispute of staleDisputes) {
    try {
      // Determine who didn't respond
      const raisedByBuyer = dispute.raisedByRole === "buyer";

      // If buyer raised and agent didn't respond → buyer wins (full refund)
      // If agent raised and buyer didn't respond → agent wins (agent paid)
      // But also check: if raised by buyer and agent didn't submit evidence, buyer wins
      const agentResponded = !!dispute.agentEvidence;
      const buyerResponded = !!dispute.buyerEvidence;

      let resolution: "full_refund" | "agent_paid";

      if (raisedByBuyer) {
        // Buyer raised — did agent respond?
        resolution = agentResponded ? "agent_paid" : "full_refund";
      } else {
        // Agent raised — did buyer respond?
        resolution = buyerResponded ? "full_refund" : "agent_paid";
      }

      const resolveResult = await resolveDispute({
        disputeId: dispute.id,
        resolution,
        note: `Auto-resolved: response deadline passed. Non-responding party loses.`,
        resolvedBy: "auto",
      });

      if (resolveResult.success) {
        result.resolved++;
      } else {
        result.errors.push({ disputeId: dispute.id, error: resolveResult.error || "Unknown" });
      }
    } catch (error: any) {
      result.errors.push({ disputeId: dispute.id, error: error.message || "Unknown error" });
    }
  }

  return result;
}

// ============ RUN ALL AUTO-RESOLUTIONS ============

export async function runAutoResolution(): Promise<{
  tasks: AutoApproveResult;
  disputes: AutoResolveDisputeResult;
  timestamp: string;
}> {
  const tasks = await autoApproveStaleTasks();
  const disputes = await autoResolveStaleDisputes();

  return {
    tasks,
    disputes,
    timestamp: new Date().toISOString(),
  };
}

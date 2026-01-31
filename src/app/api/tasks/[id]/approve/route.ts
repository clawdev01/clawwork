import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { calculateFees } from "@/lib/crypto";
import { releaseEscrow } from "@/lib/payments";
import { eq } from "drizzle-orm";

/**
 * POST /api/tasks/:id/approve
 * 
 * Poster approves completed work → triggers USDC payment to agent.
 * Platform executes the on-chain transfer and pays gas.
 * Agent receives USDC minus 8% platform fee.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);
    if (task.status !== "review") return jsonError("Task must be in review to approve", 400);
    if (task.postedById !== agent.id) return jsonError("Only the task poster can approve", 403);

    const now = new Date().toISOString();

    // Get assigned agent details
    const assignedAgent = task.assignedAgentId
      ? await db.query.agents.findFirst({ where: eq(schema.agents.id, task.assignedAgentId) })
      : null;

    if (!assignedAgent) {
      return jsonError("No assigned agent found for this task", 400);
    }

    const fees = calculateFees(task.budgetUsdc);

    // Attempt on-chain escrow release if agent has a wallet and escrow was deposited
    let paymentResult: { onChain: boolean; txHash?: string; error?: string } = { onChain: false };

    if (assignedAgent.walletAddress && task.escrowTxHash) {
      // Real on-chain payment — platform pays gas
      const release = await releaseEscrow(id, assignedAgent.walletAddress, task.budgetUsdc);

      if (release.success) {
        paymentResult = { onChain: true, txHash: release.txHash };
      } else {
        // Payment failed but we still mark task completed
        // Record the failure, handle manually
        paymentResult = { onChain: false, error: release.error };
        console.error(`Escrow release failed for task ${id}:`, release.error);
      }
    }

    // Mark task completed
    await db.update(schema.tasks).set({
      status: "completed",
      completionTxHash: paymentResult.txHash || task.completionTxHash,
      updatedAt: now,
    }).where(eq(schema.tasks.id, id));

    // Update agent stats
    await db.update(schema.agents).set({
      tasksCompleted: (assignedAgent.tasksCompleted || 0) + 1,
      totalEarnedUsdc: (assignedAgent.totalEarnedUsdc || 0) + fees.agentPayout,
      updatedAt: now,
    }).where(eq(schema.agents.id, assignedAgent.id));

    // If on-chain payment wasn't done (no wallet or no escrow), record intent
    if (!paymentResult.onChain && !paymentResult.txHash) {
      const { v4: uuidv4 } = await import("uuid");
      await db.insert(schema.transactions).values({
        id: uuidv4(),
        taskId: id,
        fromAddress: "escrow",
        toAddress: assignedAgent.walletAddress || "pending",
        amountUsdc: fees.agentPayout,
        chain: "base",
        type: "escrow_release",
        status: paymentResult.error ? "failed" : "pending",
        createdAt: now,
      });
    }

    return jsonSuccess({
      task: { id, status: "completed" },
      payment: {
        agentPayout: fees.agentPayout,
        platformFee: fees.platformFee,
        total: task.budgetUsdc,
        onChain: paymentResult.onChain,
        txHash: paymentResult.txHash,
        gasPaidByPlatform: true,
        error: paymentResult.error,
      },
    });

  } catch (error) {
    console.error("Approve task error:", error);
    return jsonError("Internal server error", 500);
  }
}

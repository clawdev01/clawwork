import { db, schema } from "@/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { authenticate } from "@/lib/unified-auth";
import { calculateFees } from "@/lib/crypto";
import { releaseEscrow } from "@/lib/payments";
import { notifyPaymentReceived } from "@/lib/matching";
import { sendPaymentReceivedEmail } from "@/lib/email";
import { updateTrustScore } from "@/lib/trust-score";
import { checkDrainComplete } from "@/lib/drain";
import { eq } from "drizzle-orm";

/**
 * POST /api/tasks/:id/approve
 * 
 * Poster approves completed work → triggers USDC payment to agent.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const auth = await authenticate(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const callerId = auth.type === "agent" ? auth.agentId! : auth.userId!;

    const body = await request.json().catch(() => ({}));

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);
    if (task.status !== "review") return jsonError("Task must be in review to approve", 400);
    if (task.postedById !== callerId) return jsonError("Only the task poster can approve", 403);

    // Fetch agent record if caller is an agent (needed for wallet-based trust scoring below)
    const agent = auth.type === "agent"
      ? await db.query.agents.findFirst({ where: eq(schema.agents.id, auth.agentId!) })
      : null;

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
      const release = await releaseEscrow(id, assignedAgent.walletAddress, task.budgetUsdc);
      if (release.success) {
        paymentResult = { onChain: true, txHash: release.txHash };
      } else {
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

    // Auto-flip draining agents to inactive when no active tasks remain
    const drainFlipped = await checkDrainComplete(assignedAgent.id);

    // Record transaction if on-chain payment wasn't done
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

    // 📊 UPDATE TRUST SCORES
    if (assignedAgent.walletAddress) {
      updateTrustScore(assignedAgent.walletAddress, "agent", {
        tasksCompleted: 1,
        volumeUsdc: fees.agentPayout,
      }).catch((err) => console.error("Trust score update error (agent):", err));
    }
    // Update buyer trust score
    const buyerWallet = auth.walletAddress || (agent?.walletAddress ?? null);
    if (buyerWallet) {
      updateTrustScore(buyerWallet, "buyer", {
        tasksCompleted: 1,
        volumeUsdc: task.budgetUsdc,
      }).catch((err) => console.error("Trust score update error (buyer):", err));
    }

    // Notify agent about payment
    if (task.assignedAgentId) {
      notifyPaymentReceived(id, task.assignedAgentId, fees.agentPayout).catch((err) =>
        console.error("Payment notification error:", err)
      );
    }

    // Send payment email to agent
    if (assignedAgent?.email) {
      sendPaymentReceivedEmail(assignedAgent.email, task.title, fees.agentPayout).catch((err) =>
        console.error("Payment email error:", err)
      );
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
      ...(drainFlipped ? { agentStatus: "inactive", agentDrainComplete: true } : {}),
    });

  } catch (error) {
    console.error("Approve task error:", error);
    return jsonError("Internal server error", 500);
  }
}

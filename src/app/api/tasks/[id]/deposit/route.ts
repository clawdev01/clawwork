import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { verifyUsdcTransfer, getPlatformWallet, calculateFees } from "@/lib/crypto";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";

// POST /api/tasks/:id/deposit — Verify escrow deposit for a task
// After accepting a bid, the poster sends USDC to the platform wallet
// Then calls this endpoint with the tx hash for on-chain verification
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);

    // Task must be in_progress (bid accepted) and poster must be calling
    if (task.status !== "in_progress") {
      return jsonError("Task must be in_progress (bid accepted) to deposit escrow", 400);
    }
    if (task.postedById !== agent.id) {
      return jsonError("Only the task poster can submit escrow deposit", 403);
    }
    if (task.escrowTxHash) {
      return jsonError("Escrow already deposited for this task", 409);
    }

    const body = await request.json();
    const { txHash } = body;

    if (!txHash || typeof txHash !== "string") {
      return jsonError("'txHash' is required", 400);
    }

    // Verify the USDC transfer on-chain
    const platformWallet = getPlatformWallet();
    const verification = await verifyUsdcTransfer(
      txHash,
      agent.walletAddress || "",
      platformWallet,
      task.budgetUsdc
    );

    const now = new Date().toISOString();

    if (verification.verified) {
      // Update task with escrow tx
      await db.update(schema.tasks).set({
        escrowTxHash: txHash,
        updatedAt: now,
      }).where(eq(schema.tasks.id, id));

      // Record transaction
      const fees = calculateFees(task.budgetUsdc);
      await db.insert(schema.transactions).values({
        id: uuid(),
        taskId: id,
        fromAddress: agent.walletAddress || "unknown",
        toAddress: platformWallet,
        amountUsdc: task.budgetUsdc,
        txHash,
        chain: "base",
        type: "escrow_deposit",
        status: "confirmed",
        createdAt: now,
      });

      return jsonSuccess({
        verified: true,
        escrow: {
          txHash,
          amount: task.budgetUsdc,
          breakdown: fees,
          platformWallet,
        },
        message: "Escrow deposit verified on-chain. Funds are locked until task completion.",
      });
    } else {
      // Could not verify — maybe tx is still pending or doesn't match
      return jsonSuccess({
        verified: false,
        message: "Could not verify the transaction on-chain. It may still be pending. Please try again in a few minutes.",
        expected: {
          from: agent.walletAddress,
          to: platformWallet,
          amount: task.budgetUsdc,
          chain: "base",
        },
      });
    }
  } catch (error) {
    console.error("Deposit verification error:", error);
    return jsonError("Internal server error", 500);
  }
}

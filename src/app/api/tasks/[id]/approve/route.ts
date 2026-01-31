import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";

// POST /api/tasks/:id/approve — Poster approves completed work → triggers payment
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

    // Mark task completed
    await db.update(schema.tasks).set({ status: "completed", updatedAt: now }).where(eq(schema.tasks.id, id));

    // Update assigned agent stats
    if (task.assignedAgentId) {
      const assignedAgent = await db.query.agents.findFirst({
        where: eq(schema.agents.id, task.assignedAgentId),
      });
      if (assignedAgent) {
        const platformFee = task.budgetUsdc * 0.08; // 8% fee
        const agentPayout = task.budgetUsdc - platformFee;

        await db.update(schema.agents).set({
          tasksCompleted: (assignedAgent.tasksCompleted || 0) + 1,
          totalEarnedUsdc: (assignedAgent.totalEarnedUsdc || 0) + agentPayout,
          updatedAt: now,
        }).where(eq(schema.agents.id, task.assignedAgentId));

        // TODO: Trigger actual USDC transfer from escrow to agent wallet
        // For now, just record the transaction intent
        const { v4: uuid } = await import("uuid");
        await db.insert(schema.transactions).values({
          id: uuid(),
          taskId: id,
          fromAddress: "escrow", // placeholder until real escrow
          toAddress: assignedAgent.walletAddress || "unknown",
          amountUsdc: agentPayout,
          chain: "base",
          type: "escrow_release",
          status: "pending", // will be "confirmed" once on-chain
          createdAt: now,
        });

        return jsonSuccess({
          task: { id, status: "completed" },
          payment: {
            agentPayout,
            platformFee,
            total: task.budgetUsdc,
            status: "pending", // TODO: "confirmed" after on-chain tx
          },
        });
      }
    }

    return jsonSuccess({ task: { id, status: "completed" } });
  } catch (error) {
    console.error("Approve task error:", error);
    return jsonError("Internal server error", 500);
  }
}

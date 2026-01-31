import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { notifyBidAccepted } from "@/lib/matching";
import { eq, and, ne } from "drizzle-orm";

// POST /api/tasks/:id/accept — Accept a bid
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) {
      return jsonError("Unauthorized", 401);
    }

    // Check task exists
    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) {
      return jsonError("Task not found", 404);
    }

    // Only task poster can accept bids
    if (task.postedById !== agent.id) {
      return jsonError("Only the task poster can accept bids", 403);
    }
    if (task.status !== "open") {
      return jsonError("Task is not open", 400);
    }

    const body = await request.json();
    const { bidId } = body;
    if (!bidId) {
      return jsonError("'bidId' is required", 400);
    }

    // Find the bid
    const bid = await db.query.bids.findFirst({
      where: and(eq(schema.bids.id, bidId), eq(schema.bids.taskId, id)),
    });
    if (!bid) {
      return jsonError("Bid not found", 404);
    }
    if (bid.status !== "pending") {
      return jsonError("Bid is not pending", 400);
    }

    const now = new Date().toISOString();

    // Accept the bid
    await db.update(schema.bids).set({ status: "accepted" }).where(eq(schema.bids.id, bidId));

    // Reject all other bids
    await db
      .update(schema.bids)
      .set({ status: "rejected" })
      .where(and(eq(schema.bids.taskId, id), ne(schema.bids.id, bidId)));

    // Update task
    await db
      .update(schema.tasks)
      .set({ status: "in_progress", assignedAgentId: bid.agentId, updatedAt: now })
      .where(eq(schema.tasks.id, id));

    // Notify the agent via webhook + in-app notification
    notifyBidAccepted(id, bidId, bid.agentId).catch((err) =>
      console.error("Bid notification error:", err)
    );

    return jsonSuccess({
      task: { id, status: "in_progress", assignedAgentId: bid.agentId },
      acceptedBid: { id: bidId, amountUsdc: bid.amountUsdc },
    });
  } catch (error) {
    console.error("Accept bid error:", error);
    return jsonError("Internal server error", 500);
  }
}

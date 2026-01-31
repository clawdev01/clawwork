import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";

// POST /api/tasks/:id/review — Leave a review for the assigned agent
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);
    if (task.status !== "completed") return jsonError("Can only review completed tasks", 400);
    if (task.postedById !== agent.id) return jsonError("Only the task poster can leave a review", 403);
    if (!task.assignedAgentId) return jsonError("No agent assigned to this task", 400);

    // Check for existing review
    const existing = await db.query.reviews.findFirst({
      where: and(
        eq(schema.reviews.taskId, id),
        eq(schema.reviews.reviewerId, agent.id)
      ),
    });
    if (existing) return jsonError("You already reviewed this task", 409);

    const body = await request.json();
    const { rating, comment } = body;

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return jsonError("'rating' must be 1-5", 400);
    }

    const now = new Date().toISOString();
    const reviewId = uuid();

    await db.insert(schema.reviews).values({
      id: reviewId,
      taskId: id,
      reviewerId: agent.id,
      reviewerType: "agent",
      agentId: task.assignedAgentId,
      rating,
      comment: comment || null,
      createdAt: now,
    });

    // Recalculate agent reputation score (average of all reviews)
    const allReviews = await db
      .select({ rating: schema.reviews.rating })
      .from(schema.reviews)
      .where(eq(schema.reviews.agentId, task.assignedAgentId));

    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    const reputationScore = Math.round(avgRating * 20); // 1-5 → 20-100

    await db.update(schema.agents).set({
      reputationScore,
      updatedAt: now,
    }).where(eq(schema.agents.id, task.assignedAgentId));

    return jsonSuccess({
      review: { id: reviewId, rating, agentId: task.assignedAgentId },
      newReputationScore: reputationScore,
    }, 201);
  } catch (error) {
    console.error("Review error:", error);
    return jsonError("Internal server error", 500);
  }
}

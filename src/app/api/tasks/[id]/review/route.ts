import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { checkReviewFraud, calculateWeightedReputation } from "@/lib/anti-fraud";
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

    // 🛡️ FRAUD CHECK — run before accepting the review
    const fraudCheck = await checkReviewFraud(agent.id, task.assignedAgentId, id);

    if (!fraudCheck.passed) {
      return jsonError(
        `Review blocked by fraud detection (risk score: ${fraudCheck.riskScore}/100). ` +
        `Flags: ${fraudCheck.flags.map((f) => f.message).join("; ")}`,
        403
      );
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

    // 🛡️ WEIGHTED REPUTATION — fraud-resistant scoring
    const rep = await calculateWeightedReputation(task.assignedAgentId);

    await db.update(schema.agents).set({
      reputationScore: rep.score,
      updatedAt: now,
    }).where(eq(schema.agents.id, task.assignedAgentId));

    const response: Record<string, unknown> = {
      review: { id: reviewId, rating, agentId: task.assignedAgentId },
      reputation: {
        newScore: rep.score,
        totalReviews: rep.totalReviews,
        weightedAverage: rep.weightedAverage,
        flaggedReviews: rep.flaggedReviews,
      },
    };

    // Include fraud warnings if any (but still allowed through)
    if (fraudCheck.flags.length > 0) {
      response.warnings = fraudCheck.flags.map((f) => ({
        type: f.type,
        severity: f.severity,
        message: f.message,
      }));
    }

    return jsonSuccess(response, 201);
  } catch (error) {
    console.error("Review error:", error);
    return jsonError("Internal server error", 500);
  }
}

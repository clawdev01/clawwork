import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";

// POST /api/tasks/:id/complete — Agent marks task as complete (moves to review)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);
    if (task.status !== "in_progress") return jsonError("Task must be in_progress to complete", 400);
    if (task.assignedAgentId !== agent.id) return jsonError("Only the assigned agent can mark as complete", 403);

    const now = new Date().toISOString();
    await db.update(schema.tasks).set({ status: "review", updatedAt: now }).where(eq(schema.tasks.id, id));

    return jsonSuccess({ task: { id, status: "review" }, message: "Task submitted for review. Waiting for poster approval." });
  } catch (error) {
    console.error("Complete task error:", error);
    return jsonError("Internal server error", 500);
  }
}

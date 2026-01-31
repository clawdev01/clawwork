import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";

// POST /api/tasks/:id/cancel — Cancel an open task (poster only)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);
    if (task.postedById !== agent.id) return jsonError("Only the task poster can cancel", 403);

    // Can only cancel if open (no work started)
    if (task.status !== "open") {
      return jsonError("Can only cancel open tasks. Use /dispute for in-progress tasks.", 400);
    }

    const now = new Date().toISOString();
    await db.update(schema.tasks).set({ status: "cancelled", updatedAt: now }).where(eq(schema.tasks.id, id));

    return jsonSuccess({ task: { id, status: "cancelled" }, message: "Task cancelled." });
  } catch (error) {
    console.error("Cancel task error:", error);
    return jsonError("Internal server error", 500);
  }
}

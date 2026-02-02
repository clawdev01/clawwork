import { db, schema } from "@/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { authenticate } from "@/lib/unified-auth";
import { eq } from "drizzle-orm";

// POST /api/tasks/:id/cancel — Cancel an open task (poster only)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const auth = await authenticate(request);
    if (!auth) return jsonError("Unauthorized. Use API key or connect wallet.", 401);

    const callerId = auth.type === "agent" ? auth.agentId! : auth.type === "client" ? auth.clientId! : auth.userId!;

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);
    if (task.postedById !== callerId) return jsonError("Only the task poster can cancel", 403);

    // Can only cancel if open or in_progress (no delivery yet)
    if (!["open", "in_progress"].includes(task.status || "")) {
      return jsonError("Can only cancel open or in-progress tasks. Use /dispute for tasks in review.", 400);
    }

    const now = new Date().toISOString();
    await db.update(schema.tasks).set({ status: "cancelled", updatedAt: now }).where(eq(schema.tasks.id, id));

    return jsonSuccess({ task: { id, status: "cancelled" }, message: "Task cancelled." });
  } catch (error) {
    console.error("Cancel task error:", error);
    return jsonError("Internal server error", 500);
  }
}

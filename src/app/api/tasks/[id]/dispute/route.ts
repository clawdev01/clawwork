import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";

// POST /api/tasks/:id/dispute — Either party can dispute
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);

    // Can dispute during in_progress or review
    if (!["in_progress", "review"].includes(task.status || "")) {
      return jsonError("Task can only be disputed during in_progress or review", 400);
    }

    // Must be poster or assigned agent
    if (task.postedById !== agent.id && task.assignedAgentId !== agent.id) {
      return jsonError("Only the task poster or assigned agent can dispute", 403);
    }

    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "No reason provided";

    const now = new Date().toISOString();
    await db.update(schema.tasks).set({ status: "disputed", updatedAt: now }).where(eq(schema.tasks.id, id));

    // TODO: Implement dispute resolution system
    // For MVP, disputes are flagged for manual review

    return jsonSuccess({
      task: { id, status: "disputed" },
      message: "Task disputed. Escrow funds are frozen pending resolution.",
      disputedBy: agent.name,
      reason,
    });
  } catch (error) {
    console.error("Dispute task error:", error);
    return jsonError("Internal server error", 500);
  }
}

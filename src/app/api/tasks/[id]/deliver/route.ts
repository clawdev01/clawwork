import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { sendWebhook, createNotification } from "@/lib/matching";
import { eq } from "drizzle-orm";

// POST /api/tasks/:id/deliver — Agent submits deliverables (moves to review)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);
    if (task.status !== "in_progress") return jsonError("Task must be in_progress to deliver", 400);
    if (task.assignedAgentId !== agent.id) return jsonError("Only the assigned agent can deliver", 403);

    const body = await request.json().catch(() => ({}));
    const { output, outputUrl, outputNotes } = body as {
      output?: Record<string, unknown>;
      outputUrl?: string;
      outputNotes?: string;
    };

    if (!output && !outputUrl && !outputNotes) {
      return jsonError("At least one of 'output', 'outputUrl', or 'outputNotes' is required", 400);
    }

    const deliverables = JSON.stringify({
      output: output || null,
      outputUrl: outputUrl || null,
      outputNotes: outputNotes || null,
      deliveredAt: new Date().toISOString(),
    });

    const now = new Date().toISOString();
    await db.update(schema.tasks).set({
      deliverables,
      status: "review",
      updatedAt: now,
    }).where(eq(schema.tasks.id, id));

    // Notify poster about delivery
    const posterAgent = await db.query.agents.findFirst({
      where: eq(schema.agents.id, task.postedById),
    });

    // Re-fetch task for notification helper
    const updatedTask = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });

    if (posterAgent?.webhookUrl && updatedTask) {
      sendWebhook(posterAgent, "task_delivered", {
        taskId: id,
        title: task.title,
        budgetUsdc: task.budgetUsdc,
        deliverables: { output, outputUrl, outputNotes },
        assignedAgentId: agent.id,
        assignedAgentName: agent.displayName || agent.name,
      }).catch((err) => console.error("Deliver webhook error:", err));
    }

    if (posterAgent && updatedTask) {
      createNotification(
        posterAgent.id,
        "task_delivered",
        updatedTask,
        `${agent.displayName || agent.name} delivered work on "${task.title}" — ready for review.`
      ).catch((err) => console.error("Deliver notification error:", err));
    }

    return jsonSuccess({
      task: { id, status: "review" },
      message: "Deliverables submitted. Task moved to review.",
    });
  } catch (error) {
    console.error("Deliver task error:", error);
    return jsonError("Internal server error", 500);
  }
}

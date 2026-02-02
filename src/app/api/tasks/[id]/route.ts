import { db, schema } from "@/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { parseInputSchema } from "@/lib/input-schema";

// GET /api/tasks/:id — Get order details with assigned agent info
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });

    if (!task) {
      return jsonError("Task not found", 404);
    }

    // Include assigned agent info
    let assignedAgent = null;
    let inputSchema = null;
    if (task.assignedAgentId) {
      const agent = await db.query.agents.findFirst({
        where: eq(schema.agents.id, task.assignedAgentId),
      });
      if (agent) {
        assignedAgent = {
          id: agent.id,
          name: agent.name,
          displayName: agent.displayName,
          reputation: agent.reputationScore,
          tasksCompleted: agent.tasksCompleted,
        };
        inputSchema = parseInputSchema(agent.inputSchema);
      }
    }

    // Include poster info
    const poster = await db.query.agents.findFirst({
      where: eq(schema.agents.id, task.postedById),
    });

    return jsonSuccess({
      task: {
        ...task,
        requiredSkills: JSON.parse(task.requiredSkills || "[]"),
        taskInputs: task.taskInputs ? JSON.parse(task.taskInputs) : null,
        additionalNotes: task.additionalNotes,
        deliverables: task.deliverables ? JSON.parse(task.deliverables) : null,
      },
      assignedAgent,
      inputSchema,
      poster: poster ? {
        id: poster.id,
        name: poster.name,
        displayName: poster.displayName,
        reputation: poster.reputationScore,
      } : null,
    });
  } catch (error) {
    console.error("Get task error:", error);
    return jsonError("Internal server error", 500);
  }
}

import { db, schema } from "@/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";

// GET /api/tasks/:id — Get task details with bids and assigned agent info
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });

    if (!task) {
      return jsonError("Task not found", 404);
    }

    // Include bids with agent info
    const bids = await db
      .select({
        id: schema.bids.id,
        agentId: schema.bids.agentId,
        amountUsdc: schema.bids.amountUsdc,
        proposal: schema.bids.proposal,
        estimatedHours: schema.bids.estimatedHours,
        status: schema.bids.status,
        autoBid: schema.bids.autoBid,
        createdAt: schema.bids.createdAt,
        agentName: schema.agents.name,
        agentDisplayName: schema.agents.displayName,
        agentReputation: schema.agents.reputationScore,
      })
      .from(schema.bids)
      .leftJoin(schema.agents, eq(schema.bids.agentId, schema.agents.id))
      .where(eq(schema.bids.taskId, id));

    // Include assigned agent info if task is in progress
    let assignedAgent = null;
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
      bids,
      assignedAgent,
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

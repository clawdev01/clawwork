import { db, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Check if a draining agent has finished all active tasks.
 * If so, auto-flip their status from "draining" to "inactive".
 *
 * Call this after any task completion/approval for the assigned agent.
 * Returns true if the agent was flipped to inactive.
 */
export async function checkDrainComplete(agentId: string): Promise<boolean> {
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.id, agentId),
  });

  if (!agent || agent.status !== "draining") return false;

  // Count remaining in_progress or review tasks assigned to this agent
  const remaining = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.assignedAgentId, agentId),
      inArray(schema.tasks.status, ["in_progress", "review"])
    ),
  });

  if (remaining.length === 0) {
    await db
      .update(schema.agents)
      .set({ status: "inactive", updatedAt: new Date().toISOString() })
      .where(eq(schema.agents.id, agentId));
    return true;
  }

  return false;
}

/**
 * Count in_progress + review tasks for an agent.
 */
export async function countActiveTasks(agentId: string): Promise<number> {
  const tasks = await db.query.tasks.findMany({
    where: and(
      eq(schema.tasks.assignedAgentId, agentId),
      inArray(schema.tasks.status, ["in_progress", "review"])
    ),
  });
  return tasks.length;
}

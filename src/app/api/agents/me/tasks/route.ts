export const dynamic = "force-dynamic";

import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";

/**
 * GET /api/agents/me/tasks — Poll for your tasks
 * 
 * Query params:
 *   status: "in_progress" | "review" | "completed" | "all" (default: "in_progress")
 *   limit: number (default: 10, max: 50)
 * 
 * This is the polling alternative to webhooks.
 * Agents can call this periodically to check for new tasks assigned to them.
 */
export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "in_progress";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 50);

    const conditions = [eq(schema.tasks.assignedAgentId, agent.id)];

    if (status !== "all") {
      conditions.push(eq(schema.tasks.status, status));
    }

    const tasks = await db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        description: schema.tasks.description,
        category: schema.tasks.category,
        budgetUsdc: schema.tasks.budgetUsdc,
        status: schema.tasks.status,
        taskInputs: schema.tasks.taskInputs,
        additionalNotes: schema.tasks.additionalNotes,
        deliverables: schema.tasks.deliverables,
        deadline: schema.tasks.deadline,
        createdAt: schema.tasks.createdAt,
        updatedAt: schema.tasks.updatedAt,
      })
      .from(schema.tasks)
      .where(and(...conditions))
      .orderBy(desc(schema.tasks.createdAt))
      .limit(limit);

    // Parse JSON fields
    const parsed = tasks.map((t) => ({
      ...t,
      taskInputs: t.taskInputs ? JSON.parse(t.taskInputs) : null,
    }));

    return jsonSuccess({ tasks: parsed, total: parsed.length });
  } catch (error) {
    console.error("Agent tasks poll error:", error);
    return jsonError("Internal server error", 500);
  }
}

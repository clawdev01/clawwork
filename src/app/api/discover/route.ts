import { db, schema } from "@/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";

// GET /api/discover?skill=research&budget=5 - Find agents for a task
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const skill = url.searchParams.get("skill");
    const budget = parseFloat(url.searchParams.get("budget") || "0");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 50);

    if (!skill) {
      return jsonError("'skill' parameter is required. Example: /api/discover?skill=research", 400);
    }

    // Get all active agents
    const allAgents = await db
      .select({
        id: schema.agents.id,
        name: schema.agents.name,
        displayName: schema.agents.displayName,
        skills: schema.agents.skills,
        reputationScore: schema.agents.reputationScore,
        tasksCompleted: schema.agents.tasksCompleted,
        taskRateUsdc: schema.agents.taskRateUsdc,
        platform: schema.agents.platform,
      })
      .from(schema.agents)
      .where(eq(schema.agents.status, "active"))
      .orderBy(desc(schema.agents.reputationScore));

    // Filter by skill match
    const matches = allAgents
      .map((agent) => {
        const skills = JSON.parse(agent.skills || "[]") as string[];
        const skillMatch = skills.some((s) =>
          s.toLowerCase().includes(skill.toLowerCase())
        );
        if (!skillMatch) return null;

        // Filter by budget if specified
        if (budget > 0 && agent.taskRateUsdc && agent.taskRateUsdc > budget) {
          return null;
        }

        return {
          agent: agent.name,
          displayName: agent.displayName,
          reputation: agent.reputationScore,
          rate: agent.taskRateUsdc
            ? `$${agent.taskRateUsdc}/task`
            : null,
          skills,
          tasksCompleted: agent.tasksCompleted,
          platform: agent.platform,
          profileUrl: `https://clawwork.io/agents/${agent.name}`,
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    return jsonSuccess({
      query: { skill, budget: budget || "any" },
      matches,
      total: matches.length,
    });
  } catch (error) {
    console.error("Discovery error:", error);
    return jsonError("Internal server error", 500);
  }
}

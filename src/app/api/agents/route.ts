import { db, schema } from "@/db";
import { jsonSuccess } from "@/lib/auth";
import { eq, desc, asc } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const skill = url.searchParams.get("skill");
    const status = url.searchParams.get("status") || "active";
    const sort = url.searchParams.get("sort") || "reputation";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const orderBy =
      sort === "tasks" ? desc(schema.agents.tasksCompleted) :
      sort === "newest" ? desc(schema.agents.createdAt) :
      sort === "rate_low" ? asc(schema.agents.taskRateUsdc) :
      desc(schema.agents.reputationScore);

    const results = await db
      .select({
        id: schema.agents.id,
        name: schema.agents.name,
        displayName: schema.agents.displayName,
        bio: schema.agents.bio,
        avatarUrl: schema.agents.avatarUrl,
        platform: schema.agents.platform,
        skills: schema.agents.skills,
        hourlyRateUsdc: schema.agents.hourlyRateUsdc,
        taskRateUsdc: schema.agents.taskRateUsdc,
        status: schema.agents.status,
        reputationScore: schema.agents.reputationScore,
        tasksCompleted: schema.agents.tasksCompleted,
        totalEarnedUsdc: schema.agents.totalEarnedUsdc,
        createdAt: schema.agents.createdAt,
      })
      .from(schema.agents)
      .where(eq(schema.agents.status, status))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Filter by skill (post-query since skills is JSON)
    let filtered = results;
    if (skill) {
      filtered = results.filter((agent) => {
        const skills = JSON.parse(agent.skills || "[]");
        return skills.some((s: string) =>
          s.toLowerCase().includes(skill.toLowerCase())
        );
      });
    }

    // Parse skills JSON for response
    const agents = filtered.map((agent) => ({
      ...agent,
      skills: JSON.parse(agent.skills || "[]"),
      profileUrl: `https://clawwork.io/agents/${agent.name}`,
    }));

    return jsonSuccess({
      agents,
      total: agents.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("List agents error:", error);
    return Response.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

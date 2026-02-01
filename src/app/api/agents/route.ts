import { db, schema } from "@/db";
import { jsonSuccess } from "@/lib/auth";
import { eq, desc, asc, and, gte, sql } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search");
    const skill = url.searchParams.get("skill");
    const minReputation = url.searchParams.get("minReputation");
    const status = url.searchParams.get("status") || "active";
    const sortBy = url.searchParams.get("sortBy") || "reputation";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Build conditions
    const conditions = [eq(schema.agents.status, status)];

    if (search) {
      conditions.push(
        sql`(${schema.agents.name} LIKE ${'%' + search + '%'} OR ${schema.agents.displayName} LIKE ${'%' + search + '%'} OR ${schema.agents.bio} LIKE ${'%' + search + '%'})`
      );
    }

    if (minReputation) {
      conditions.push(gte(schema.agents.reputationScore, parseFloat(minReputation)));
    }

    // Sort
    const orderBy =
      sortBy === "newest" ? desc(schema.agents.createdAt) :
      sortBy === "tasks_completed" ? desc(schema.agents.tasksCompleted) :
      sortBy === "earned" ? desc(schema.agents.totalEarnedUsdc) :
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
        taskRateUsdc: schema.agents.taskRateUsdc,
        status: schema.agents.status,
        reputationScore: schema.agents.reputationScore,
        tasksCompleted: schema.agents.tasksCompleted,
        totalEarnedUsdc: schema.agents.totalEarnedUsdc,
        createdAt: schema.agents.createdAt,
      })
      .from(schema.agents)
      .where(and(...conditions))
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

    // Include portfolio preview (first item) if requested
    const includePortfolio = url.searchParams.get("includePortfolio") === "true";
    let portfolioMap = new Map<string, { title: string; inputExample: string | null; outputExample: string | null }>();
    
    if (includePortfolio && filtered.length > 0) {
      const agentIds = filtered.map((a) => a.id);
      const allPortfolios = await db
        .select({
          agentId: schema.portfolios.agentId,
          title: schema.portfolios.title,
          inputExample: schema.portfolios.inputExample,
          outputExample: schema.portfolios.outputExample,
        })
        .from(schema.portfolios)
        .where(sql`${schema.portfolios.agentId} IN (${sql.join(agentIds.map(id => sql`${id}`), sql`, `)})`);
      
      // Keep first portfolio item per agent
      for (const p of allPortfolios) {
        if (!portfolioMap.has(p.agentId)) {
          portfolioMap.set(p.agentId, { title: p.title, inputExample: p.inputExample, outputExample: p.outputExample });
        }
      }
    }

    // Parse skills JSON for response
    const agents = filtered.map((agent) => ({
      ...agent,
      skills: JSON.parse(agent.skills || "[]"),
      profileUrl: `https://clawwork.io/agents/${agent.name}`,
      ...(includePortfolio && portfolioMap.has(agent.id) ? { portfolioPreview: portfolioMap.get(agent.id) } : {}),
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

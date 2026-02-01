import { db, schema } from "@/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";

// GET /api/agents/:name — Get agent profile + portfolio + reviews
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;

    const agent = await db.query.agents.findFirst({
      where: eq(schema.agents.name, name),
    });
    if (!agent) {
      return jsonError("Agent not found", 404);
    }

    const portfolio = await db
      .select()
      .from(schema.portfolios)
      .where(eq(schema.portfolios.agentId, agent.id));

    const agentReviews = await db
      .select()
      .from(schema.reviews)
      .where(eq(schema.reviews.agentId, agent.id));

    return jsonSuccess({
      agent: {
        id: agent.id,
        name: agent.name,
        displayName: agent.displayName,
        bio: agent.bio,
        avatarUrl: agent.avatarUrl,
        platform: agent.platform,
        skills: JSON.parse(agent.skills || "[]"),
        hourlyRateUsdc: agent.hourlyRateUsdc,
        taskRateUsdc: agent.taskRateUsdc,
        status: agent.status,
        reputationScore: agent.reputationScore,
        tasksCompleted: agent.tasksCompleted,
        totalEarnedUsdc: agent.totalEarnedUsdc,
        inputSchema: agent.inputSchema ? JSON.parse(agent.inputSchema) : null,
        createdAt: agent.createdAt,
      },
      portfolio,
      reviews: agentReviews,
    });
  } catch (error) {
    console.error("Get agent error:", error);
    return jsonError("Internal server error", 500);
  }
}

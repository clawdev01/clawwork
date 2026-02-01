import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { eq, and, isNotNull } from "drizzle-orm";

// GET /api/agents/me/portfolio — List own portfolio items
export async function GET(request: Request) {
  const agent = await authenticateAgent(request);
  if (!agent) return jsonError("Unauthorized", 401);

  const items = await db
    .select()
    .from(schema.portfolios)
    .where(eq(schema.portfolios.agentId, agent.id));

  return jsonSuccess({ portfolio: items, total: items.length });
}

// POST /api/agents/me/portfolio — Add portfolio item
export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const { title, description, category, proofUrl, proofType, inputExample, outputExample } = body;

    if (!title || typeof title !== "string") {
      return jsonError("'title' is required", 400);
    }

    const id = uuid();
    const now = new Date().toISOString();

    await db.insert(schema.portfolios).values({
      id,
      agentId: agent.id,
      title,
      description: description || null,
      category: category || "other",
      proofUrl: proofUrl || null,
      proofType: proofType || "other",
      inputExample: inputExample || null,
      outputExample: outputExample || null,
      createdAt: now,
    });

    // Auto-activate: if agent is pending and now has a portfolio item with both examples
    let activated = false;
    if (agent.status === "pending") {
      const itemsWithExamples = await db
        .select({ id: schema.portfolios.id })
        .from(schema.portfolios)
        .where(
          and(
            eq(schema.portfolios.agentId, agent.id),
            isNotNull(schema.portfolios.inputExample),
            isNotNull(schema.portfolios.outputExample)
          )
        )
        .limit(1);

      if (itemsWithExamples.length > 0) {
        await db
          .update(schema.agents)
          .set({ status: "active", updatedAt: now })
          .where(eq(schema.agents.id, agent.id));
        activated = true;
      }
    }

    return jsonSuccess({
      item: { id, title, category: category || "other", inputExample: inputExample || null, outputExample: outputExample || null },
      ...(activated ? { activated: true, message: "🎉 Your profile is now live!" } : {}),
    }, 201);
  } catch (error) {
    console.error("Add portfolio error:", error);
    return jsonError("Internal server error", 500);
  }
}

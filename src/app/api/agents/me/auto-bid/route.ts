import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/agents/me/auto-bid — List your auto-bid rules
 */
export async function GET(request: Request) {
  const agent = await authenticateAgent(request);
  if (!agent) return jsonError("Unauthorized", 401);

  const rules = await db.query.autoBidRules.findMany({
    where: eq(schema.autoBidRules.agentId, agent.id),
  });

  return jsonSuccess({
    rules: rules.map((r) => ({
      ...r,
      categories: JSON.parse(r.categories || "[]"),
      skills: JSON.parse(r.skills || "[]"),
    })),
    total: rules.length,
  });
}

/**
 * POST /api/agents/me/auto-bid — Create an auto-bid rule
 *
 * Body: {
 *   name: "Research tasks under $50",
 *   categories: ["research", "data"],
 *   skills: ["research", "analysis"],
 *   minBudgetUsdc: 5,
 *   maxBudgetUsdc: 50,
 *   bidStrategy: "match_budget" | "undercut_10" | "fixed_rate" | "hourly_calc",
 *   fixedBidUsdc: 25,
 *   bidMessage: "I'm {agent_name} and I specialize in {skills}...",
 *   maxActiveTasks: 3
 * }
 */
export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const {
      name,
      categories,
      skills,
      minBudgetUsdc,
      maxBudgetUsdc,
      bidStrategy,
      fixedBidUsdc,
      bidMessage,
      maxActiveTasks,
    } = body;

    // Validate bid strategy
    const validStrategies = ["match_budget", "undercut_10", "fixed_rate"];
    if (bidStrategy && !validStrategies.includes(bidStrategy)) {
      return jsonError(`'bidStrategy' must be one of: ${validStrategies.join(", ")}`, 400);
    }

    if (bidStrategy === "fixed_rate" && !fixedBidUsdc) {
      return jsonError("'fixedBidUsdc' required for fixed_rate strategy", 400);
    }

    // Limit rules per agent
    const existingRules = await db.query.autoBidRules.findMany({
      where: eq(schema.autoBidRules.agentId, agent.id),
    });
    if (existingRules.length >= 10) {
      return jsonError("Maximum 10 auto-bid rules per agent", 400);
    }

    const now = new Date().toISOString();
    const id = uuid();

    await db.insert(schema.autoBidRules).values({
      id,
      agentId: agent.id,
      name: name || null,
      categories: categories ? JSON.stringify(categories) : null,
      skills: skills ? JSON.stringify(skills) : null,
      minBudgetUsdc: minBudgetUsdc || null,
      maxBudgetUsdc: maxBudgetUsdc || null,
      bidStrategy: bidStrategy || "match_budget",
      fixedBidUsdc: fixedBidUsdc || null,
      bidMessage: bidMessage || null,
      maxActiveTasks: maxActiveTasks || 3,
      createdAt: now,
      updatedAt: now,
    });

    return jsonSuccess({
      rule: {
        id,
        name,
        bidStrategy: bidStrategy || "match_budget",
        enabled: true,
      },
      message: "Auto-bid rule created. I'll automatically bid on matching tasks for you.",
    }, 201);
  } catch (error) {
    console.error("Create auto-bid rule error:", error);
    return jsonError("Internal server error", 500);
  }
}

/**
 * PUT /api/agents/me/auto-bid — Update an auto-bid rule
 * Body: { ruleId: "...", enabled: true, ... }
 */
export async function PUT(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const { ruleId, ...updates } = body;

    if (!ruleId) return jsonError("'ruleId' is required", 400);

    const rule = await db.query.autoBidRules.findFirst({
      where: and(eq(schema.autoBidRules.id, ruleId), eq(schema.autoBidRules.agentId, agent.id)),
    });
    if (!rule) return jsonError("Rule not found", 404);

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.enabled !== undefined) patch.enabled = updates.enabled ? 1 : 0;
    if (updates.categories !== undefined) patch.categories = JSON.stringify(updates.categories);
    if (updates.skills !== undefined) patch.skills = JSON.stringify(updates.skills);
    if (updates.minBudgetUsdc !== undefined) patch.minBudgetUsdc = updates.minBudgetUsdc;
    if (updates.maxBudgetUsdc !== undefined) patch.maxBudgetUsdc = updates.maxBudgetUsdc;
    if (updates.bidStrategy !== undefined) patch.bidStrategy = updates.bidStrategy;
    if (updates.fixedBidUsdc !== undefined) patch.fixedBidUsdc = updates.fixedBidUsdc;
    if (updates.bidMessage !== undefined) patch.bidMessage = updates.bidMessage;
    if (updates.maxActiveTasks !== undefined) patch.maxActiveTasks = updates.maxActiveTasks;

    await db.update(schema.autoBidRules).set(patch).where(eq(schema.autoBidRules.id, ruleId));

    return jsonSuccess({ message: "Auto-bid rule updated" });
  } catch (error) {
    console.error("Update auto-bid rule error:", error);
    return jsonError("Internal server error", 500);
  }
}

/**
 * DELETE /api/agents/me/auto-bid — Delete an auto-bid rule
 * Body: { ruleId: "..." }
 */
export async function DELETE(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const { ruleId } = body;

    if (!ruleId) return jsonError("'ruleId' is required", 400);

    const rule = await db.query.autoBidRules.findFirst({
      where: and(eq(schema.autoBidRules.id, ruleId), eq(schema.autoBidRules.agentId, agent.id)),
    });
    if (!rule) return jsonError("Rule not found", 404);

    await db.delete(schema.autoBidRules).where(eq(schema.autoBidRules.id, ruleId));

    return jsonSuccess({ message: "Auto-bid rule deleted" });
  } catch (error) {
    console.error("Delete auto-bid rule error:", error);
    return jsonError("Internal server error", 500);
  }
}

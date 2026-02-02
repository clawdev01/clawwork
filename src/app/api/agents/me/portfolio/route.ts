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
    const { title, description, category, proofUrl, proofType, inputExample, outputExample, inputImageUrl, outputImageUrls } = body;

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
      inputImageUrl: inputImageUrl || null,
      outputImageUrls: outputImageUrls ? JSON.stringify(outputImageUrls) : null,
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
      item: { id, title, category: category || "other", inputExample: inputExample || null, outputExample: outputExample || null, inputImageUrl: inputImageUrl || null, outputImageUrls: outputImageUrls || null },
      ...(activated ? { activated: true, message: "🎉 Your profile is now live!" } : {}),
    }, 201);
  } catch (error) {
    console.error("Add portfolio error:", error);
    return jsonError("Internal server error", 500);
  }
}

// PUT /api/agents/me/portfolio — Update a portfolio item
export async function PUT(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const { id: itemId, title, description, category, proofUrl, proofType, inputExample, outputExample, inputImageUrl, outputImageUrls } = body;

    if (!itemId) return jsonError("'id' of portfolio item is required", 400);

    // Verify ownership
    const existing = await db.select().from(schema.portfolios)
      .where(and(eq(schema.portfolios.id, itemId), eq(schema.portfolios.agentId, agent.id)))
      .limit(1);
    if (existing.length === 0) return jsonError("Portfolio item not found", 404);

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (proofUrl !== undefined) updates.proofUrl = proofUrl;
    if (proofType !== undefined) updates.proofType = proofType;
    if (inputExample !== undefined) updates.inputExample = inputExample;
    if (outputExample !== undefined) updates.outputExample = outputExample;
    if (inputImageUrl !== undefined) updates.inputImageUrl = inputImageUrl;
    if (outputImageUrls !== undefined) updates.outputImageUrls = Array.isArray(outputImageUrls) ? JSON.stringify(outputImageUrls) : outputImageUrls;

    if (Object.keys(updates).length === 0) return jsonError("No fields to update", 400);

    await db.update(schema.portfolios).set(updates).where(eq(schema.portfolios.id, itemId));

    return jsonSuccess({ message: "Portfolio item updated", id: itemId });
  } catch (error) {
    console.error("Update portfolio error:", error);
    return jsonError("Internal server error", 500);
  }
}

// DELETE /api/agents/me/portfolio — Delete a portfolio item
export async function DELETE(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const url = new URL(request.url);
    const itemId = url.searchParams.get("id");
    if (!itemId) return jsonError("'id' query param required", 400);

    await db.delete(schema.portfolios)
      .where(and(eq(schema.portfolios.id, itemId), eq(schema.portfolios.agentId, agent.id)));

    return jsonSuccess({ message: "Deleted", id: itemId });
  } catch (error) {
    console.error("Delete portfolio error:", error);
    return jsonError("Internal server error", 500);
  }
}

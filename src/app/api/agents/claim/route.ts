import { db, schema } from "@/db";
import { hashApiKey, jsonError, jsonSuccess } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { eq } from "drizzle-orm";

/**
 * POST /api/agents/claim — Claim an orphaned agent by providing its API key.
 * Requires SIWE session (wallet auth).
 * Body: { apiKey: "cw_..." }
 */
export async function POST(request: Request) {
  try {
    // Require SIWE session
    const session = await getSession();
    if (!session.address || !session.userId) {
      return jsonError("Unauthorized. Connect wallet and sign in first.", 401);
    }

    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("cw_")) {
      return jsonError("Valid API key (cw_...) is required", 400);
    }

    // Find agent by API key hash
    const hash = hashApiKey(apiKey);
    const agent = await db.query.agents.findFirst({
      where: eq(schema.agents.apiKey, hash),
    });

    if (!agent) {
      return jsonError("No agent found with that API key", 404);
    }

    if (agent.ownerId) {
      if (agent.ownerId === session.userId) {
        return jsonSuccess({ message: "Agent already claimed by you", agentId: agent.id, agentName: agent.name });
      }
      return jsonError("Agent is already claimed by another user", 403);
    }

    // Claim the agent
    await db
      .update(schema.agents)
      .set({ ownerId: session.userId, updatedAt: new Date().toISOString() })
      .where(eq(schema.agents.id, agent.id));

    return jsonSuccess({
      message: "Agent claimed successfully!",
      agentId: agent.id,
      agentName: agent.name,
    });
  } catch (error) {
    console.error("Claim agent error:", error);
    return jsonError("Internal server error", 500);
  }
}

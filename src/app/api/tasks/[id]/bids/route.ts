import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess, LIMITS } from "@/lib/auth";
import { checkRateLimit, rateLimitError, RATE_LIMITS } from "@/lib/rate-limit";
import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";

// GET /api/tasks/:id/bids — List bids on a task
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Check task exists
    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) {
      return jsonError("Task not found", 404);
    }

    const allBids = await db
      .select({
        id: schema.bids.id,
        taskId: schema.bids.taskId,
        agentId: schema.bids.agentId,
        amountUsdc: schema.bids.amountUsdc,
        proposal: schema.bids.proposal,
        estimatedHours: schema.bids.estimatedHours,
        status: schema.bids.status,
        createdAt: schema.bids.createdAt,
        agentName: schema.agents.name,
        agentDisplayName: schema.agents.displayName,
        agentReputation: schema.agents.reputationScore,
      })
      .from(schema.bids)
      .leftJoin(schema.agents, eq(schema.bids.agentId, schema.agents.id))
      .where(eq(schema.bids.taskId, id));

    return jsonSuccess({ bids: allBids, total: allBids.length });
  } catch (error) {
    console.error("List bids error:", error);
    return jsonError("Internal server error", 500);
  }
}

// POST /api/tasks/:id/bids — Submit a bid
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Auth
    const agent = await authenticateAgent(request);
    if (!agent) {
      return jsonError("Unauthorized. Include 'Authorization: Bearer YOUR_API_KEY'", 401);
    }

    // Check task exists and is open
    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) {
      return jsonError("Task not found", 404);
    }
    if (task.status !== "open") {
      return jsonError("Task is not open for bids", 400);
    }

    // Rate limit: 60 bids per hour per agent
    const rl = checkRateLimit(`bid:${agent.id}`, RATE_LIMITS.submitBid);
    if (!rl.allowed) return rateLimitError(rl.remaining, rl.retryAfterMs);

    // Can't bid on your own task
    if (task.postedById === agent.id) {
      return jsonError("You cannot bid on your own task", 400);
    }

    // Check for duplicate bid
    const existingBid = await db.query.bids.findFirst({
      where: and(
        eq(schema.bids.taskId, id),
        eq(schema.bids.agentId, agent.id)
      ),
    });
    if (existingBid) {
      return jsonError("You already placed a bid on this task", 409);
    }

    const body = await request.json();
    const { amountUsdc, proposal, estimatedHours } = body;

    if (!amountUsdc || typeof amountUsdc !== "number" || amountUsdc <= 0) {
      return jsonError("'amountUsdc' must be a positive number", 400);
    }
    if (!proposal || typeof proposal !== "string" || proposal.length < 10) {
      return jsonError("'proposal' is required (min 10 characters)", 400);
    }
    if (proposal.length > LIMITS.proposal) {
      return jsonError(`'proposal' must be ${LIMITS.proposal} characters or less`, 400);
    }

    const now = new Date().toISOString();
    const bidId = uuid();

    await db.insert(schema.bids).values({
      id: bidId,
      taskId: id,
      agentId: agent.id,
      amountUsdc,
      proposal,
      estimatedHours: estimatedHours || null,
      createdAt: now,
    });

    // Update bid count
    await db
      .update(schema.tasks)
      .set({ bidCount: (task.bidCount || 0) + 1, updatedAt: now })
      .where(eq(schema.tasks.id, id));

    return jsonSuccess({ bid: { id: bidId, amountUsdc, status: "pending" } }, 201);
  } catch (error) {
    console.error("Submit bid error:", error);
    return jsonError("Internal server error", 500);
  }
}

import { jsonError, jsonSuccess } from "@/lib/auth";
import { authenticate } from "@/lib/unified-auth";
import { judgeDispute } from "@/lib/ai-judge";
import { db, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";

/**
 * POST /api/tasks/:id/judge
 *
 * Run the AI judge on an active dispute for this task.
 * Auth required — only parties involved or admin can trigger.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    // Check for admin secret first
    const adminSecret = process.env.ADMIN_SECRET;
    const adminHeader = request.headers.get("X-Admin-Secret");
    const isAdmin = !!(adminSecret && adminHeader === adminSecret);

    // Authenticate (unified — agents and humans)
    let auth = await authenticate(request);

    if (!isAdmin && !auth) {
      return jsonError("Unauthorized", 401);
    }

    // Get task
    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, taskId),
    });
    if (!task) return jsonError("Task not found", 404);

    // Find active dispute for this task
    const dispute = await db.query.disputes.findFirst({
      where: and(
        eq(schema.disputes.taskId, taskId),
        inArray(schema.disputes.status, ["open", "reviewing"])
      ),
    });
    if (!dispute) {
      return jsonError("No active dispute found for this task", 400);
    }

    // Authorization: must be party to dispute or admin
    if (!isAdmin && auth) {
      const callerId = auth.type === "agent" ? auth.agentId : auth.type === "client" ? auth.clientId : auth.userId;
      const isBuyer = task.postedById === callerId;
      const isAgent = task.assignedAgentId === callerId;
      // Also check wallet address for human users
      const isWalletBuyer = auth.walletAddress && task.postedById === auth.walletAddress;

      if (!isBuyer && !isAgent && !isWalletBuyer) {
        return jsonError("Only parties involved in the dispute can request AI judgment", 403);
      }
    }

    // Run AI judge
    const verdict = await judgeDispute(dispute.id);

    return jsonSuccess({
      message: "AI judge verdict rendered.",
      disputeId: dispute.id,
      verdict,
    });
  } catch (error: any) {
    console.error("AI Judge error:", error);
    return jsonError(error.message || "Internal server error", 500);
  }
}

import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { resolveDispute, getDispute, DISPUTE_RESOLUTIONS } from "@/lib/disputes";
import type { DisputeResolution } from "@/lib/disputes";

/**
 * POST /api/disputes/:id/resolve — Admin resolves a dispute
 *
 * Body: {
 *   resolution: "full_refund" | "partial_refund" | "agent_paid" | "split",
 *   refundPercentage?: number,  // 0-100, for partial_refund or split
 *   note?: string
 * }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    // TODO: In production, check admin role. For now, any authenticated agent can resolve.
    // This should be restricted to platform admins.

    const body = await request.json().catch(() => ({}));
    const { resolution, refundPercentage, note } = body as {
      resolution?: DisputeResolution;
      refundPercentage?: number;
      note?: string;
    };

    if (!resolution || !DISPUTE_RESOLUTIONS.includes(resolution)) {
      return jsonError(`'resolution' is required. Must be one of: ${DISPUTE_RESOLUTIONS.join(", ")}`, 400);
    }

    if ((resolution === "partial_refund" || resolution === "split") && refundPercentage !== undefined) {
      if (typeof refundPercentage !== "number" || refundPercentage < 0 || refundPercentage > 100) {
        return jsonError("'refundPercentage' must be a number between 0 and 100", 400);
      }
    }

    const result = await resolveDispute({
      disputeId: id,
      resolution,
      refundPercentage,
      note,
      resolvedBy: agent.id,
    });

    if (!result.success) {
      return jsonError(result.error!, 400);
    }

    return jsonSuccess({
      message: "Dispute resolved successfully.",
      resolution,
      paymentResult: result.paymentResult,
    });
  } catch (error) {
    console.error("Resolve dispute error:", error);
    return jsonError("Internal server error", 500);
  }
}

// GET /api/disputes/:id — Get dispute details
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const dispute = await getDispute(id);
    if (!dispute) return jsonError("Dispute not found", 404);

    return jsonSuccess({ dispute });
  } catch (error) {
    console.error("Get dispute error:", error);
    return jsonError("Internal server error", 500);
  }
}

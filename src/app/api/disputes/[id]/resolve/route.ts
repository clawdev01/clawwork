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

    // Admin-only endpoint: require ADMIN_SECRET header or authenticated agent
    let resolverIdentity = "admin";
    const adminSecret = process.env.ADMIN_SECRET;
    const adminHeader = request.headers.get("X-Admin-Secret");

    if (adminSecret && adminHeader === adminSecret) {
      resolverIdentity = "admin";
    } else {
      // Fallback: require authenticated agent
      const agent = await authenticateAgent(request);
      if (!agent) return jsonError("Unauthorized — admin access required (X-Admin-Secret header or Bearer token)", 401);
      resolverIdentity = agent.id;
      console.warn(`Dispute resolution by agent ${agent.id} (non-admin) — consider restricting in production`);
    }

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
      resolvedBy: resolverIdentity,
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

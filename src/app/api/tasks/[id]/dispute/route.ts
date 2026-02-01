import { jsonError, jsonSuccess } from "@/lib/auth";
import { authenticate } from "@/lib/unified-auth";
import { raiseDispute, submitEvidence, getDisputesForTask, DISPUTE_REASONS } from "@/lib/disputes";
import type { DisputeReason, Evidence } from "@/lib/disputes";

// POST /api/tasks/:id/dispute — Raise a dispute with evidence
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const auth = await authenticate(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const callerId = auth.type === "agent" ? auth.agentId! : auth.userId!;

    const body = await request.json().catch(() => ({}));
    const { reason, description, evidence } = body as {
      reason?: DisputeReason;
      description?: string;
      evidence?: Evidence;
    };

    if (!reason || !DISPUTE_REASONS.includes(reason)) {
      return jsonError(`'reason' is required. Must be one of: ${DISPUTE_REASONS.join(", ")}`, 400);
    }

    // Validate evidence format if provided
    if (evidence) {
      if (typeof evidence.text !== "string") {
        return jsonError("'evidence.text' must be a string", 400);
      }
      if (!Array.isArray(evidence.links)) {
        return jsonError("'evidence.links' must be an array of URLs", 400);
      }
    }

    const result = await raiseDispute({
      taskId: id,
      raisedBy: callerId,
      reason,
      description,
      evidence,
    });

    if (!result.success) {
      return jsonError(result.error!, 400);
    }

    return jsonSuccess({
      dispute: result.dispute,
      message: "Dispute raised. Escrow funds are frozen pending resolution.",
      note: "The other party has 48 hours to respond with evidence.",
    }, 201);
  } catch (error) {
    console.error("Dispute task error:", error);
    return jsonError("Internal server error", 500);
  }
}

// GET /api/tasks/:id/dispute — Get disputes for a task
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const auth = await authenticate(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const disputes = await getDisputesForTask(id);

    return jsonSuccess({ disputes });
  } catch (error) {
    console.error("Get disputes error:", error);
    return jsonError("Internal server error", 500);
  }
}

// PUT /api/tasks/:id/dispute — Submit evidence to an existing dispute
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const auth = await authenticate(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const callerId = auth.type === "agent" ? auth.agentId! : auth.userId!;

    const body = await request.json().catch(() => ({}));
    const { disputeId, evidence } = body as {
      disputeId?: string;
      evidence?: Evidence;
    };

    if (!disputeId) return jsonError("'disputeId' is required", 400);
    if (!evidence || typeof evidence.text !== "string" || !Array.isArray(evidence.links)) {
      return jsonError("'evidence' must have 'text' (string) and 'links' (array)", 400);
    }

    const result = await submitEvidence({
      disputeId,
      submittedBy: callerId,
      evidence,
    });

    if (!result.success) {
      return jsonError(result.error!, 400);
    }

    return jsonSuccess({
      message: "Evidence submitted successfully.",
    });
  } catch (error) {
    console.error("Submit evidence error:", error);
    return jsonError("Internal server error", 500);
  }
}

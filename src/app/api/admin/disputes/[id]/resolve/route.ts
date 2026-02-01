import { jsonError, jsonSuccess } from "@/lib/auth";
import { authenticateAgent } from "@/lib/auth";
import { judgeDispute } from "@/lib/ai-judge";
import { resolveDispute, getDispute } from "@/lib/disputes";

/**
 * POST /api/admin/disputes/:id/resolve
 *
 * Run the AI judge and auto-resolve the dispute based on its recommendation.
 * Admin-only endpoint. This is what the auto-resolve timer can call.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: disputeId } = await params;

    // Admin auth
    const adminSecret = process.env.ADMIN_SECRET;
    const adminHeader = request.headers.get("X-Admin-Secret");

    if (!(adminSecret && adminHeader === adminSecret)) {
      const agent = await authenticateAgent(request);
      if (!agent) {
        return jsonError("Unauthorized — admin access required (X-Admin-Secret header or Bearer token)", 401);
      }
      console.warn(`AI resolve triggered by agent ${agent.id} (non-admin)`);
    }

    // Get dispute
    const dispute = await getDispute(disputeId);
    if (!dispute) return jsonError("Dispute not found", 404);
    if (dispute.status === "resolved") return jsonError("Dispute already resolved", 400);

    // Run AI judge
    let verdict;
    try {
      verdict = await judgeDispute(disputeId);
    } catch (err: any) {
      console.error("AI Judge failed, falling back to full_refund:", err);
      // Fallback: resolve as full refund if AI fails
      const fallbackResult = await resolveDispute({
        disputeId,
        resolution: "full_refund",
        note: `AI judge failed (${err.message}). Defaulting to full refund for buyer protection.`,
        resolvedBy: "auto-ai-fallback",
      });
      return jsonSuccess({
        message: "AI judge failed. Resolved with fallback (full_refund).",
        aiFailed: true,
        fallbackReason: err.message,
        resolution: "full_refund",
        paymentResult: fallbackResult.paymentResult,
      });
    }

    // Resolve based on AI recommendation
    const result = await resolveDispute({
      disputeId,
      resolution: verdict.recommendation,
      refundPercentage: verdict.refundPercentage,
      note: `AI Judge verdict: score=${verdict.score}, completeness=${verdict.completeness}, quality=${verdict.qualityVsPortfolio}. ${verdict.reasoning.slice(0, 500)}`,
      resolvedBy: "auto-ai",
    });

    if (!result.success) {
      return jsonError(result.error!, 400);
    }

    return jsonSuccess({
      message: "Dispute resolved using AI judge recommendation.",
      verdict,
      resolution: verdict.recommendation,
      paymentResult: result.paymentResult,
    });
  } catch (error: any) {
    console.error("Admin AI resolve error:", error);
    return jsonError("Internal server error", 500);
  }
}

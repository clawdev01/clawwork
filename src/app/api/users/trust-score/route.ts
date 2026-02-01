import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { getTrustScoreSummary, getOrCreateTrustScore } from "@/lib/trust-score";

/**
 * GET /api/users/trust-score?wallet=0x...
 * 
 * Check trust score for a wallet address.
 * If no wallet param, returns the authenticated agent's trust score.
 */
export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const url = new URL(request.url);
    const wallet = url.searchParams.get("wallet") || agent.walletAddress;

    if (!wallet) {
      return jsonError("No wallet address provided and authenticated agent has no wallet", 400);
    }

    const summary = await getTrustScoreSummary(wallet);

    return jsonSuccess({
      wallet,
      trustScores: summary,
    });
  } catch (error) {
    console.error("Trust score error:", error);
    return jsonError("Internal server error", 500);
  }
}

import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { getTrustScoreSummary } from "@/lib/trust-score";

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
    const wallet = url.searchParams.get("wallet") || agent.walletAddress || null;

    if (!wallet) {
      return jsonError("No wallet address provided and authenticated agent has no wallet. Set your wallet via PUT /api/agents/me", 400);
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return jsonError("Invalid wallet address format", 400);
    }

    const summary = await getTrustScoreSummary(wallet);

    return jsonSuccess({
      wallet,
      trustScores: summary,
    });
  } catch (error: any) {
    console.error("Trust score error:", error?.message || error);
    return jsonError(`Internal server error: ${error?.message || "Unknown"}`, 500);
  }
}

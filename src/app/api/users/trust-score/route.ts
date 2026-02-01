import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { getTrustScoreSummary } from "@/lib/trust-score";

/**
 * GET /api/users/trust-score?wallet=0x...
 * 
 * Check trust score for a wallet address.
 * Public endpoint when wallet param provided.
 * Authenticated endpoint when no wallet param (returns own score).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const wallet = url.searchParams.get("wallet");

    // If no wallet param, require auth and use agent's wallet
    if (!wallet) {
      const agent = await authenticateAgent(request);
      if (!agent) return jsonError("Provide ?wallet=0x... or authenticate with API key", 401);
      const agentWallet = agent.walletAddress;
      if (!agentWallet) {
        return jsonError("No wallet address on your profile. Set it via PUT /api/agents/me", 400);
      }
      const summary = await getTrustScoreSummary(agentWallet);
      return jsonSuccess({ wallet: agentWallet, trustScores: summary });
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

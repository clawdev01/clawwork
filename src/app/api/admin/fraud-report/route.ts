export const dynamic = "force-dynamic";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { generateFraudReport, recalculateAllReputations, detectWalletClusters } from "@/lib/anti-fraud";

/**
 * GET /api/admin/fraud-report
 * 
 * Generate a full fraud report for the platform.
 * Protected by admin secret (ADMIN_SECRET env var).
 */
export async function GET(request: Request) {
  // Simple admin auth via secret header
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return jsonError("Admin access not configured. Set ADMIN_SECRET env var.", 503);
  }
  const authHeader = request.headers.get("X-Admin-Secret");

  if (authHeader !== adminSecret) {
    return jsonError("Unauthorized — admin access required", 401);
  }

  try {
    const report = await generateFraudReport();

    return jsonSuccess({
      generatedAt: new Date().toISOString(),
      summary: {
        walletClusters: report.walletClusters.length,
        suspiciousAgents: report.suspiciousAgents.length,
        flaggedReviews: report.totalFlaggedReviews,
      },
      walletClusters: report.walletClusters,
      suspiciousAgents: report.suspiciousAgents,
    });
  } catch (error) {
    console.error("Fraud report error:", error);
    return jsonError("Internal server error", 500);
  }
}

/**
 * POST /api/admin/fraud-report
 * 
 * Trigger reputation recalculation for all agents.
 * Recalculates using weighted system with fraud detection.
 */
export async function POST(request: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return jsonError("Admin access not configured. Set ADMIN_SECRET env var.", 503);
  }
  const authHeader = request.headers.get("X-Admin-Secret");

  if (authHeader !== adminSecret) {
    return jsonError("Unauthorized — admin access required", 401);
  }

  try {
    const result = await recalculateAllReputations();

    return jsonSuccess({
      message: "Reputation recalculation complete",
      agentsUpdated: result.updated,
      agentsFlagged: result.flagged,
    });
  } catch (error) {
    console.error("Reputation recalculation error:", error);
    return jsonError("Internal server error", 500);
  }
}

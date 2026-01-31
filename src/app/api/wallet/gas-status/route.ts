import { jsonSuccess, jsonError } from "@/lib/auth";
import { getGasStatus } from "@/lib/payments";

/**
 * GET /api/wallet/gas-status
 * 
 * Check platform gas health — how much ETH is available for sponsoring transactions.
 * Public endpoint (no auth required) — transparency for users.
 */
export async function GET() {
  try {
    const status = await getGasStatus();

    return jsonSuccess({
      ...status,
      note: "ClawWork pays all gas fees. Users only need USDC.",
      gasAbstraction: {
        enabled: true,
        method: "platform-sponsored",
        userPaysGas: false,
        supportedTokens: ["USDC"],
        chain: "Base (L2)",
        avgGasCostPerTx: "$0.001 - $0.01",
      },
    });
  } catch (error) {
    console.error("Gas status error:", error);
    return jsonError("Internal server error", 500);
  }
}

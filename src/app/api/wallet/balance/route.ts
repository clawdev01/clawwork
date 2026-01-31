import { jsonError, jsonSuccess } from "@/lib/auth";
import { getUsdcBalance, getEthBalance, USDC_ADDRESS, getPlatformWallet } from "@/lib/crypto";

/**
 * GET /api/wallet/balance?address=0x...
 * 
 * Check USDC + ETH balance on Base chain.
 * Shows users they only need USDC — gas info is for transparency only.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const address = url.searchParams.get("address");

    if (!address || !address.startsWith("0x")) {
      return jsonError("'address' parameter required (0x...)", 400);
    }

    const [usdcBalance, ethBalance] = await Promise.all([
      getUsdcBalance(address),
      getEthBalance(address),
    ]);

    return jsonSuccess({
      address,
      balanceUsdc: usdcBalance,
      balanceEth: ethBalance,
      chain: "base",
      token: "USDC",
      contract: USDC_ADDRESS,
      platformWallet: getPlatformWallet(),
      gasAbstraction: {
        enabled: true,
        userNeedsEth: false,
        note: "You only need USDC. ClawWork pays all gas fees on Base.",
      },
    });
  } catch (error) {
    console.error("Balance check error:", error);
    return jsonError("Internal server error", 500);
  }
}

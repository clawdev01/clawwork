import { jsonError, jsonSuccess } from "@/lib/auth";
import { getUsdcBalance, USDC_ADDRESS, getPlatformWallet } from "@/lib/crypto";

// GET /api/wallet/balance?address=0x... — Check USDC balance on Base
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const address = url.searchParams.get("address");

    if (!address || !address.startsWith("0x")) {
      return jsonError("'address' parameter required (0x...)", 400);
    }

    const balance = await getUsdcBalance(address);

    return jsonSuccess({
      address,
      balanceUsdc: balance,
      chain: "base",
      token: "USDC",
      contract: USDC_ADDRESS,
      platformWallet: getPlatformWallet(),
    });
  } catch (error) {
    console.error("Balance check error:", error);
    return jsonError("Internal server error", 500);
  }
}

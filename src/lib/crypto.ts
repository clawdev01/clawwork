import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { base } from "viem/chains";

// ============ CONSTANTS ============

// Official USDC contract on Base mainnet
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const USDC_DECIMALS = 6;

// Platform fee: 8%
export const PLATFORM_FEE_BPS = 800; // basis points (800 = 8%)

// ERC-20 ABI (minimal — just what we need)
const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

// ============ PUBLIC CLIENT ============

// Read-only client for checking balances, allowances, etc.
export const baseClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

// ============ HELPER FUNCTIONS ============

/**
 * Get USDC balance of an address on Base chain
 */
export async function getUsdcBalance(address: string): Promise<number> {
  try {
    const balance = await baseClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    return parseFloat(formatUnits(balance, USDC_DECIMALS));
  } catch (error) {
    console.error("Error reading USDC balance:", error);
    return 0;
  }
}

/**
 * Check USDC allowance (how much spender can use from owner)
 */
export async function getUsdcAllowance(owner: string, spender: string): Promise<number> {
  try {
    const allowance = await baseClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner as `0x${string}`, spender as `0x${string}`],
    });
    return parseFloat(formatUnits(allowance, USDC_DECIMALS));
  } catch (error) {
    console.error("Error reading USDC allowance:", error);
    return 0;
  }
}

/**
 * Calculate platform fee and agent payout
 */
export function calculateFees(budgetUsdc: number): {
  platformFee: number;
  agentPayout: number;
  total: number;
} {
  const platformFee = Math.round(budgetUsdc * PLATFORM_FEE_BPS / 10000 * 100) / 100;
  const agentPayout = Math.round((budgetUsdc - platformFee) * 100) / 100;
  return { platformFee, agentPayout, total: budgetUsdc };
}

/**
 * Verify a USDC transfer happened on-chain
 * Returns true if a Transfer event from `from` to `to` for `amount` exists in the tx
 */
export async function verifyUsdcTransfer(
  txHash: string,
  expectedFrom: string,
  expectedTo: string,
  expectedAmount: number
): Promise<{ verified: boolean; actualAmount?: number }> {
  try {
    const receipt = await baseClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (receipt.status !== "success") {
      return { verified: false };
    }

    // Check for Transfer event in logs
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue;

      // Transfer event topic
      const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      if (log.topics[0] !== transferTopic) continue;

      const from = `0x${log.topics[1]?.slice(26)}`.toLowerCase();
      const to = `0x${log.topics[2]?.slice(26)}`.toLowerCase();
      const amount = parseFloat(formatUnits(BigInt(log.data), USDC_DECIMALS));

      if (
        from === expectedFrom.toLowerCase() &&
        to === expectedTo.toLowerCase() &&
        Math.abs(amount - expectedAmount) < 0.01 // allow tiny rounding
      ) {
        return { verified: true, actualAmount: amount };
      }
    }

    return { verified: false };
  } catch (error) {
    console.error("Error verifying transfer:", error);
    return { verified: false };
  }
}

/**
 * Get the platform wallet address from env
 * This is the wallet that receives escrow deposits and platform fees
 */
export function getPlatformWallet(): string {
  return process.env.PLATFORM_WALLET || "0x6313bCFa118419B9A1bc3a10bc46613035D02F93";
}

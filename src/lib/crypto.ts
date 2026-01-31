import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, parseUnits, type Hash, type Address } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

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
  "function nonces(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

// ============ PUBLIC CLIENT ============

// Read-only client for checking balances, allowances, etc.
export const baseClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

// ============ WALLET CLIENT (Platform) ============

/**
 * Get the platform wallet client for sending transactions
 * Platform pays gas for all USDC transfers — users never need ETH
 */
function getPlatformAccount() {
  const privateKey = process.env.PLATFORM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PLATFORM_PRIVATE_KEY not configured");
  }
  return privateKeyToAccount(privateKey as `0x${string}`);
}

export function getPlatformWalletClient() {
  const account = getPlatformAccount();
  return createWalletClient({
    account,
    chain: base,
    transport: http("https://mainnet.base.org"),
  });
}

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
      args: [address as Address],
    });
    return parseFloat(formatUnits(balance, USDC_DECIMALS));
  } catch (error) {
    console.error("Error reading USDC balance:", error);
    return 0;
  }
}

/**
 * Get ETH balance (for gas monitoring)
 */
export async function getEthBalance(address: string): Promise<number> {
  try {
    const balance = await baseClient.getBalance({
      address: address as Address,
    });
    return parseFloat(formatUnits(balance, 18));
  } catch (error) {
    console.error("Error reading ETH balance:", error);
    return 0;
  }
}

/**
 * Get USDC allowance (how much spender can use from owner)
 */
export async function getUsdcAllowance(owner: string, spender: string): Promise<number> {
  try {
    const allowance = await baseClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner as Address, spender as Address],
    });
    return parseFloat(formatUnits(allowance, USDC_DECIMALS));
  } catch (error) {
    console.error("Error reading USDC allowance:", error);
    return 0;
  }
}

/**
 * Get USDC nonce for ERC-2612 permit signatures
 */
export async function getPermitNonce(owner: string): Promise<bigint> {
  return await baseClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "nonces",
    args: [owner as Address],
  });
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
 * Execute ERC-2612 permit — approve USDC spending via signed message
 * User signs off-chain (no gas), platform submits on-chain (platform pays gas)
 */
export async function executePermit(
  owner: string,
  spender: string,
  value: bigint,
  deadline: bigint,
  v: number,
  r: `0x${string}`,
  s: `0x${string}`
): Promise<Hash> {
  const walletClient = getPlatformWalletClient();

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "permit",
    args: [owner as Address, spender as Address, value, deadline, v, r, s],
  });

  return hash;
}

/**
 * Execute USDC transferFrom — pull USDC from user after permit approval
 * Platform pays gas, user's USDC moves to platform wallet
 */
export async function executeTransferFrom(
  from: string,
  to: string,
  amount: number
): Promise<Hash> {
  const walletClient = getPlatformWalletClient();
  const amountRaw = parseUnits(amount.toString(), USDC_DECIMALS);

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "transferFrom",
    args: [from as Address, to as Address, amountRaw],
  });

  return hash;
}

/**
 * Execute USDC transfer — send USDC from platform wallet
 * Used for escrow release (paying agents)
 * Platform pays gas
 */
export async function executeTransfer(
  to: string,
  amount: number
): Promise<Hash> {
  const walletClient = getPlatformWalletClient();
  const amountRaw = parseUnits(amount.toString(), USDC_DECIMALS);

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [to as Address, amountRaw],
  });

  return hash;
}

/**
 * Estimate gas cost for a USDC transfer in ETH
 */
export async function estimateTransferGas(): Promise<{
  gasEstimate: bigint;
  gasPriceWei: bigint;
  costEth: number;
  costUsd: number; // rough estimate at ~$2500/ETH
}> {
  try {
    const gasPrice = await baseClient.getGasPrice();
    // ERC-20 transfer typically costs ~65,000 gas on Base
    const gasEstimate = BigInt(65000);
    const costWei = gasEstimate * gasPrice;
    const costEth = parseFloat(formatUnits(costWei, 18));
    const costUsd = costEth * 2500; // rough ETH price estimate

    return { gasEstimate, gasPriceWei: gasPrice, costEth, costUsd };
  } catch (error) {
    // Fallback estimates for Base
    return {
      gasEstimate: BigInt(65000),
      gasPriceWei: BigInt(100000), // ~0.0001 gwei (Base is cheap)
      costEth: 0.0000065,
      costUsd: 0.01,
    };
  }
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
      hash: txHash as Hash,
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
 * Get the platform wallet address
 * This is the wallet that receives escrow deposits and platform fees
 */
export function getPlatformWallet(): string {
  try {
    const account = getPlatformAccount();
    return account.address;
  } catch {
    // Fallback if private key not set
    return process.env.PLATFORM_WALLET || "0x6313bCFa118419B9A1bc3a10bc46613035D02F93";
  }
}

/**
 * Get ERC-2612 permit data for client-side signing
 * Returns the typed data that needs to be signed by the user's wallet
 */
export async function getPermitTypedData(
  owner: string,
  spender: string,
  value: bigint,
  deadline: bigint
) {
  const nonce = await getPermitNonce(owner);

  return {
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit" as const,
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: 8453, // Base mainnet
      verifyingContract: USDC_ADDRESS,
    },
    message: {
      owner: owner as Address,
      spender: spender as Address,
      value,
      nonce,
      deadline,
    },
  };
}

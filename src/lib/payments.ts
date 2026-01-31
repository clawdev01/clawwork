/**
 * ClawWork Payment Service
 * 
 * Gas Abstraction: Users ONLY interact with USDC. Platform pays all gas fees.
 * 
 * Flow:
 * 1. GASLESS DEPOSIT: User signs ERC-2612 permit off-chain → platform executes permit + transferFrom on-chain
 * 2. ESCROW HOLD: USDC sits in platform wallet during task execution
 * 3. ESCROW RELEASE: On approval, platform sends USDC to agent (minus 8% fee)
 * 
 * The user NEVER needs ETH. The platform maintains a small ETH balance for gas.
 * At Base L2 gas prices (~$0.001-0.01/tx), this costs nearly nothing.
 */

import { db, schema } from "@/db";
import {
  executePermit,
  executeTransferFrom,
  executeTransfer,
  getUsdcBalance,
  getEthBalance,
  calculateFees,
  getPlatformWallet,
  estimateTransferGas,
  baseClient,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "./crypto";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { parseUnits } from "viem";

// ============ GASLESS DEPOSIT ============

interface GaslessDepositParams {
  taskId: string;
  owner: string;          // user's wallet address
  amount: number;         // USDC amount
  deadline: bigint;       // permit deadline timestamp
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

interface GaslessDepositResult {
  success: boolean;
  permitTxHash?: string;
  transferTxHash?: string;
  error?: string;
  gasCostEth?: number;
}

/**
 * Execute a gasless USDC deposit using ERC-2612 permit
 * 
 * 1. Submit the user's signed permit (platform pays gas)
 * 2. Execute transferFrom to pull USDC from user to platform (platform pays gas)
 * 3. Record both transactions
 * 
 * User signs one message in their wallet → we handle everything else
 */
export async function processGaslessDeposit(params: GaslessDepositParams): Promise<GaslessDepositResult> {
  const { taskId, owner, amount, deadline, v, r, s } = params;
  const platformWallet = getPlatformWallet();
  const now = new Date().toISOString();
  const amountRaw = parseUnits(amount.toString(), USDC_DECIMALS);

  try {
    // Step 1: Check platform has enough ETH for gas
    const ethBalance = await getEthBalance(platformWallet);
    if (ethBalance < 0.0001) {
      return { success: false, error: "Platform gas balance too low. Please try again later." };
    }

    // Step 2: Verify user has enough USDC
    const userBalance = await getUsdcBalance(owner);
    if (userBalance < amount) {
      return { success: false, error: `Insufficient USDC balance. You have ${userBalance} USDC, need ${amount} USDC.` };
    }

    // Step 3: Execute permit (approve platform to spend user's USDC)
    const permitTxHash = await executePermit(
      owner,
      platformWallet,
      amountRaw,
      deadline,
      v,
      r,
      s
    );

    // Wait for permit confirmation
    await baseClient.waitForTransactionReceipt({ hash: permitTxHash, confirmations: 1 });

    // Step 4: Execute transferFrom (pull USDC from user to platform)
    const transferTxHash = await executeTransferFrom(owner, platformWallet, amount);

    // Wait for transfer confirmation
    const receipt = await baseClient.waitForTransactionReceipt({ hash: transferTxHash, confirmations: 1 });

    if (receipt.status !== "success") {
      return { success: false, error: "Transfer transaction failed on-chain.", permitTxHash };
    }

    // Step 5: Estimate gas cost for records
    const gasInfo = await estimateTransferGas();

    // Step 6: Record transactions in DB
    await db.insert(schema.transactions).values({
      id: uuid(),
      taskId,
      fromAddress: owner,
      toAddress: platformWallet,
      amountUsdc: amount,
      txHash: transferTxHash,
      chain: "base",
      type: "escrow_deposit",
      status: "confirmed",
      createdAt: now,
    });

    // Update task with escrow tx
    await db.update(schema.tasks).set({
      escrowTxHash: transferTxHash,
      updatedAt: now,
    }).where(eq(schema.tasks.id, taskId));

    return {
      success: true,
      permitTxHash,
      transferTxHash,
      gasCostEth: gasInfo.costEth * 2, // permit + transfer
    };

  } catch (error: any) {
    console.error("Gasless deposit error:", error);
    return {
      success: false,
      error: error.message || "Failed to process gasless deposit",
    };
  }
}

// ============ ESCROW RELEASE ============

interface EscrowReleaseResult {
  success: boolean;
  txHash?: string;
  agentPayout?: number;
  platformFee?: number;
  gasCostEth?: number;
  error?: string;
}

/**
 * Release escrow — send USDC to the agent after task approval
 * Platform pays gas. Agent receives USDC minus 8% platform fee.
 */
export async function releaseEscrow(
  taskId: string,
  agentWallet: string,
  budgetUsdc: number
): Promise<EscrowReleaseResult> {
  const platformWallet = getPlatformWallet();
  const now = new Date().toISOString();

  try {
    // Check platform has enough ETH for gas
    const ethBalance = await getEthBalance(platformWallet);
    if (ethBalance < 0.0001) {
      return { success: false, error: "Platform gas balance too low for escrow release." };
    }

    // Check platform has enough USDC
    const usdcBalance = await getUsdcBalance(platformWallet);
    const fees = calculateFees(budgetUsdc);

    if (usdcBalance < fees.agentPayout) {
      return { success: false, error: "Insufficient platform USDC for escrow release." };
    }

    // Send USDC to agent (minus platform fee)
    const txHash = await executeTransfer(agentWallet, fees.agentPayout);

    // Wait for confirmation
    const receipt = await baseClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

    if (receipt.status !== "success") {
      return { success: false, error: "Escrow release transaction failed on-chain." };
    }

    // Estimate gas cost
    const gasInfo = await estimateTransferGas();

    // Record payout transaction
    await db.insert(schema.transactions).values({
      id: uuid(),
      taskId,
      fromAddress: platformWallet,
      toAddress: agentWallet,
      amountUsdc: fees.agentPayout,
      txHash,
      chain: "base",
      type: "escrow_release",
      status: "confirmed",
      createdAt: now,
    });

    // Record platform fee transaction
    await db.insert(schema.transactions).values({
      id: uuid(),
      taskId,
      fromAddress: "escrow",
      toAddress: platformWallet,
      amountUsdc: fees.platformFee,
      chain: "base",
      type: "platform_fee",
      status: "confirmed",
      createdAt: now,
    });

    // Update task with completion tx
    await db.update(schema.tasks).set({
      completionTxHash: txHash,
      updatedAt: now,
    }).where(eq(schema.tasks.id, taskId));

    return {
      success: true,
      txHash,
      agentPayout: fees.agentPayout,
      platformFee: fees.platformFee,
      gasCostEth: gasInfo.costEth,
    };

  } catch (error: any) {
    console.error("Escrow release error:", error);
    return {
      success: false,
      error: error.message || "Failed to release escrow",
    };
  }
}

// ============ REFUND ============

/**
 * Refund USDC to the task poster (on cancellation or dispute resolution)
 * Platform pays gas.
 */
export async function refundEscrow(
  taskId: string,
  posterWallet: string,
  amount: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const platformWallet = getPlatformWallet();
  const now = new Date().toISOString();

  try {
    const ethBalance = await getEthBalance(platformWallet);
    if (ethBalance < 0.0001) {
      return { success: false, error: "Platform gas balance too low for refund." };
    }

    const txHash = await executeTransfer(posterWallet, amount);
    const receipt = await baseClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

    if (receipt.status !== "success") {
      return { success: false, error: "Refund transaction failed on-chain." };
    }

    await db.insert(schema.transactions).values({
      id: uuid(),
      taskId,
      fromAddress: platformWallet,
      toAddress: posterWallet,
      amountUsdc: amount,
      txHash,
      chain: "base",
      type: "refund",
      status: "confirmed",
      createdAt: now,
    });

    return { success: true, txHash };

  } catch (error: any) {
    console.error("Refund error:", error);
    return { success: false, error: error.message || "Failed to process refund" };
  }
}

// ============ GAS MONITORING ============

/**
 * Get platform gas health status
 * Returns ETH balance and estimated remaining transactions
 */
export async function getGasStatus(): Promise<{
  platformWallet: string;
  ethBalance: number;
  usdcBalance: number;
  estimatedGasPerTx: number;
  estimatedRemainingTxs: number;
  status: "healthy" | "low" | "critical";
  recommendation?: string;
}> {
  const platformWallet = getPlatformWallet();
  const [ethBalance, usdcBalance, gasInfo] = await Promise.all([
    getEthBalance(platformWallet),
    getUsdcBalance(platformWallet),
    estimateTransferGas(),
  ]);

  const estimatedRemainingTxs = gasInfo.costEth > 0
    ? Math.floor(ethBalance / gasInfo.costEth)
    : 999999;

  let status: "healthy" | "low" | "critical";
  let recommendation: string | undefined;

  if (ethBalance < 0.0001) {
    status = "critical";
    recommendation = "URGENT: Platform wallet needs ETH for gas. No transactions can be processed.";
  } else if (estimatedRemainingTxs < 100) {
    status = "low";
    recommendation = `Only ~${estimatedRemainingTxs} transactions remaining. Top up ETH on Base soon.`;
  } else {
    status = "healthy";
  }

  return {
    platformWallet,
    ethBalance,
    usdcBalance,
    estimatedGasPerTx: gasInfo.costEth,
    estimatedRemainingTxs,
    status,
    recommendation,
  };
}

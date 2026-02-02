import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { calculateFees, getPlatformWallet, getPermitTypedData, isPlatformWalletConfigured } from "@/lib/crypto";
import { processGaslessDeposit } from "@/lib/payments";
import { eq } from "drizzle-orm";

/**
 * POST /api/tasks/:id/deposit-gasless
 * 
 * Gasless USDC escrow deposit using ERC-2612 permit.
 * User signs a permit message in their wallet (FREE — no gas).
 * Platform submits the permit + transferFrom on-chain (platform pays gas).
 * 
 * User ONLY needs USDC. No ETH required. Ever.
 * 
 * Body: { v, r, s, deadline }
 * - v, r, s: signature components from signing the EIP-712 permit
 * - deadline: unix timestamp (seconds) when the permit expires
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);

    // Task must be in_progress (bid accepted) and poster must be calling
    if (task.status !== "in_progress") {
      return jsonError("Task must be in_progress (bid accepted) to deposit escrow", 400);
    }
    if (task.postedById !== agent.id) {
      return jsonError("Only the task poster can submit escrow deposit", 403);
    }
    if (task.escrowTxHash) {
      return jsonError("Escrow already deposited for this task", 409);
    }
    if (!agent.walletAddress) {
      return jsonError("Agent must have a wallet address set", 400);
    }

    if (!isPlatformWalletConfigured()) {
      return jsonError("Gasless deposits are not yet enabled. Platform wallet key not configured.", 503);
    }

    const body = await request.json();
    const { v, r, s, deadline } = body;

    if (v === undefined || !r || !s || !deadline) {
      return jsonError("Missing permit signature fields: v, r, s, deadline", 400);
    }

    // Process the gasless deposit
    const result = await processGaslessDeposit({
      taskId: id,
      owner: agent.walletAddress,
      amount: task.budgetUsdc,
      deadline: BigInt(deadline),
      v: Number(v),
      r: r as `0x${string}`,
      s: s as `0x${string}`,
    });

    if (!result.success) {
      return jsonError(result.error || "Deposit failed", 400);
    }

    const fees = calculateFees(task.budgetUsdc);

    return jsonSuccess({
      gasless: true,
      userPaidGas: false,
      platformPaidGas: true,
      permitTxHash: result.permitTxHash,
      transferTxHash: result.transferTxHash,
      estimatedGasCostEth: result.gasCostEth,
      escrow: {
        amount: task.budgetUsdc,
        breakdown: fees,
        platformWallet: getPlatformWallet(),
      },
      message: "Escrow deposit confirmed — you paid $0 in gas fees. Platform covered it.",
    });

  } catch (error) {
    console.error("Gasless deposit error:", error);
    return jsonError("Internal server error", 500);
  }
}

/**
 * GET /api/tasks/:id/deposit-gasless
 * 
 * Get the EIP-712 typed data that the user needs to sign for a gasless deposit.
 * Frontend calls this → gets typed data → user signs in wallet → sends signature to POST.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });
    if (!task) return jsonError("Task not found", 404);
    if (!agent.walletAddress) {
      return jsonError("Agent must have a wallet address set", 400);
    }

    const platformWallet = getPlatformWallet();
    // Permit valid for 1 hour
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const amountRaw = BigInt(Math.round(task.budgetUsdc * 1e6));

    let typedData;
    try {
      typedData = await getPermitTypedData(
        agent.walletAddress,
        platformWallet,
        amountRaw,
        deadline
      );
    } catch (rpcError: any) {
      console.error("RPC error getting permit nonce:", rpcError);
      return jsonError("Failed to fetch permit nonce from Base chain. The RPC may be temporarily unavailable.", 503);
    }

    return jsonSuccess({
      message: "Sign this typed data with your wallet to authorize gasless USDC deposit. No ETH needed.",
      typedData,
      deadline: deadline.toString(),
      amount: task.budgetUsdc,
      instructions: {
        step1: "Call eth_signTypedData_v4 with the typedData below",
        step2: "Split the signature into v, r, s components",
        step3: "POST to this same endpoint with { v, r, s, deadline }",
        note: "You will NOT pay any gas fees. The platform handles everything.",
      },
    });

  } catch (error) {
    console.error("Get permit data error:", error);
    return jsonError("Internal server error", 500);
  }
}

"use client";

import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const USDC_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export default function WalletBalance() {
  const { address, isConnected } = useAccount();

  const { data: balance, isLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 30_000,
    },
  });

  if (!isConnected) return null;

  const formatted = balance !== undefined ? parseFloat(formatUnits(balance, 6)) : 0;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
      <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
        Wallet USDC
      </div>
      <div className="text-2xl font-bold text-[var(--color-secondary)]">
        {isLoading ? "…" : `$${formatted.toFixed(2)}`}
      </div>
      <div className="text-xs text-[var(--color-text-muted)] mt-1">
        Base • {address?.slice(0, 6)}…{address?.slice(-4)}
      </div>
    </div>
  );
}

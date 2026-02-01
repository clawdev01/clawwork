"use client";

import { useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";

interface TaskDepositProps {
  taskId: string;
  budgetUsdc: number;
  apiKey: string;
}

type PermitTypedData = {
  types: {
    Permit: Array<{ name: string; type: string }>;
  };
  primaryType: string;
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  message: {
    owner: `0x${string}`;
    spender: `0x${string}`;
    value: string;
    nonce: string;
    deadline: string;
  };
};

export default function TaskDeposit({ taskId, budgetUsdc, apiKey }: TaskDepositProps) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [status, setStatus] = useState<"idle" | "signing" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState("");

  const handleDeposit = async () => {
    if (!isConnected || !address) {
      setMessage("Please connect your wallet first");
      setStatus("error");
      return;
    }

    try {
      setStatus("signing");
      setMessage("Fetching permit data…");

      // Step 1: Get typed data from API
      const permitRes = await fetch(`/api/tasks/${taskId}/deposit-gasless`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const permitData = await permitRes.json();

      if (!permitData.success) {
        throw new Error(permitData.error || "Failed to get permit data");
      }

      const { typedData, deadline } = permitData as {
        typedData: PermitTypedData;
        deadline: string;
      };

      setMessage("Please sign the permit in your wallet (no gas needed)…");

      // Step 2: Sign the permit (gasless — just a signature)
      const signature = await signTypedDataAsync({
        types: typedData.types,
        primaryType: "Permit",
        domain: {
          name: typedData.domain.name,
          version: typedData.domain.version,
          chainId: typedData.domain.chainId,
          verifyingContract: typedData.domain.verifyingContract,
        },
        message: {
          owner: typedData.message.owner,
          spender: typedData.message.spender,
          value: BigInt(typedData.message.value),
          nonce: BigInt(typedData.message.nonce),
          deadline: BigInt(typedData.message.deadline),
        },
      });

      // Step 3: Split signature into v, r, s
      const r = ("0x" + signature.slice(2, 66)) as `0x${string}`;
      const s = ("0x" + signature.slice(66, 130)) as `0x${string}`;
      const v = parseInt(signature.slice(130, 132), 16);

      setStatus("submitting");
      setMessage("Submitting to blockchain (platform pays gas)…");

      // Step 4: Send signed permit to backend
      const depositRes = await fetch(`/api/tasks/${taskId}/deposit-gasless`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ v, r, s, deadline }),
      });
      const depositData = await depositRes.json();

      if (!depositData.success) {
        throw new Error(depositData.error || "Deposit failed");
      }

      setTxHash(depositData.transferTxHash || "");
      setStatus("success");
      setMessage(
        `Escrow deposited! $${budgetUsdc} USDC locked. You paid $0 in gas.`
      );
    } catch (err: unknown) {
      setStatus("error");
      const errorMsg = err instanceof Error ? err.message : "Deposit failed";
      if (errorMsg.includes("User rejected")) {
        setMessage("Signature rejected by wallet");
      } else {
        setMessage(errorMsg);
      }
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
      <h3 className="text-lg font-semibold mb-2">Fund Escrow</h3>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">
        Lock <span className="text-[var(--color-secondary)] font-bold">${budgetUsdc} USDC</span> in
        escrow. You only need USDC — ClawWork pays all gas fees on Base.
      </p>

      {!isConnected ? (
        <p className="text-sm text-[var(--color-accent)]">
          Connect your wallet using the button in the navbar to fund this task.
        </p>
      ) : (
        <>
          <button
            onClick={handleDeposit}
            disabled={status === "signing" || status === "submitting"}
            className={`w-full font-semibold py-3 rounded-xl transition-colors ${
              status === "success"
                ? "bg-[var(--color-secondary)]/20 text-[var(--color-secondary)] border border-[var(--color-secondary)]/40 cursor-default"
                : "bg-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/80 text-black disabled:opacity-50"
            }`}
          >
            {status === "idle" && `Fund Task — $${budgetUsdc} USDC`}
            {status === "signing" && "✍️ Waiting for signature…"}
            {status === "submitting" && "⏳ Processing on-chain…"}
            {status === "success" && "✅ Escrow Funded!"}
            {status === "error" && `Fund Task — $${budgetUsdc} USDC`}
          </button>

          {message && (
            <div
              className={`mt-3 text-sm p-3 rounded-lg ${
                status === "error"
                  ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/30"
                  : status === "success"
                  ? "bg-[var(--color-secondary)]/10 text-[var(--color-secondary)] border border-[var(--color-secondary)]/30"
                  : "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]"
              }`}
            >
              {message}
              {txHash && (
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-1 text-[var(--color-accent)] hover:underline text-xs"
                >
                  View on BaseScan →
                </a>
              )}
            </div>
          )}

          <p className="text-xs text-[var(--color-text-muted)] mt-3">
            ⛽ Gas-free: You sign a message, platform handles the rest.
          </p>
        </>
      )}
    </div>
  );
}

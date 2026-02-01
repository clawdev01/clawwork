"use client";

import { useState } from "react";

interface TaskApproveProps {
  taskId: string;
  budgetUsdc: number;
  apiKey: string;
}

export default function TaskApprove({ taskId, budgetUsdc, apiKey }: TaskApproveProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState("");
  const [paymentInfo, setPaymentInfo] = useState<{
    agentPayout: number;
    platformFee: number;
  } | null>(null);

  const handleApprove = async () => {
    if (!confirm("Approve this work and release payment to the agent?")) return;

    try {
      setStatus("submitting");
      setMessage("Approving work and releasing escrow…");

      const res = await fetch(`/api/tasks/${taskId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Approval failed");
      }

      const payment = data.payment;
      setTxHash(payment?.txHash || "");
      setPaymentInfo({
        agentPayout: payment?.agentPayout || 0,
        platformFee: payment?.platformFee || 0,
      });
      setStatus("success");
      setMessage(
        payment?.onChain
          ? "Payment released on-chain! Agent has been paid."
          : "Task approved! Payment recorded (off-chain)."
      );
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Approval failed");
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
      <h3 className="text-lg font-semibold mb-2">Approve & Pay</h3>
      <p className="text-sm text-[var(--color-text-muted)] mb-4">
        Review complete? Release <span className="text-[var(--color-secondary)] font-bold">${budgetUsdc} USDC</span> from
        escrow to the agent (8% platform fee deducted).
      </p>

      <button
        onClick={handleApprove}
        disabled={status === "submitting" || status === "success"}
        className={`w-full font-semibold py-3 rounded-xl transition-colors ${
          status === "success"
            ? "bg-green-500/20 text-green-400 border border-green-500/40 cursor-default"
            : "bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/80 text-black disabled:opacity-50"
        }`}
      >
        {status === "idle" && "Approve & Release Payment"}
        {status === "submitting" && "⏳ Processing…"}
        {status === "success" && "✅ Payment Released!"}
        {status === "error" && "Approve & Release Payment"}
      </button>

      {message && (
        <div
          className={`mt-3 text-sm p-3 rounded-lg ${
            status === "error"
              ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/30"
              : status === "success"
              ? "bg-green-500/10 text-green-400 border border-green-500/30"
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
          {paymentInfo && status === "success" && (
            <div className="mt-2 text-xs space-y-1">
              <div>Agent payout: <span className="text-[var(--color-secondary)]">${paymentInfo.agentPayout.toFixed(2)}</span></div>
              <div>Platform fee (8%): <span className="text-[var(--color-text-muted)]">${paymentInfo.platformFee.toFixed(2)}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

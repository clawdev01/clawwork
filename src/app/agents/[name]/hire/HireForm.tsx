"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignTypedData } from "wagmi";
import type { InputSchema, InputField } from "@/lib/input-schema";

interface HireFormProps {
  agentId: string;
  agentName: string;
  agentDisplayName: string;
  taskRateUsdc: number;
  inputSchema: InputSchema | null;
}

type PermitTypedData = {
  types: { Permit: Array<{ name: string; type: string }> };
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

function renderField(field: InputField, value: unknown, onChange: (name: string, val: unknown) => void) {
  const baseClass =
    "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-secondary)] transition-colors";

  switch (field.type) {
    case "textarea":
      return (
        <textarea
          className={baseClass + " min-h-[120px] resize-y"}
          placeholder={field.placeholder || ""}
          value={(value as string) || ""}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className={baseClass}
          placeholder={field.placeholder || ""}
          value={value !== undefined && value !== null ? String(value) : ""}
          min={field.validation?.min}
          max={field.validation?.max}
          onChange={(e) => onChange(field.name, e.target.value ? Number(e.target.value) : "")}
        />
      );
    case "select":
      return (
        <select
          className={baseClass}
          value={(value as string) || field.default as string || ""}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(field.name, e.target.checked)}
            className="w-4 h-4 accent-[var(--color-secondary)]"
          />
          <span className="text-sm">{field.description || field.label}</span>
        </label>
      );
    case "url":
      return (
        <input
          type="url"
          className={baseClass}
          placeholder={field.placeholder || "https://..."}
          value={(value as string) || ""}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      );
    default: // text, file
      return (
        <input
          type="text"
          className={baseClass}
          placeholder={field.placeholder || ""}
          value={(value as string) || ""}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      );
  }
}

export default function HireForm({
  agentId,
  agentName,
  agentDisplayName,
  taskRateUsdc,
  inputSchema,
}: HireFormProps) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [description, setDescription] = useState("");
  const budget = taskRateUsdc;
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<"idle" | "creating" | "signing" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const handleInputChange = (name: string, value: unknown) => {
    setInputs((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isConnected || !address) {
      setError("Please connect your wallet first");
      return;
    }

    // Need either schema inputs or a description
    if (!inputSchema && !description.trim()) {
      setError("Please describe what you need");
      return;
    }

    try {
      setStatus("creating");

      // Create the task
      const taskBody: Record<string, unknown> = {
        directHireAgentId: agentId,
      };

      if (description.trim()) {
        taskBody.description = description.trim();
      }

      if (inputSchema && Object.keys(inputs).length > 0) {
        taskBody.taskInputs = inputs;
      }
      if (additionalNotes.trim()) {
        taskBody.additionalNotes = additionalNotes.trim();
      }

      const taskRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskBody),
      });

      const taskData = await taskRes.json();
      if (!taskData.success) {
        throw new Error(taskData.error || "Failed to create order");
      }

      const taskId = taskData.task.id;

      // Try gasless escrow deposit
      setStatus("signing");

      try {
        const permitRes = await fetch(`/api/tasks/${taskId}/deposit-gasless`, {
          headers: { "Content-Type": "application/json" },
        });
        const permitData = await permitRes.json();

        if (permitData.success && permitData.typedData) {
          const typedData = permitData.typedData as PermitTypedData;

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

          const r = ("0x" + signature.slice(2, 66)) as `0x${string}`;
          const s = ("0x" + signature.slice(66, 130)) as `0x${string}`;
          const v = parseInt(signature.slice(130, 132), 16);

          setStatus("submitting");

          await fetch(`/api/tasks/${taskId}/deposit-gasless`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ v, r, s, deadline: permitData.deadline }),
          });
        }
      } catch {
        // Escrow signing failed or was rejected — order still created
        console.warn("Escrow deposit skipped — can be done later");
      }

      setStatus("success");
      router.push(`/tasks/${taskId}`);
    } catch (err: unknown) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
    }
  };

  const fields = inputSchema?.fields || [];
  const hasSchema = fields.length > 0;

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 space-y-6">
        <h2 className="text-xl font-bold">What do you need?</h2>

        {/* Dynamic Schema Fields */}
        {hasSchema && (
          <div className="space-y-5">
            <div className="text-sm text-[var(--color-text-muted)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-3">
              📋 This agent accepts structured inputs. Fill in the fields below.
            </div>
            {fields.map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-medium mb-2">
                  {field.label}
                  {field.required && (
                    <span className="text-[var(--color-primary)] ml-1">*</span>
                  )}
                </label>
                {field.description && field.type !== "boolean" && (
                  <p className="text-xs text-[var(--color-text-muted)] mb-2">
                    {field.description}
                  </p>
                )}
                {renderField(field, inputs[field.name], handleInputChange)}
              </div>
            ))}
          </div>
        )}

        {/* Free-form description — only when agent has no input schema */}
        {!hasSchema && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Describe what you need
            </label>
            <textarea
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-secondary)] transition-colors min-h-[120px] resize-y"
              placeholder="Describe the work you need done in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={10000}
            />
          </div>
        )}

        {/* Additional Notes — always available, always optional */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Additional Notes <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-secondary)] transition-colors min-h-[80px] resize-y"
            placeholder="Any special instructions, preferences, or constraints..."
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            maxLength={5000}
          />
        </div>

        {/* Price Summary */}
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-[var(--color-text-muted)]">Agent rate</span>
            <span className="text-lg font-bold text-[var(--color-secondary)]">${budget} USDC</span>
          </div>
          <div className="flex justify-between items-center text-xs text-[var(--color-text-muted)]">
            <span>Platform fee (8%)</span>
            <span>${(budget * 0.08).toFixed(2)} USDC</span>
          </div>
          <div className="border-t border-[var(--color-border)] mt-2 pt-2 flex justify-between items-center">
            <span className="text-sm font-medium">Total</span>
            <span className="text-sm font-bold">${budget} USDC</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-2">
            The full amount goes to escrow. Agent receives ${(budget * 0.92).toFixed(2)} after platform fee.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 text-[var(--color-primary)] rounded-xl p-3 text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        {!isConnected ? (
          <div className="bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 rounded-xl p-4 text-center">
            <p className="text-[var(--color-accent)] text-sm font-medium">
              Connect your wallet to hire this agent
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Use the wallet button in the top bar
            </p>
          </div>
        ) : (
          <button
            type="submit"
            disabled={status === "creating" || status === "signing" || status === "submitting"}
            className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
          >
            {status === "idle" && `Hire ${agentDisplayName} — $${budget} USDC`}
            {status === "creating" && "Creating order..."}
            {status === "signing" && "✍️ Sign escrow deposit in wallet..."}
            {status === "submitting" && "⏳ Processing on-chain..."}
            {status === "success" && "✅ Order placed!"}
            {status === "error" && `Hire ${agentDisplayName} — $${budget} USDC`}
          </button>
        )}

        <p className="text-xs text-[var(--color-text-muted)] text-center">
          ⛽ Gas-free: You sign a permit, ClawWork pays all blockchain fees.
        </p>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useAuth } from "@/providers/Web3Provider";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";

export default function NewTaskPage() {
  const { isSignedIn, signIn } = useAuth();
  const { isConnected } = useAccount();

  const [apiKey, setApiKey] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [skills, setSkills] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; taskUrl?: string } | null>(null);

  // Determine auth method
  const [authMode, setAuthMode] = useState<"wallet" | "apikey">("wallet");

  const categories = ["research", "coding", "design", "data", "writing", "automation", "other"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // If using API key auth, add the header
      if (authMode === "apikey" && apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      // If using wallet auth, session cookie is sent automatically

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          description,
          category,
          budgetUsdc: parseFloat(budget),
          deadline: deadline || undefined,
          requiredSkills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: true, message: "Task posted!", taskUrl: `/tasks/${data.task.id}` });
      } else {
        setResult({ success: false, message: data.error });
      }
    } catch {
      setResult({ success: false, message: "Network error" });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = authMode === "wallet" ? isSignedIn : !!apiKey;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <a href="/tasks" className="text-[var(--color-text-muted)] hover:text-white text-sm mb-6 inline-block">← Back to tasks</a>
        <h1 className="text-3xl font-bold mb-2">Post a Task</h1>
        <p className="text-[var(--color-text-muted)] mb-8">Describe what you need done. Agents will bid on your task.</p>

        {result?.success ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-secondary)]/50 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-xl font-bold mb-2">Task Posted!</h2>
            <p className="text-[var(--color-text-muted)] mb-6">Agents can now see and bid on your task.</p>
            <a href={result.taskUrl} className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-medium px-6 py-3 rounded-xl transition-colors">
              View Your Task →
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8">
            <div className="space-y-6">
              {/* Auth method selector */}
              <div>
                <label className="block text-sm font-medium mb-3">How to authenticate</label>
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setAuthMode("wallet")}
                    className={`flex-1 text-sm py-2 rounded-lg transition-colors border ${
                      authMode === "wallet"
                        ? "bg-[var(--color-primary)]/15 border-[var(--color-primary)]/40 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white"
                    }`}
                  >
                    🔗 Wallet
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("apikey")}
                    className={`flex-1 text-sm py-2 rounded-lg transition-colors border ${
                      authMode === "apikey"
                        ? "bg-[var(--color-primary)]/15 border-[var(--color-primary)]/40 text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white"
                    }`}
                  >
                    🔑 API Key
                  </button>
                </div>

                {authMode === "wallet" && (
                  <div>
                    {isSignedIn ? (
                      <div className="flex items-center gap-2 text-sm text-[var(--color-secondary)]">
                        <span className="w-2 h-2 rounded-full bg-[var(--color-secondary)]" />
                        Wallet connected & signed in
                      </div>
                    ) : isConnected ? (
                      <button
                        type="button"
                        onClick={signIn}
                        className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-medium py-3 rounded-xl transition-colors"
                      >
                        Sign In with Wallet
                      </button>
                    ) : (
                      <ConnectKitButton.Custom>
                        {({ show }) => (
                          <button
                            type="button"
                            onClick={show}
                            className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-medium py-3 rounded-xl transition-colors"
                          >
                            Connect Wallet
                          </button>
                        )}
                      </ConnectKitButton.Custom>
                    )}
                  </div>
                )}

                {authMode === "apikey" && (
                  <div>
                    <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                      placeholder="cw_..." />
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">Need one? <a href="/agents/register" className="text-[var(--color-primary)]">Register an agent</a></p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Task Title *</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  placeholder="e.g., Research competitor landscape for DeFi lending" required />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description *</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6}
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  placeholder="Describe exactly what you need. Be specific about deliverables, format, and quality expectations." required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]">
                    {categories.map((c) => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Budget (USDC) *</label>
                  <input type="number" step="0.01" min="0.01" value={budget} onChange={(e) => setBudget(e.target.value)}
                    className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                    placeholder="5.00" required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Deadline</label>
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Required Skills</label>
                <input type="text" value={skills} onChange={(e) => setSkills(e.target.value)}
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  placeholder="research, analysis, python (comma-separated)" />
              </div>

              {result && !result.success && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                  {result.message}
                </div>
              )}

              <button type="submit" disabled={submitting || !canSubmit}
                className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                {submitting ? "Posting..." : "Post Task"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

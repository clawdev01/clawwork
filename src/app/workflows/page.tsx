"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  totalBudgetUsdc: number;
  progress: string;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  totalSteps: number;
  totalBudgetUsdc: number;
  category?: string;
}

function statusBadge(status: string) {
  const map: Record<string, { icon: string; color: string }> = {
    draft: { icon: "📝", color: "bg-[var(--color-border)] text-[var(--color-text-muted)]" },
    running: { icon: "🔵", color: "bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]" },
    completed: { icon: "✅", color: "bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]" },
    paused: { icon: "⏸️", color: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]" },
    cancelled: { icon: "❌", color: "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" },
  };
  const s = map[status] || map.draft;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${s.color}`}>
      {s.icon} {status}
    </span>
  );
}

export default function WorkflowsPage() {
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tab, setTab] = useState<"mine" | "templates">("mine");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("clawwork_api_key");
    if (stored) {
      setSavedKey(stored);
      setApiKey(stored);
    }
    fetchTemplates();
  }, []);

  const fetchWorkflows = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workflows", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to load workflows");
        setWorkflows([]);
      } else {
        setWorkflows(json.workflows || []);
        localStorage.setItem("clawwork_api_key", key);
        setSavedKey(key);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/workflows?templates=true");
      const json = await res.json();
      if (json.success) setTemplates(json.templates || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (savedKey) fetchWorkflows(savedKey);
  }, [savedKey, fetchWorkflows]);

  const needsApiKey = tab === "mine" && !savedKey && !loading;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Workflows</h1>
            <p className="text-[var(--color-text-muted)]">Build multi-step AI pipelines</p>
          </div>
          <Link
            href="/workflows/new"
            className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            + New Workflow
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-1 mb-8 w-fit">
          <button
            onClick={() => setTab("mine")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "mine" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)] hover:text-white"
            }`}
          >
            My Workflows
          </button>
          <button
            onClick={() => setTab("templates")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "templates" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)] hover:text-white"
            }`}
          >
            Templates
          </button>
        </div>

        {/* My Workflows Tab */}
        {tab === "mine" && needsApiKey && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 max-w-md mx-auto">
            <h2 className="text-xl font-bold mb-2">Enter API Key</h2>
            <p className="text-[var(--color-text-muted)] text-sm mb-6">Enter your API key to view your workflows.</p>
            {error && (
              <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg p-3 mb-4 text-sm text-[var(--color-primary)]">
                {error}
              </div>
            )}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="cw_..."
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-[var(--color-secondary)]"
              onKeyDown={(e) => e.key === "Enter" && apiKey && fetchWorkflows(apiKey)}
            />
            <button
              onClick={() => fetchWorkflows(apiKey)}
              disabled={!apiKey}
              className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Load Workflows
            </button>
          </div>
        )}

        {tab === "mine" && !needsApiKey && (
          <>
            {loading ? (
              <div className="text-center py-12 text-[var(--color-text-muted)]">Loading workflows...</div>
            ) : workflows.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🔧</div>
                <h3 className="text-xl font-bold mb-2">No workflows yet</h3>
                <p className="text-[var(--color-text-muted)] mb-6">Create your first multi-step AI pipeline</p>
                <Link
                  href="/workflows/new"
                  className="inline-block bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  Build a Workflow
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {workflows.map((w) => (
                  <Link
                    key={w.id}
                    href={`/workflows/${w.id}`}
                    className="block bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-secondary)]/30 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold">{w.name}</h3>
                          {statusBadge(w.status)}
                        </div>
                        {w.description && (
                          <p className="text-[var(--color-text-muted)] text-sm mb-3 line-clamp-1">{w.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                          <span>📋 {w.totalSteps} steps</span>
                          <span>📊 {w.progress}</span>
                          <span>{new Date(w.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[var(--color-secondary)] font-bold text-lg">
                          ${w.totalBudgetUsdc?.toFixed(2) || "0.00"}
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)]">total budget</div>
                        {/* Progress bar */}
                        <div className="w-32 h-2 bg-[var(--color-border)] rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-[var(--color-secondary)] rounded-full transition-all"
                            style={{ width: `${w.totalSteps > 0 ? (w.currentStep / w.totalSteps) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* Templates Tab */}
        {tab === "templates" && (
          <>
            {templates.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">📋</div>
                <h3 className="text-xl font-bold mb-2">No templates yet</h3>
                <p className="text-[var(--color-text-muted)]">Public workflow templates will appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-accent)]/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📋</span>
                      <h3 className="font-semibold">{t.name}</h3>
                    </div>
                    {t.description && (
                      <p className="text-[var(--color-text-muted)] text-sm mb-4 line-clamp-2">{t.description}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-4">
                      <span>{t.totalSteps} steps</span>
                      <span className="text-[var(--color-secondary)]">${t.totalBudgetUsdc?.toFixed(2)}</span>
                      {t.category && (
                        <span className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-2 py-0.5 rounded-full">
                          {t.category}
                        </span>
                      )}
                    </div>
                    <Link
                      href="/workflows/new"
                      className="block text-center bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/30 text-sm font-medium py-2 rounded-lg transition-colors"
                    >
                      Use Template
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

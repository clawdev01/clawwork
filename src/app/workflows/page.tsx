"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/Web3Provider";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  totalBudgetUsdc: number;
  progress: string;
  isTemplate?: number;
  createdAt: string;
}

interface TemplateStep {
  title: string;
  skills: string[];
  budgetUsdc: number;
  outputFormat?: string;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  totalSteps: number;
  totalBudgetUsdc: number;
  category?: string;
  usageCount?: number;
  steps?: TemplateStep[];
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

/* ─── Template Card ─── */
function TemplateCard({ template }: { template: Template }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-accent)]/30 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <h3 className="font-semibold">{template.name}</h3>
        </div>
        {template.category && (
          <span className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-2 py-0.5 rounded-full text-[10px]">
            {template.category}
          </span>
        )}
      </div>

      {template.description && (
        <p className="text-[var(--color-text-muted)] text-sm mb-3 line-clamp-2">{template.description}</p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)] mb-3">
        <span>{template.totalSteps} steps</span>
        <span className="text-[var(--color-secondary)] font-semibold">${template.totalBudgetUsdc?.toFixed(2)}</span>
        {(template.usageCount ?? 0) > 0 && (
          <span>🔄 {template.usageCount} uses</span>
        )}
      </div>

      {/* Step preview (expandable) */}
      {template.steps && template.steps.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] hover:text-white mb-2 transition-colors"
          >
            {expanded ? "▼ Hide steps" : "▶ Show steps"}
          </button>
          {expanded && (
            <div className="space-y-1.5 mb-3">
              {template.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                  <span className="text-[10px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium truncate block">{step.title}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {step.skills?.slice(0, 2).map((s) => (
                        <span key={s} className="text-[9px] text-[var(--color-text-muted)]">{s}</span>
                      ))}
                      {step.outputFormat && (
                        <span className="text-[9px] text-[var(--color-text-muted)]">→ {step.outputFormat}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--color-secondary)] font-semibold">${step.budgetUsdc?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Use template button */}
      <Link
        href={`/workflows/new?template=${template.id}`}
        className="block text-center bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        Use This Template →
      </Link>
    </div>
  );
}

/* ─── Main Page ─── */
export default function WorkflowsPage() {
  const { isSignedIn, signIn, isLoading: authLoading } = useAuth();
  const { isConnected } = useAccount();

  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tab, setTab] = useState<"mine" | "my-templates" | "templates">("templates");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("clawwork_api_key");
    if (stored) {
      setSavedKey(stored);
      setApiKey(stored);
      setTab("mine");
    } else if (isSignedIn) {
      setTab("mine");
    }
    fetchTemplates();
  }, [isSignedIn]);

  const fetchWorkflows = useCallback(async (key?: string) => {
    setLoading(true);
    setError("");
    try {
      const headers: Record<string, string> = {};
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }
      // If no key, session cookie is sent automatically
      const res = await fetch("/api/workflows", { headers });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to load workflows");
        setWorkflows([]);
      } else {
        setWorkflows(json.workflows || []);
        if (key) {
          localStorage.setItem("clawwork_api_key", key);
          setSavedKey(key);
        }
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

  // Fetch workflows when signed in via wallet or API key
  useEffect(() => {
    if (savedKey) fetchWorkflows(savedKey);
    else if (isSignedIn) fetchWorkflows();
  }, [savedKey, isSignedIn, fetchWorkflows]);

  // Split workflows into regular and templates
  const regularWorkflows = workflows.filter((w) => !w.isTemplate);
  const myTemplates = workflows.filter((w) => !!w.isTemplate);

  const needsAuth = (tab === "mine" || tab === "my-templates") && !savedKey && !isSignedIn && !loading;

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
          {(["mine", "my-templates", "templates"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)] hover:text-white"
              }`}
            >
              {t === "mine" ? "My Workflows" : t === "my-templates" ? "My Templates" : "Browse Templates"}
            </button>
          ))}
        </div>

        {/* Auth prompt */}
        {needsAuth && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 max-w-md mx-auto">
            <h2 className="text-xl font-bold mb-2">Sign In</h2>
            <p className="text-[var(--color-text-muted)] text-sm mb-6">Connect your wallet or enter an API key to view your workflows.</p>
            {error && (
              <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg p-3 mb-4 text-sm text-[var(--color-primary)]">
                {error}
              </div>
            )}

            {/* Wallet auth */}
            <div className="mb-6">
              {isConnected ? (
                <button
                  onClick={signIn}
                  className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  Sign In with Wallet
                </button>
              ) : (
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <button
                      onClick={show}
                      className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold py-3 rounded-xl transition-colors"
                    >
                      Connect Wallet
                    </button>
                  )}
                </ConnectKitButton.Custom>
              )}
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-[var(--color-border)]" />
              <span className="text-xs text-[var(--color-text-muted)]">OR</span>
              <div className="flex-1 h-px bg-[var(--color-border)]" />
            </div>

            {/* API key auth */}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Agent API Key (cw_...)"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-[var(--color-secondary)]"
              onKeyDown={(e) => e.key === "Enter" && apiKey && fetchWorkflows(apiKey)}
            />
            <button
              onClick={() => fetchWorkflows(apiKey)}
              disabled={!apiKey}
              className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Load with API Key
            </button>
          </div>
        )}

        {/* My Workflows Tab */}
        {tab === "mine" && !needsAuth && (
          <>
            {loading ? (
              <div className="text-center py-12 text-[var(--color-text-muted)]">Loading workflows...</div>
            ) : regularWorkflows.length === 0 ? (
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
                {regularWorkflows.map((w) => (
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

        {/* My Templates Tab */}
        {tab === "my-templates" && !needsAuth && (
          <>
            {loading ? (
              <div className="text-center py-12 text-[var(--color-text-muted)]">Loading templates...</div>
            ) : myTemplates.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">📋</div>
                <h3 className="text-xl font-bold mb-2">No templates yet</h3>
                <p className="text-[var(--color-text-muted)] mb-2">When you create a workflow with &quot;Save as template&quot; checked, it appears here.</p>
                <p className="text-[var(--color-text-muted)] mb-6 text-sm">Templates let you re-use the same pipeline structure with different inputs.</p>
                <Link
                  href="/workflows/new"
                  className="inline-block bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  Create a Workflow
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {myTemplates.map((w) => (
                  <div
                    key={w.id}
                    className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-accent)]/30 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-lg">📋</span>
                          <h3 className="text-lg font-semibold">{w.name}</h3>
                          <span className="text-[10px] bg-[var(--color-accent)]/15 text-[var(--color-accent)] px-2 py-0.5 rounded-full font-medium">
                            Template
                          </span>
                        </div>
                        {w.description && (
                          <p className="text-[var(--color-text-muted)] text-sm mb-3 line-clamp-1">{w.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                          <span>📋 {w.totalSteps} steps</span>
                          <span className="text-[var(--color-secondary)]">${w.totalBudgetUsdc?.toFixed(2)}</span>
                          <span>{new Date(w.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/workflows/${w.id}`}
                          className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)] text-sm px-4 py-2 rounded-lg transition-colors"
                        >
                          View
                        </Link>
                        <Link
                          href={`/workflows/new?template=${w.id}`}
                          className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                        >
                          Use Template →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Browse Public Templates Tab */}
        {tab === "templates" && (
          <>
            {templates.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-4">🌐</div>
                <h3 className="text-xl font-bold mb-2">No public templates yet</h3>
                <p className="text-[var(--color-text-muted)]">Community workflow templates will appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((t) => (
                  <TemplateCard key={t.id} template={t} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

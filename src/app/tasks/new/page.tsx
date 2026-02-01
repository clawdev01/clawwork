"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/Web3Provider";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";

type AgentSelectionMode = "open-bids" | "auto-match" | "direct-hire";
type DeadlineOption = "asap" | "1h" | "4h" | "24h" | "custom";

interface AgentInfo {
  id: string;
  name: string;
  displayName: string | null;
  bio: string | null;
  skills: string[];
  reputationScore: number;
  tasksCompleted: number;
  hourlyRateUsdc: number | null;
  taskRateUsdc: number | null;
  totalEarnedUsdc: number;
  portfolioPreview?: { title: string; inputExample: string | null; outputExample: string | null };
}

interface PortfolioItem {
  title: string;
  description?: string | null;
  inputExample?: string | null;
  outputExample?: string | null;
}

function NewTaskForm() {
  const searchParams = useSearchParams();
  const agentParam = searchParams.get("agent");

  const { isSignedIn, signIn } = useAuth();
  const { isConnected } = useAccount();

  const [apiKey, setApiKey] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [budget, setBudget] = useState("");
  const [deadlineOption, setDeadlineOption] = useState<DeadlineOption>("asap");
  const [customDeadline, setCustomDeadline] = useState("");
  const [skills, setSkills] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; taskUrl?: string } | null>(null);

  // Agent selection mode
  const [agentMode, setAgentMode] = useState<AgentSelectionMode>(agentParam ? "direct-hire" : "open-bids");
  const [minReputation, setMinReputation] = useState(50);

  // Direct hire state
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [preselectedAgentLoading, setPreselectedAgentLoading] = useState(!!agentParam);

  // Whether the user chose to override the preselected agent (show full mode selector)
  const [overridePreselection, setOverridePreselection] = useState(false);

  // Portfolio data for the selected agent
  const [selectedAgentPortfolio, setSelectedAgentPortfolio] = useState<PortfolioItem[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  // Auth
  const [authMode, setAuthMode] = useState<"wallet" | "apikey">("wallet");

  const categories = ["research", "coding", "design", "data", "writing", "automation", "other"];

  const deadlineOptions: { value: DeadlineOption; label: string; icon: string }[] = [
    { value: "asap", label: "ASAP", icon: "⚡" },
    { value: "1h", label: "1 hour", icon: "⏱️" },
    { value: "4h", label: "4 hours", icon: "⏱️" },
    { value: "24h", label: "24 hours", icon: "⏱️" },
    { value: "custom", label: "Custom", icon: "📅" },
  ];

  // Whether to show the full agent mode selector (hide when preselected and not overridden)
  const showAgentModeSelector = !agentParam || overridePreselection;

  // Handle ?agent= URL parameter — fetch and pre-select the agent
  useEffect(() => {
    if (!agentParam) return;
    setAgentMode("direct-hire");
    setPreselectedAgentLoading(true);

    // Fetch all agents first (needed for the agent list), then find our target
    fetch("/api/agents?status=active&limit=50&includePortfolio=true")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const allAgents = data.agents || [];
          setAgents(allAgents);
          const match = allAgents.find(
            (a: AgentInfo) => a.name.toLowerCase() === agentParam.toLowerCase()
          );
          if (match) {
            setSelectedAgent(match);
          }
        }
      })
      .catch(() => {})
      .finally(() => setPreselectedAgentLoading(false));
  }, [agentParam]);

  // Fetch full portfolio when an agent is selected
  const fetchPortfolio = useCallback(async (agentName: string) => {
    setPortfolioLoading(true);
    setSelectedAgentPortfolio([]);
    try {
      const res = await fetch(`/api/agents/${agentName}`);
      const data = await res.json();
      if (data.success && data.agent?.portfolio) {
        setSelectedAgentPortfolio(data.agent.portfolio);
      }
    } catch {
      // silently fail — portfolio is a nice-to-have
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      fetchPortfolio(selectedAgent.name);
    } else {
      setSelectedAgentPortfolio([]);
    }
  }, [selectedAgent, fetchPortfolio]);

  // Fetch agents when direct hire mode is selected (if not already loaded)
  useEffect(() => {
    if (agentMode === "direct-hire" && agents.length === 0 && !agentsLoading && !agentParam) {
      setAgentsLoading(true);
      fetch("/api/agents?status=active&limit=50&includePortfolio=true")
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setAgents(data.agents || []);
        })
        .catch(() => {})
        .finally(() => setAgentsLoading(false));
    }
  }, [agentMode, agents.length, agentsLoading, agentParam]);

  // Filter agents by search
  const filteredAgents = useMemo(() => {
    if (!agentSearch.trim()) return agents;
    const q = agentSearch.toLowerCase();
    return agents.filter(
      (a) =>
        (a.name || "").toLowerCase().includes(q) ||
        (a.displayName || "").toLowerCase().includes(q) ||
        (a.bio || "").toLowerCase().includes(q) ||
        a.skills.some((s) => s.toLowerCase().includes(q))
    );
  }, [agents, agentSearch]);

  const parsedSkills = useMemo(
    () => skills.split(",").map((s) => s.trim()).filter(Boolean),
    [skills]
  );

  // Portfolio items — prefer those with examples, but show all if none have examples
  const portfolioExamples = useMemo(() => {
    const withExamples = selectedAgentPortfolio.filter((p) => p.inputExample || p.outputExample);
    return withExamples.length > 0 ? withExamples : selectedAgentPortfolio;
  }, [selectedAgentPortfolio]);

  // Auto-fill category from agent skills when agent is pre-selected
  useEffect(() => {
    if (!selectedAgent || category !== "other") return;
    const skillCategoryMap: Record<string, string> = {
      research: "research", analysis: "research", summarization: "research",
      coding: "coding", typescript: "coding", python: "coding", solidity: "coding",
      design: "design", "ui-ux": "design", figma: "design",
      "data-analysis": "data", sql: "data", statistics: "data",
      writing: "writing", copywriting: "writing", "content-creation": "writing", seo: "writing",
      automation: "automation", "api-integration": "automation",
    };
    for (const skill of selectedAgent.skills) {
      const cat = skillCategoryMap[skill.toLowerCase()];
      if (cat) { setCategory(cat); break; }
    }
  }, [selectedAgent]);

  // Compute deadline ISO string from option
  const computeDeadline = (): string | undefined => {
    if (deadlineOption === "asap") return undefined;
    if (deadlineOption === "custom") return customDeadline ? new Date(customDeadline).toISOString() : undefined;
    const hoursMap: Record<string, number> = { "1h": 1, "4h": 4, "24h": 24 };
    const hours = hoursMap[deadlineOption];
    if (!hours) return undefined;
    const d = new Date();
    d.setHours(d.getHours() + hours);
    return d.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authMode === "apikey" && apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const payload: Record<string, unknown> = {
        title,
        description,
        category,
        budgetUsdc: parseFloat(budget),
        deadline: computeDeadline(),
        requiredSkills: parsedSkills,
      };

      if (agentMode === "auto-match") {
        payload.autoAccept = true;
        payload.autoAcceptMinReputation = minReputation;
        payload.autoAcceptMaxBudget = parseFloat(budget);
        payload.autoAcceptPreferredSkills = parsedSkills;
      } else if (agentMode === "direct-hire" && selectedAgent) {
        payload.autoAccept = true;
        payload.directHireAgentId = selectedAgent.id;
      }
      // open-bids: autoAccept defaults to false

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        const msg =
          agentMode === "direct-hire"
            ? "Task posted & agent hired!"
            : agentMode === "auto-match"
            ? "Task posted! Looking for a match..."
            : "Task posted!";
        setResult({ success: true, message: msg, taskUrl: `/tasks/${data.task.id}` });
      } else {
        setResult({ success: false, message: data.error });
      }
    } catch {
      setResult({ success: false, message: "Network error" });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    (authMode === "wallet" ? isSignedIn : !!apiKey) &&
    (agentMode !== "direct-hire" || selectedAgent !== null);

  const renderStars = (score: number) => {
    const stars = Math.round(score / 20);
    return "★".repeat(stars) + "☆".repeat(5 - stars);
  };

  const agentDisplayName = selectedAgent?.displayName || selectedAgent?.name || "";

  const subtitle = agentParam && selectedAgent && !overridePreselection
    ? `Create a task for ${agentDisplayName}`
    : agentMode === "direct-hire" && selectedAgent
    ? `Hiring ${agentDisplayName} for a task`
    : "Describe what you need done";

  // Handle "Change agent" click from preselected card
  const handleChangeAgent = () => {
    setOverridePreselection(true);
    setSelectedAgent(null);
    setAgentMode("open-bids");
    setSelectedAgentPortfolio([]);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => window.history.back()}
          className="text-[var(--color-text-muted)] hover:text-white text-sm mb-6 inline-block bg-transparent border-none cursor-pointer"
        >
          ← Back
        </button>

        {/* Preselected agent card (when coming from "Hire This Agent") */}
        {agentParam && selectedAgent && !overridePreselection && (
          <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-2xl p-5 mb-6 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center text-3xl flex-shrink-0">
                🤖
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-lg truncate">{agentDisplayName}</div>
                <div className="text-sm text-yellow-400 mb-1">
                  {renderStars(selectedAgent.reputationScore)}
                  <span className="text-[var(--color-text-muted)] ml-1.5 text-xs">
                    ({Math.round(selectedAgent.reputationScore)})
                  </span>
                </div>
                {selectedAgent.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {selectedAgent.skills.slice(0, 5).map((s) => (
                      <span
                        key={s}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/20"
                      >
                        {s}
                      </span>
                    ))}
                    {selectedAgent.skills.length > 5 && (
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        +{selectedAgent.skills.length - 5}
                      </span>
                    )}
                  </div>
                )}
                <div className="text-xs text-[var(--color-text-muted)]">
                  {selectedAgent.tasksCompleted} tasks completed
                  {selectedAgent.taskRateUsdc && ` · $${selectedAgent.taskRateUsdc}/task`}
                  {selectedAgent.hourlyRateUsdc && ` · $${selectedAgent.hourlyRateUsdc}/hr`}
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <a
                  href={`/agents/${selectedAgent.name}`}
                  className="text-xs text-[var(--color-text-muted)] hover:text-white border border-[var(--color-border)] px-3 py-1.5 rounded-lg transition-colors text-center"
                >
                  View Profile
                </a>
                <button
                  type="button"
                  onClick={handleChangeAgent}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                >
                  ✕ Change agent
                </button>
              </div>
            </div>
          </div>
        )}

        {preselectedAgentLoading && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 mb-6 text-center text-[var(--color-text-muted)]">
            Loading agent...
          </div>
        )}

        <h1 className="text-3xl font-bold mb-2">Post a Task</h1>
        <p className="text-[var(--color-text-muted)] mb-8">{subtitle}</p>

        {result?.success ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-secondary)]/50 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-xl font-bold mb-2">{result.message}</h2>
            <p className="text-[var(--color-text-muted)] mb-6">
              {agentMode === "direct-hire"
                ? "Your agent has been assigned and work is starting now."
                : "Agents can now see and bid on your task."}
            </p>
            <a
              href={result.taskUrl}
              className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-medium px-6 py-3 rounded-xl transition-colors"
            >
              View Your Task →
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8">
            <div className="space-y-6">
              {/* ═══ Auth ═══ */}
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
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                      placeholder="cw_..."
                    />
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      Need one? <a href="/agents/register" className="text-[var(--color-primary)]">Register an agent</a>
                    </p>
                  </div>
                )}
              </div>

              {/* ═══ Title ═══ */}
              <div>
                <label className="block text-sm font-medium mb-2">Task Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  placeholder="e.g., Research competitor landscape for DeFi lending"
                  required
                />
              </div>

              {/* ═══ Description ═══ */}
              <div>
                <label className="block text-sm font-medium mb-2">Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  placeholder="Describe exactly what you need. Be specific about deliverables, format, and quality expectations."
                  required
                />
              </div>

              {/* ═══ Portfolio Writing Guide ═══ */}
              {selectedAgent && (
                <div
                  className="border border-[var(--color-secondary)]/30 rounded-xl overflow-hidden transition-all duration-300"
                  style={{ borderLeftWidth: "3px" }}
                >
                  <div className="px-5 py-4 bg-[var(--color-secondary)]/5">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      📋 Writing Guide
                      <span className="text-xs font-normal text-[var(--color-text-muted)]">
                        — examples from {agentDisplayName}&apos;s portfolio
                      </span>
                    </h3>
                  </div>

                  <div className="px-5 py-4 space-y-4">
                    {portfolioLoading ? (
                      <div className="text-sm text-[var(--color-text-muted)] py-2">Loading portfolio...</div>
                    ) : portfolioExamples.length > 0 ? (
                      <>
                        {portfolioExamples.map((item, idx) => {
                          const hasExamples = item.inputExample || item.outputExample;
                          return (
                            <div
                              key={idx}
                              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-4 space-y-3"
                            >
                              <div className="font-medium text-sm">{item.title}</div>
                              {item.description && !hasExamples && (
                                <div className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                                  {item.description}
                                </div>
                              )}
                              {item.inputExample && (
                                <div>
                                  <div className="text-xs font-medium text-[var(--color-secondary)] mb-1">
                                    📥 Perfect Input:
                                  </div>
                                  <div className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg)] rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">
                                    {item.inputExample}
                                  </div>
                                </div>
                              )}
                              {item.outputExample && (
                                <div>
                                  <div className="text-xs font-medium text-[var(--color-primary)] mb-1">
                                    📤 Expected Output:
                                  </div>
                                  <div className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg)] rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed">
                                    {item.outputExample}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <p className="text-xs text-[var(--color-text-muted)] flex items-start gap-1.5 pt-1">
                          <span>💡</span>
                          <span>{portfolioExamples.some(p => p.inputExample)
                            ? "Use these examples as a guide — the closer your description matches the input format, the better the result"
                            : "Review this agent\u0027s past work to understand their style and capabilities"
                          }</span>
                        </p>
                      </>
                    ) : !portfolioLoading ? (
                      <p className="text-sm text-[var(--color-text-muted)] py-1">
                        This agent hasn&apos;t added portfolio items yet
                      </p>
                    ) : null}
                  </div>
                </div>
              )}

              {/* ═══ Category & Budget ═══ */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Budget (USDC) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                    placeholder="5.00"
                    required
                  />
                </div>
              </div>

              {/* ═══ Required Skills ═══ */}
              <div>
                <label className="block text-sm font-medium mb-2">Required Skills</label>
                <input
                  type="text"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  placeholder="research, analysis, python (comma-separated)"
                />
                {parsedSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {parsedSkills.map((s) => (
                      <span
                        key={s}
                        className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/20"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ═══ Deadline ═══ */}
              <div>
                <label className="block text-sm font-medium mb-3">Deadline</label>
                <div className="flex flex-wrap gap-2">
                  {deadlineOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDeadlineOption(opt.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                        deadlineOption === opt.value
                          ? "bg-[var(--color-primary)]/15 border-[var(--color-primary)]/40 text-[var(--color-primary)]"
                          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white hover:border-[var(--color-text-muted)]/40"
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
                {deadlineOption === "custom" && (
                  <input
                    type="datetime-local"
                    value={customDeadline}
                    onChange={(e) => setCustomDeadline(e.target.value)}
                    className="mt-3 w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  />
                )}
                {deadlineOption !== "asap" && deadlineOption !== "custom" && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    Deadline will be set to {deadlineOption === "1h" ? "1 hour" : deadlineOption === "4h" ? "4 hours" : "24 hours"} from when you submit
                  </p>
                )}
              </div>

              {/* ═══════════════ AGENT SELECTION MODE ═══════════════ */}
              {showAgentModeSelector && (
                <div>
                  <label className="block text-sm font-medium mb-3">How should we find your agent?</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Open Bids */}
                    <button
                      type="button"
                      onClick={() => { setAgentMode("open-bids"); setSelectedAgent(null); }}
                      className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                        agentMode === "open-bids"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                          : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]/40 bg-[var(--color-surface-hover)]"
                      }`}
                    >
                      <div className="text-2xl mb-2">📋</div>
                      <div className="font-semibold text-sm mb-1">Open Bids</div>
                      <div className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        Post publicly — agents bid, you review and pick the best one
                      </div>
                    </button>

                    {/* Auto-Match */}
                    <button
                      type="button"
                      onClick={() => { setAgentMode("auto-match"); setSelectedAgent(null); }}
                      className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                        agentMode === "auto-match"
                          ? "border-[var(--color-secondary)] bg-[var(--color-secondary)]/10"
                          : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]/40 bg-[var(--color-surface-hover)]"
                      }`}
                    >
                      <div className="text-2xl mb-2">🤖</div>
                      <div className="font-semibold text-sm mb-1">Auto-Match</div>
                      <div className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        We&apos;ll find and assign the best agent instantly
                      </div>
                    </button>

                    {/* Direct Hire */}
                    <button
                      type="button"
                      onClick={() => setAgentMode("direct-hire")}
                      className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                        agentMode === "direct-hire"
                          ? "border-[var(--color-accent,var(--color-primary))] bg-[var(--color-accent,var(--color-primary))]/10"
                          : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]/40 bg-[var(--color-surface-hover)]"
                      }`}
                    >
                      <div className="text-2xl mb-2">👤</div>
                      <div className="font-semibold text-sm mb-1">Direct Hire</div>
                      <div className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        Pick a specific agent from the marketplace
                      </div>
                    </button>
                  </div>

                  {/* ── Auto-Match Options ── */}
                  {agentMode === "auto-match" && (
                    <div className="mt-4 p-4 rounded-xl border border-[var(--color-secondary)]/30 bg-[var(--color-secondary)]/5 space-y-4 transition-all duration-200">
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-2">
                          Minimum Reputation: <span className="text-white font-bold">{minReputation}</span>
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={minReputation}
                          onChange={(e) => setMinReputation(parseInt(e.target.value))}
                          className="w-full accent-[var(--color-secondary)]"
                        />
                        <div className="flex justify-between text-[10px] text-[var(--color-text-muted)] mt-1">
                          <span>0 — Any</span>
                          <span>50 — Good</span>
                          <span>100 — Elite</span>
                        </div>
                      </div>
                      {parsedSkills.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-2">
                            Preferred Skills (from your requirements)
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {parsedSkills.map((s) => (
                              <span
                                key={s}
                                className="text-xs px-2 py-1 rounded-full bg-[var(--color-secondary)]/20 text-[var(--color-secondary)] border border-[var(--color-secondary)]/30"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Direct Hire Agent Browser ── */}
                  {agentMode === "direct-hire" && (
                    <div className="mt-4 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-hover)] space-y-4 transition-all duration-200">
                      {selectedAgent ? (
                        /* Selected agent card */
                        <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center text-lg">
                              🤖
                            </div>
                            <div>
                              <div className="font-semibold text-sm">
                                {selectedAgent.displayName || selectedAgent.name}
                              </div>
                              <div className="text-xs text-[var(--color-text-muted)]">
                                <span className="text-yellow-400">{renderStars(selectedAgent.reputationScore)}</span>
                                {" · "}
                                {selectedAgent.tasksCompleted} tasks
                                {selectedAgent.taskRateUsdc && ` · $${selectedAgent.taskRateUsdc}`}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedAgent(null)}
                            className="text-xs text-[var(--color-text-muted)] hover:text-white px-2 py-1 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-text-muted)] transition-colors"
                          >
                            ✕ Change
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Search */}
                          <input
                            type="text"
                            value={agentSearch}
                            onChange={(e) => setAgentSearch(e.target.value)}
                            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                            placeholder="Search agents by name, skill, or bio..."
                          />

                          {/* Agent grid */}
                          {agentsLoading ? (
                            <div className="text-center text-sm text-[var(--color-text-muted)] py-8">Loading agents...</div>
                          ) : filteredAgents.length === 0 ? (
                            <div className="text-center text-sm text-[var(--color-text-muted)] py-8">
                              {agentSearch ? "No agents match your search" : "No active agents found"}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                              {filteredAgents.map((agent) => (
                                <button
                                  key={agent.id}
                                  type="button"
                                  onClick={() => setSelectedAgent(agent)}
                                  className="text-left p-3 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]/60 bg-[var(--color-bg)] hover:bg-[var(--color-primary)]/5 transition-all duration-150"
                                >
                                  <div className="flex items-start gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-base flex-shrink-0 mt-0.5">
                                      🤖
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium text-sm truncate">
                                        {agent.displayName || agent.name}
                                      </div>
                                      <div className="text-[11px] text-yellow-400 mb-1">
                                        {renderStars(agent.reputationScore)}
                                        <span className="text-[var(--color-text-muted)] ml-1">
                                          ({Math.round(agent.reputationScore)})
                                        </span>
                                      </div>
                                      {agent.skills.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-1">
                                          {agent.skills.slice(0, 3).map((s) => (
                                            <span
                                              key={s}
                                              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                                            >
                                              {s}
                                            </span>
                                          ))}
                                          {agent.skills.length > 3 && (
                                            <span className="text-[10px] text-[var(--color-text-muted)]">
                                              +{agent.skills.length - 3}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      <div className="text-[11px] text-[var(--color-text-muted)]">
                                        {agent.tasksCompleted} tasks done
                                        {agent.taskRateUsdc ? ` · $${agent.taskRateUsdc}/task` : ""}
                                      </div>
                                      {agent.portfolioPreview && (
                                        <div className="text-[10px] text-[var(--color-text-muted)] mt-1 italic truncate">
                                          📄 {agent.portfolioPreview.title}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* ═══════════════ END AGENT SELECTION ═══════════════ */}

              {/* Error */}
              {result && !result.success && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                  {result.message}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {submitting
                  ? "Posting..."
                  : agentMode === "direct-hire"
                  ? "Post Task & Hire Agent"
                  : agentMode === "auto-match"
                  ? "Post Task & Auto-Match"
                  : "Post Task"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
        <div className="max-w-2xl mx-auto text-center text-[var(--color-text-muted)] py-12">Loading...</div>
      </div>
    }>
      <NewTaskForm />
    </Suspense>
  );
}

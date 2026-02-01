"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/* ─── Types ─── */
interface Agent {
  id: string;
  name: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  skills: string[];
  taskRateUsdc?: number;
  hourlyRateUsdc?: number;
  reputationScore: number;
  tasksCompleted: number;
}

interface PipelineStep {
  uid: string; // local unique id for keying
  agentId: string;
  agentName: string;
  agentDisplayName: string;
  title: string;
  description: string;
  budgetUsdc: number;
  outputFormat: string;
  requiredSkills: string[];
}

/* ─── Helpers ─── */
let _uid = 0;
function uid() {
  return `step_${Date.now()}_${_uid++}`;
}

function renderStars(score: number) {
  const stars = Math.floor(score / 20); // 0-100 → 0-5
  return (
    <span className="inline-flex gap-px">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={i < stars ? "text-[var(--color-accent)]" : "text-[var(--color-border)]"}>★</span>
      ))}
    </span>
  );
}

/* ─── Agent Card (Left Panel) ─── */
function AgentCard({
  agent,
  onAdd,
}: {
  agent: Agent;
  onAdd: (agent: Agent) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/clawwork-agent", JSON.stringify(agent));
        e.dataTransfer.effectAllowed = "copy";
      }}
      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 hover:border-[var(--color-secondary)]/40 transition-all cursor-grab active:cursor-grabbing group"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 bg-[var(--color-border)] rounded-lg flex items-center justify-center text-base flex-shrink-0">
          🤖
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">{agent.displayName || agent.name}</h4>
          <p className="text-[var(--color-text-muted)] text-xs">@{agent.name}</p>
        </div>
      </div>

      {/* Skills */}
      <div className="flex flex-wrap gap-1 mb-3">
        {agent.skills.slice(0, 3).map((s) => (
          <span key={s} className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-1.5 py-0.5 rounded text-[10px]">
            {s}
          </span>
        ))}
        {agent.skills.length > 3 && (
          <span className="text-[10px] text-[var(--color-text-muted)]">+{agent.skills.length - 3}</span>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs mb-3">
        <div className="flex items-center gap-1">
          {renderStars(agent.reputationScore)}
          <span className="text-[var(--color-text-muted)] ml-1">({agent.reputationScore})</span>
        </div>
        <span className="text-[var(--color-secondary)] font-semibold">
          {agent.taskRateUsdc ? `$${agent.taskRateUsdc}` : agent.hourlyRateUsdc ? `$${agent.hourlyRateUsdc}/hr` : "—"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(agent); }}
          className="flex-1 bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white text-xs font-semibold py-2 rounded-lg transition-colors"
        >
          + Add to Pipeline
        </button>
        <Link
          href={`/agents/${agent.name}`}
          onClick={(e) => e.stopPropagation()}
          className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-[var(--color-text-muted)] text-xs px-3 py-2 rounded-lg transition-colors flex items-center"
        >
          👁️
        </Link>
      </div>
    </div>
  );
}

/* ─── Pipeline Step Card (Right Panel) ─── */
function StepCard({
  step,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: PipelineStep;
  index: number;
  total: number;
  onChange: (updates: Partial<PipelineStep>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="relative">
      {/* Connector line */}
      {index > 0 && (
        <div className="flex flex-col items-center -mt-1 mb-1">
          <div className="w-px h-6 bg-[var(--color-border)]" />
          <div className="text-[var(--color-text-muted)] text-[10px]">▼</div>
          <div className="w-px h-2 bg-[var(--color-border)]" />
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 hover:border-[var(--color-secondary)]/20 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="bg-[var(--color-primary)] text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center">
              {index + 1}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <span className="font-semibold text-sm">{step.agentDisplayName}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] disabled:opacity-25 transition-colors text-xs"
              title="Move up"
            >
              ↑
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              className="p-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] disabled:opacity-25 transition-colors text-xs"
              title="Move down"
            >
              ↓
            </button>
            <button
              onClick={onRemove}
              className="p-1.5 rounded-lg hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] transition-colors text-xs"
              title="Remove step"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Task Title</label>
            <input
              type="text"
              value={step.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="What should this agent do?"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-secondary)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Budget (USDC)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={step.budgetUsdc || ""}
                onChange={(e) => onChange({ budgetUsdc: parseFloat(e.target.value) || 0 })}
                placeholder="5.00"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-secondary)]"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Output Format</label>
              <select
                value={step.outputFormat}
                onChange={(e) => onChange({ outputFormat: e.target.value })}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-secondary)]"
              >
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
                <option value="code">Code</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Instructions (optional)</label>
            <textarea
              value={step.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Specific instructions for this step..."
              rows={2}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-secondary)] resize-none"
            />
          </div>
        </div>

        {/* Flow hint */}
        {index < total - 1 && (
          <div className="mt-3 text-[10px] text-[var(--color-text-muted)] text-center italic">
            Output feeds into Step {index + 2}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function NewWorkflowPage() {
  const router = useRouter();

  // Agent browser state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [allSkills, setAllSkills] = useState<string[]>([]);

  // Pipeline state
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [autoMatch, setAutoMatch] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // Launch state
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState("");

  // Drop zone ref
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Fetch agents
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agents?status=active&limit=50");
        const data = await res.json();
        if (data.success) {
          setAgents(data.agents);
          const skills = new Set<string>();
          data.agents.forEach((a: Agent) => a.skills?.forEach((s: string) => skills.add(s)));
          setAllSkills(Array.from(skills).sort());
        }
      } catch { /* ignore */ }
      finally { setAgentsLoading(false); }
    })();
  }, []);

  // Filtered agents
  const filteredAgents = agents.filter((a) => {
    const matchSearch = !searchTerm ||
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.skills?.some((s) => s.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchSkill = !skillFilter || a.skills?.some((s) => s.toLowerCase() === skillFilter.toLowerCase());
    return matchSearch && matchSkill;
  });

  // Add agent to pipeline
  const addAgent = (agent: Agent) => {
    setSteps((prev) => [
      ...prev,
      {
        uid: uid(),
        agentId: agent.id,
        agentName: agent.name,
        agentDisplayName: agent.displayName || agent.name,
        title: "",
        description: "",
        budgetUsdc: agent.taskRateUsdc || 5,
        outputFormat: "text",
        requiredSkills: agent.skills?.slice(0, 3) || [],
      },
    ]);
  };

  // Update step
  const updateStep = (idx: number, updates: Partial<PipelineStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
  };

  // Remove step
  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  // Move step
  const moveStep = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  // Drop handler
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const raw = e.dataTransfer.getData("application/clawwork-agent");
    if (!raw) return;
    try {
      const agent: Agent = JSON.parse(raw);
      addAgent(agent);
    } catch { /* ignore */ }
  };

  // Total budget
  const totalBudget = steps.reduce((sum, s) => sum + (s.budgetUsdc || 0), 0);

  // Validate
  const validate = (): string | null => {
    if (!workflowName.trim()) return "Workflow name is required";
    if (steps.length < 2) return "At least 2 pipeline steps are required";
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].title.trim()) return `Step ${i + 1}: title is required`;
      if (!steps[i].budgetUsdc || steps[i].budgetUsdc <= 0) return `Step ${i + 1}: budget must be positive`;
    }
    return null;
  };

  // Launch
  const handleLaunch = async () => {
    const err = validate();
    if (err) { setLaunchError(err); return; }
    setLaunching(true);
    setLaunchError("");

    const apiKey = localStorage.getItem("clawwork_api_key");
    if (!apiKey) {
      setLaunchError("API key required. Set it on the Dashboard first.");
      setLaunching(false);
      return;
    }

    try {
      const body = {
        name: workflowName.trim(),
        description: workflowDescription.trim() || undefined,
        steps: steps.map((s) => ({
          title: s.title.trim(),
          description: s.description.trim() || undefined,
          requiredSkills: s.requiredSkills,
          budgetUsdc: s.budgetUsdc,
          outputFormat: s.outputFormat,
          assignedAgentId: autoMatch ? undefined : s.agentId,
        })),
        autoMatch,
        autoStart: true,
        isTemplate: saveAsTemplate,
      };

      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!json.success) {
        setLaunchError(json.error || "Failed to create workflow");
      } else {
        const wfId = json.workflow?.id;
        if (wfId) {
          router.push(`/workflows/${wfId}`);
        } else {
          router.push("/workflows");
        }
      }
    } catch {
      setLaunchError("Network error");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Top bar */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/50 backdrop-blur-sm px-6 py-4 sticky top-[65px] z-40">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/workflows" className="text-[var(--color-text-muted)] hover:text-white transition-colors text-sm">
              ← Workflows
            </Link>
            <span className="text-[var(--color-border)]">/</span>
            <h1 className="text-lg font-bold">New Workflow</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[var(--color-text-muted)]">{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
            <span className="text-[var(--color-border)]">|</span>
            <span className="text-[var(--color-secondary)] font-semibold">${totalBudget.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ─── LEFT PANEL: Agent Browser ─── */}
          <div className="lg:w-[380px] flex-shrink-0">
            <div className="sticky top-[140px]">
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
                <h2 className="text-lg font-bold mb-4">🤖 Agent Browser</h2>

                {/* Search */}
                <input
                  type="text"
                  placeholder="Search agents or skills..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-[var(--color-secondary)]"
                />

                {/* Skill filters */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <button
                    onClick={() => setSkillFilter("")}
                    className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                      !skillFilter
                        ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white"
                    }`}
                  >
                    All
                  </button>
                  {allSkills.slice(0, 8).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSkillFilter(s === skillFilter ? "" : s)}
                      className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        skillFilter === s
                          ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Agent list */}
                <div className="space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                  {agentsLoading ? (
                    <div className="text-center py-8 text-[var(--color-text-muted)] text-sm">Loading agents...</div>
                  ) : filteredAgents.length === 0 ? (
                    <div className="text-center py-8 text-[var(--color-text-muted)] text-sm">No agents found</div>
                  ) : (
                    filteredAgents.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} onAdd={addAgent} />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ─── RIGHT PANEL: Pipeline Builder ─── */}
          <div className="flex-1 min-w-0">
            {/* Workflow info */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 mb-6">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Workflow Name *</label>
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="e.g. Content Marketing Pipeline"
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-lg font-semibold focus:outline-none focus:border-[var(--color-secondary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Description (optional)</label>
                  <textarea
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    placeholder="Describe what this workflow achieves..."
                    rows={2}
                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[var(--color-secondary)] resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Pipeline heading */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">⚡ Pipeline Steps</h2>
              <span className="text-xs text-[var(--color-text-muted)]">
                Drag agents here or click &quot;+ Add to Pipeline&quot;
              </span>
            </div>

            {/* Drop zone / Steps */}
            <div
              ref={dropZoneRef}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`min-h-[200px] rounded-2xl border-2 border-dashed transition-colors p-4 ${
                isDragOver
                  ? "border-[var(--color-secondary)] bg-[var(--color-secondary)]/5"
                  : steps.length === 0
                  ? "border-[var(--color-border)]"
                  : "border-transparent"
              }`}
            >
              {steps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
                  <div className="text-4xl mb-4">📦</div>
                  <p className="font-medium mb-1">No steps yet</p>
                  <p className="text-sm">Drag agents from the left panel or click &quot;+ Add to Pipeline&quot;</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {steps.map((step, i) => (
                    <StepCard
                      key={step.uid}
                      step={step}
                      index={i}
                      total={steps.length}
                      onChange={(u) => updateStep(i, u)}
                      onRemove={() => removeStep(i)}
                      onMoveUp={() => moveStep(i, -1)}
                      onMoveDown={() => moveStep(i, 1)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Bottom bar */}
            <div className="mt-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
              {launchError && (
                <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg p-3 mb-4 text-sm text-[var(--color-primary)]">
                  {launchError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Total budget */}
                  <div>
                    <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Total Budget</span>
                    <div className="text-xl font-bold text-[var(--color-secondary)]">${totalBudget.toFixed(2)}</div>
                  </div>

                  <div className="h-8 w-px bg-[var(--color-border)] hidden sm:block" />

                  {/* Auto-match toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoMatch}
                      onChange={(e) => setAutoMatch(e.target.checked)}
                      className="accent-[var(--color-secondary)] w-4 h-4"
                    />
                    <span className="text-sm text-[var(--color-text-muted)]">Auto-match agents</span>
                  </label>

                  {/* Save as template */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAsTemplate}
                      onChange={(e) => setSaveAsTemplate(e.target.checked)}
                      className="accent-[var(--color-secondary)] w-4 h-4"
                    />
                    <span className="text-sm text-[var(--color-text-muted)]">Save as template</span>
                  </label>
                </div>

                <button
                  onClick={handleLaunch}
                  disabled={launching || steps.length < 2}
                  className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-colors text-sm whitespace-nowrap"
                >
                  {launching ? "Launching..." : "Launch Workflow →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

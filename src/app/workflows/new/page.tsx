"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/Web3Provider";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";

/* ─── Types ─── */
interface PortfolioItem {
  id: string;
  title: string;
  description?: string;
  category?: string;
  inputExample?: string;
  outputExample?: string;
  proofUrl?: string;
}

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
  portfolio?: PortfolioItem[];
}

interface PipelineStep {
  uid: string;
  agentId: string;
  agentName: string;
  agentDisplayName: string;
  agentReputationScore: number;
  agentTasksCompleted: number;
  agentPortfolioPreview?: PortfolioItem;
  agentSkills: string[];
  title: string;
  description: string;
  budgetUsdc: number;
  outputFormat: string;
  requiredSkills: string[];
}

interface Template {
  id: string;
  icon: string;
  title: string;
  description: string;
  stepCount: number;
  estimatedCost: number;
  steps: {
    title: string;
    description: string;
    skills: string[];
    budgetUsdc: number;
    outputFormat: string;
  }[];
}

/* ─── Helpers ─── */
let _uid = 0;
function uid() {
  return `step_${Date.now()}_${_uid++}`;
}

function renderStars(score: number) {
  const stars = Math.round(score / 20);
  return (
    <span className="inline-flex gap-px">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`text-xs ${i < stars ? "text-[var(--color-accent)]" : "text-[var(--color-border)]"}`}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function ratingNumber(score: number) {
  return (score / 20).toFixed(1);
}

const OUTPUT_ICONS: Record<string, string> = {
  text: "📝",
  image: "🖼️",
  audio: "🎤",
  video: "🎬",
  code: "💻",
  other: "📦",
};

/* ─── Built-in Templates ─── */
const TEMPLATES: Template[] = [
  {
    id: "content-pipeline",
    icon: "✍️",
    title: "Content Pipeline",
    description: "Research, write, and polish blog content with multiple AI agents.",
    stepCount: 3,
    estimatedCost: 12,
    steps: [
      {
        title: "Research the topic",
        description: "Research the topic thoroughly, find key data points, statistics, and angles.",
        skills: ["research"],
        budgetUsdc: 3,
        outputFormat: "text",
      },
      {
        title: "Write the article",
        description: "Write a well-structured article based on the research. Include headers, intro, body, conclusion.",
        skills: ["writing", "copywriting"],
        budgetUsdc: 5,
        outputFormat: "text",
      },
      {
        title: "Edit and polish",
        description: "Edit for clarity, grammar, tone consistency. Add SEO optimization.",
        skills: ["editing", "seo"],
        budgetUsdc: 4,
        outputFormat: "text",
      },
    ],
  },
  {
    id: "research-report",
    icon: "🔬",
    title: "Research Report",
    description: "Deep research with analysis and formatted deliverable.",
    stepCount: 3,
    estimatedCost: 15,
    steps: [
      {
        title: "Gather data and sources",
        description: "Find and compile relevant data, papers, articles, and statistics on the topic.",
        skills: ["research"],
        budgetUsdc: 5,
        outputFormat: "text",
      },
      {
        title: "Analyze and synthesize",
        description: "Analyze the gathered data, identify patterns, draw conclusions.",
        skills: ["analysis", "writing"],
        budgetUsdc: 5,
        outputFormat: "text",
      },
      {
        title: "Format the report",
        description: "Create a professional report with executive summary, charts description, citations.",
        skills: ["writing", "formatting"],
        budgetUsdc: 5,
        outputFormat: "text",
      },
    ],
  },
  {
    id: "video-production",
    icon: "🎬",
    title: "Video Production",
    description: "Script, voiceover, and visual production for short-form video.",
    stepCount: 3,
    estimatedCost: 16,
    steps: [
      {
        title: "Write the script",
        description: "Write a compelling script with clear scenes, narration, and timing.",
        skills: ["copywriting", "scriptwriting"],
        budgetUsdc: 5,
        outputFormat: "text",
      },
      {
        title: "Record narration",
        description: "Produce voice narration from the script with professional delivery.",
        skills: ["voice"],
        budgetUsdc: 3,
        outputFormat: "audio",
      },
      {
        title: "Create visuals",
        description: "Design and produce visual scenes, animations, or video clips.",
        skills: ["design", "video"],
        budgetUsdc: 8,
        outputFormat: "video",
      },
    ],
  },
  {
    id: "data-analysis",
    icon: "📊",
    title: "Data Analysis",
    description: "Collect, analyze, and visualize data into actionable insights.",
    stepCount: 2,
    estimatedCost: 10,
    steps: [
      {
        title: "Collect and clean data",
        description: "Gather the relevant data, clean it, and prepare it for analysis.",
        skills: ["data", "research"],
        budgetUsdc: 4,
        outputFormat: "text",
      },
      {
        title: "Analyze and report",
        description: "Run analysis, identify trends, create summary with key insights and recommendations.",
        skills: ["analysis", "writing"],
        budgetUsdc: 6,
        outputFormat: "text",
      },
    ],
  },
  {
    id: "blank",
    icon: "➕",
    title: "Custom Blank",
    description: "Start from scratch and build your own pipeline.",
    stepCount: 0,
    estimatedCost: 0,
    steps: [],
  },
];

/* ─── CSS-in-JS styles (injected as a <style> tag) ─── */
const STYLES = `
  /* Slide-in panel */
  .config-overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    pointer-events: none;
    opacity: 0;
    transition: opacity 200ms ease;
  }
  .config-overlay.open {
    pointer-events: auto;
    opacity: 1;
  }
  .config-overlay .config-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.4);
    backdrop-filter: blur(2px);
  }
  .config-panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 420px;
    max-width: 100vw;
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
    transform: translateX(100%);
    transition: transform 200ms ease;
    overflow-y: auto;
  }
  .config-overlay.open .config-panel {
    transform: translateX(0);
  }

  /* Agent picker expand */
  .agent-picker-wrapper {
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-height 300ms ease, opacity 200ms ease;
  }
  .agent-picker-wrapper.open {
    max-height: 600px;
    opacity: 1;
  }

  /* Step card entry animation */
  @keyframes stepIn {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  .step-card-enter {
    animation: stepIn 250ms ease forwards;
  }

  /* Connector line */
  .flow-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2px 0;
  }
  .flow-connector .line {
    width: 2px;
    height: 24px;
    background: linear-gradient(to bottom, var(--color-border), var(--color-secondary));
    border-radius: 1px;
  }
  .flow-connector .arrow {
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid var(--color-secondary);
  }

  /* Step card drag */
  .step-card-dragging {
    opacity: 0.5;
    transform: scale(0.98);
  }
  .step-card-dragover {
    border-color: var(--color-secondary) !important;
    background: rgba(0, 212, 170, 0.05) !important;
  }

  /* Add step button pulse */
  .add-step-btn:hover {
    border-color: var(--color-secondary);
    color: var(--color-secondary);
  }

  /* Template card hover */
  .template-card {
    transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
  }
  .template-card:hover {
    transform: translateY(-2px);
    border-color: var(--color-secondary);
    box-shadow: 0 4px 20px rgba(0, 212, 170, 0.1);
  }

  /* Inline edit */
  .inline-edit-title {
    background: none;
    border: none;
    border-bottom: 1px dashed transparent;
    outline: none;
    color: inherit;
    font: inherit;
    padding: 0;
    width: 100%;
    cursor: text;
    transition: border-color 150ms ease;
  }
  .inline-edit-title:hover {
    border-bottom-color: var(--color-text-muted);
  }
  .inline-edit-title:focus {
    border-bottom-color: var(--color-secondary);
  }

  /* Mobile bottom sheet */
  @media (max-width: 768px) {
    .config-panel {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-height: 85vh;
      border-left: none;
      border-top: 1px solid var(--color-border);
      border-radius: 16px 16px 0 0;
      transform: translateY(100%);
    }
    .config-overlay.open .config-panel {
      transform: translateY(0);
    }
    .agent-picker-wrapper.open {
      max-height: none;
    }
  }
`;

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE (with Suspense boundary)
   ═══════════════════════════════════════════════════════════════════════════ */
export default function NewWorkflowPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
          <div className="text-[var(--color-text-muted)]">Loading builder...</div>
        </div>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <NewWorkflowBuilder />
    </Suspense>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUILDER COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
function NewWorkflowBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, signIn, isLoading: authLoading } = useAuth();
  const { isConnected } = useAccount();

  /* ── State ── */
  // Phase: "start" = template picker, "builder" = pipeline editor
  const [phase, setPhase] = useState<"start" | "builder">("start");

  // Agents
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  // Pipeline
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [initialInput, setInitialInput] = useState("");
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [autoMatch, setAutoMatch] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // UI state
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [configStepIdx, setConfigStepIdx] = useState<number | null>(null);
  const [editingNameInline, setEditingNameInline] = useState(false);

  // Drag reorder
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Launch
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState("");

  // Start screen input
  const [projectDesc, setProjectDesc] = useState("");

  // Ref for scrolling to bottom after adding step
  const stepsEndRef = useRef<HTMLDivElement>(null);

  /* ── Fetch agents ── */
  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const res = await fetch("/api/agents?status=active&limit=50");
      const data = await res.json();
      if (data.success) {
        const agentsWithPortfolio: Agent[] = await Promise.all(
          data.agents.map(async (a: Agent) => {
            try {
              const pRes = await fetch(`/api/agents/${a.name}`);
              const pData = await pRes.json();
              if (pData.success && pData.portfolio) {
                return { ...a, portfolio: pData.portfolio };
              }
            } catch {
              /* ignore */
            }
            return { ...a, portfolio: [] };
          })
        );
        setAgents(agentsWithPortfolio);
      }
    } catch {
      /* ignore */
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  /* ── Load template from URL param ── */
  useEffect(() => {
    const templateId = searchParams.get("template");
    if (!templateId) return;

    // Check built-in templates first
    const builtIn = TEMPLATES.find((t) => t.id === templateId);
    if (builtIn && builtIn.id !== "blank") {
      applyTemplate(builtIn);
      return;
    }

    // Then check API templates
    (async () => {
      try {
        const res = await fetch("/api/workflows?templates=true");
        const data = await res.json();
        if (!data.success) return;
        const tmpl = (data.templates || []).find(
          (t: { id: string }) => t.id === templateId
        );
        if (!tmpl) return;

        setWorkflowName(tmpl.name || "");
        setWorkflowDescription(tmpl.description || "");
        if (tmpl.steps && Array.isArray(tmpl.steps)) {
          const templateSteps: PipelineStep[] = tmpl.steps.map(
            (s: {
              title?: string;
              description?: string;
              skills?: string[];
              budgetUsdc?: number;
              outputFormat?: string;
            }) => ({
              uid: uid(),
              agentId: "",
              agentName: "",
              agentDisplayName: "Unassigned",
              agentReputationScore: 0,
              agentTasksCompleted: 0,
              agentSkills: s.skills || [],
              title: s.title || "",
              description: s.description || "",
              budgetUsdc: s.budgetUsdc || 5,
              outputFormat: s.outputFormat || "text",
              requiredSkills: s.skills || [],
            })
          );
          setSteps(templateSteps);
          setAutoMatch(true);
        }
        setPhase("builder");
      } catch {
        /* ignore */
      }
    })();
  }, [searchParams]);

  /* ── Apply a built-in template ── */
  const applyTemplate = (tmpl: Template) => {
    if (tmpl.id === "blank") {
      setWorkflowName("");
      setWorkflowDescription("");
      setInitialInput("");
      setSteps([]);
      setPhase("builder");
      return;
    }
    setWorkflowName(tmpl.title);
    setWorkflowDescription(tmpl.description);
    setSteps(
      tmpl.steps.map((s) => ({
        uid: uid(),
        agentId: "",
        agentName: "",
        agentDisplayName: "Unassigned",
        agentReputationScore: 0,
        agentTasksCompleted: 0,
        agentSkills: s.skills,
        title: s.title,
        description: s.description,
        budgetUsdc: s.budgetUsdc,
        outputFormat: s.outputFormat,
        requiredSkills: s.skills,
      }))
    );
    setAutoMatch(true);
    setPhase("builder");
  };

  /* ── Agent helpers ── */
  const addAgentAsStep = (
    agent: Agent,
    atIndex: number,
    closePicker = true
  ) => {
    const firstPortfolio = agent.portfolio?.[0];
    const newStep: PipelineStep = {
      uid: uid(),
      agentId: agent.id,
      agentName: agent.name,
      agentDisplayName: agent.displayName || agent.name,
      agentReputationScore: agent.reputationScore,
      agentTasksCompleted: agent.tasksCompleted,
      agentPortfolioPreview: firstPortfolio || undefined,
      agentSkills: agent.skills || [],
      title: "",
      description: "",
      budgetUsdc: agent.taskRateUsdc || 5,
      outputFormat: "text",
      requiredSkills: agent.skills?.slice(0, 3) || [],
    };
    setSteps((prev) => {
      const copy = [...prev];
      copy.splice(atIndex, 0, newStep);
      return copy;
    });
    if (closePicker) {
      setOpenPickerIdx(null);
      setPickerSearch("");
    }
    // Scroll to the new step after a tick
    setTimeout(
      () => stepsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      100
    );
  };

  const assignAgentToStep = (idx: number, agent: Agent) => {
    const firstPortfolio = agent.portfolio?.[0];
    updateStep(idx, {
      agentId: agent.id,
      agentName: agent.name,
      agentDisplayName: agent.displayName || agent.name,
      agentReputationScore: agent.reputationScore,
      agentTasksCompleted: agent.tasksCompleted,
      agentPortfolioPreview: firstPortfolio || undefined,
      agentSkills: agent.skills || [],
      budgetUsdc: agent.taskRateUsdc || steps[idx]?.budgetUsdc || 5,
      requiredSkills: agent.skills?.slice(0, 3) || [],
    });
  };

  const updateStep = (idx: number, updates: Partial<PipelineStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...updates } : s))
    );
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
    if (configStepIdx === idx) setConfigStepIdx(null);
    else if (configStepIdx !== null && configStepIdx > idx)
      setConfigStepIdx(configStepIdx - 1);
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
    // Update config panel index if needed
    if (configStepIdx === idx) setConfigStepIdx(newIdx);
    else if (configStepIdx === newIdx) setConfigStepIdx(idx);
  };

  /* ── Drag reorder handlers ── */
  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };
  const handleDragEnter = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) return;
    setDragOverIdx(idx);
  };
  const handleDragEnd = () => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      setSteps((prev) => {
        const copy = [...prev];
        const [removed] = copy.splice(dragIdx, 1);
        copy.splice(dragOverIdx, 0, removed);
        return copy;
      });
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  /* ── Filtered agents for picker ── */
  const filteredPickerAgents = agents.filter((a) => {
    if (!pickerSearch) return true;
    const q = pickerSearch.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.displayName?.toLowerCase().includes(q) ||
      a.skills?.some((s) => s.toLowerCase().includes(q)) ||
      a.bio?.toLowerCase().includes(q)
    );
  });

  /* ── Computed ── */
  const totalBudget = steps.reduce((sum, s) => sum + (s.budgetUsdc || 0), 0);
  const configStep =
    configStepIdx !== null ? steps[configStepIdx] : null;

  /* ── Validation ── */
  const validate = (): string | null => {
    if (!workflowName.trim()) return "Workflow name is required";
    if (!initialInput.trim())
      return "Initial input is required — tell Step 1 what to work on";
    if (steps.length < 2) return "At least 2 pipeline steps are required";
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].title.trim()) return `Step ${i + 1}: title is required`;
      if (!steps[i].budgetUsdc || steps[i].budgetUsdc <= 0)
        return `Step ${i + 1}: budget must be positive`;
    }
    return null;
  };

  /* ── Launch ── */
  const handleLaunch = async () => {
    const err = validate();
    if (err) {
      setLaunchError(err);
      return;
    }

    const apiKey =
      typeof window !== "undefined"
        ? localStorage.getItem("clawwork_api_key")
        : null;
    if (!isSignedIn && !apiKey) {
      setLaunchError(
        "Connect your wallet and sign in, or set an API key on the Dashboard."
      );
      return;
    }

    setLaunching(true);
    setLaunchError("");

    try {
      const body = {
        name: workflowName.trim(),
        description: workflowDescription.trim() || undefined,
        initialInput: initialInput.trim(),
        steps: steps.map((s, i) => ({
          title: s.title.trim(),
          description: s.description.trim() || undefined,
          requiredSkills: s.requiredSkills,
          budgetUsdc: s.budgetUsdc,
          outputFormat: s.outputFormat,
          assignedAgentId: autoMatch ? undefined : s.agentId || undefined,
          ...(i === 0 ? { inputDescription: initialInput.trim() } : {}),
        })),
        autoMatch,
        autoStart: true,
        isTemplate: saveAsTemplate,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (!isSignedIn && apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const res = await fetch("/api/workflows", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!json.success) {
        setLaunchError(json.error || "Failed to create workflow");
      } else {
        const wfId = json.workflow?.id;
        router.push(wfId ? `/workflows/${wfId}` : "/workflows");
      }
    } catch {
      setLaunchError("Network error");
    } finally {
      setLaunching(false);
    }
  };

  const hasApiKey =
    typeof window !== "undefined"
      ? !!localStorage.getItem("clawwork_api_key")
      : false;

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER: START SCREEN
     ═══════════════════════════════════════════════════════════════════════ */
  if (phase === "start") {
    return (
      <div className="min-h-screen bg-[var(--color-bg)]">
        <div className="max-w-3xl mx-auto px-6 py-16">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="text-5xl mb-4">🔨</div>
            <h1 className="text-3xl font-bold mb-3">Build Your AI Pipeline</h1>
            <p className="text-[var(--color-text-muted)] text-lg">
              Chain AI agents together to accomplish complex tasks.
            </p>
          </div>

          {/* Project description input */}
          <div className="mb-10">
            <label className="block text-sm text-[var(--color-text-muted)] mb-2">
              What do you want to create?
            </label>
            <div className="relative">
              <textarea
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                placeholder='Describe your project... e.g. "Create a product launch video" or "Research and write a blog post"'
                rows={3}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-5 py-4 text-lg focus:outline-none focus:border-[var(--color-secondary)] resize-none transition-colors"
              />
              {projectDesc.trim() && (
                <button
                  onClick={() => {
                    setInitialInput(projectDesc);
                    setPhase("builder");
                  }}
                  className="absolute right-3 bottom-3 bg-[var(--color-secondary)] text-black font-semibold text-sm px-4 py-2 rounded-lg hover:brightness-110 transition-all"
                >
                  Start Building →
                </button>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-10">
            <div className="flex-1 h-px bg-[var(--color-border)]" />
            <span className="text-sm text-[var(--color-text-muted)]">
              or start from a template
            </span>
            <div className="flex-1 h-px bg-[var(--color-border)]" />
          </div>

          {/* Template grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => applyTemplate(tmpl)}
                className="template-card text-left bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 hover:cursor-pointer"
              >
                <div className="text-3xl mb-3">{tmpl.icon}</div>
                <h3 className="font-semibold text-base mb-1">{tmpl.title}</h3>
                <p className="text-sm text-[var(--color-text-muted)] mb-3 line-clamp-2">
                  {tmpl.description}
                </p>
                {tmpl.id !== "blank" && (
                  <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                    <span>
                      {tmpl.stepCount} step{tmpl.stepCount !== 1 ? "s" : ""}
                    </span>
                    <span className="text-[var(--color-border)]">·</span>
                    <span className="text-[var(--color-secondary)]">
                      ~${tmpl.estimatedCost}
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Browse templates link */}
          <div className="text-center">
            <Link
              href="/workflows?tab=templates"
              className="text-sm text-[var(--color-secondary)] hover:underline"
            >
              Browse all templates →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER: BUILDER
     ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* ── Top bar ── */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-sm px-4 sm:px-6 py-3 sticky top-[65px] z-50">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setPhase("start")}
              className="text-[var(--color-text-muted)] hover:text-white transition-colors text-sm flex-shrink-0"
            >
              ← Back
            </button>
            <div className="min-w-0 flex items-center gap-2">
              {editingNameInline ? (
                <input
                  autoFocus
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  onBlur={() => setEditingNameInline(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditingNameInline(false);
                  }}
                  placeholder="Workflow name..."
                  className="bg-transparent border-b border-[var(--color-secondary)] outline-none font-bold text-base py-0.5 min-w-[200px]"
                />
              ) : (
                <button
                  onClick={() => setEditingNameInline(true)}
                  className="font-bold text-base truncate hover:text-[var(--color-secondary)] transition-colors flex items-center gap-1.5"
                  title="Click to rename"
                >
                  {workflowName || (
                    <span className="text-[var(--color-text-muted)] italic">
                      Untitled Workflow
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    ✏️
                  </span>
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-[var(--color-text-muted)] hidden sm:inline">
              {steps.length} step{steps.length !== 1 ? "s" : ""} ·{" "}
              <span className="text-[var(--color-secondary)] font-semibold">
                ${totalBudget.toFixed(2)}
              </span>
            </span>
            {!isSignedIn && !hasApiKey ? (
              isConnected ? (
                <button
                  onClick={signIn}
                  className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  Sign In
                </button>
              ) : (
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <button
                      onClick={show}
                      className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
                    >
                      Connect
                    </button>
                  )}
                </ConnectKitButton.Custom>
              )
            ) : (
              <button
                onClick={handleLaunch}
                disabled={launching || steps.length < 2}
                className="bg-[var(--color-secondary)] hover:brightness-110 disabled:opacity-50 text-black font-semibold px-5 py-2 rounded-lg transition-all text-sm"
              >
                {launching ? "Launching..." : "Launch →"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* ── Initial Input ── */}
        <div className="mb-8">
          <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-semibold mb-2">
            <span className="text-base">📥</span> Initial Input
          </label>
          <textarea
            value={initialInput}
            onChange={(e) => setInitialInput(e.target.value)}
            placeholder="What should Step 1 work on? Be specific — the better your brief, the better the output."
            rows={3}
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-5 py-4 text-sm focus:outline-none focus:border-[var(--color-secondary)] resize-none transition-colors"
          />
        </div>

        {/* ── Connector from input to first step ── */}
        {steps.length > 0 && (
          <div className="flow-connector mb-2">
            <div className="line" />
            <div className="arrow" />
          </div>
        )}

        {/* ── Pipeline Steps ── */}
        {steps.length === 0 ? (
          <div className="mb-4">
            {/* Empty state */}
            <div className="text-center py-12 border-2 border-dashed border-[var(--color-border)] rounded-2xl">
              <div className="text-4xl mb-3">⚡</div>
              <p className="text-[var(--color-text-muted)] mb-1 font-medium">
                No steps yet
              </p>
              <p className="text-sm text-[var(--color-text-muted)] mb-4">
                Add your first agent to start building
              </p>
              <button
                onClick={() => setOpenPickerIdx(0)}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-secondary)] text-sm px-5 py-2.5 rounded-lg transition-colors hover:text-[var(--color-secondary)]"
              >
                + Add First Step
              </button>
            </div>

            {/* Picker for first step */}
            <AgentPicker
              isOpen={openPickerIdx === 0}
              agents={filteredPickerAgents}
              loading={agentsLoading}
              search={pickerSearch}
              onSearchChange={setPickerSearch}
              onSelect={(agent) => {
                addAgentAsStep(agent, 0);
              }}
              onClose={() => {
                setOpenPickerIdx(null);
                setPickerSearch("");
              }}
            />
          </div>
        ) : (
          <div className="space-y-0">
            {steps.map((step, idx) => (
              <div key={step.uid}>
                {/* Step card */}
                <div
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={handleDragEnd}
                  className={`step-card-enter ${dragIdx === idx ? "step-card-dragging" : ""} ${dragOverIdx === idx ? "step-card-dragover" : ""}`}
                >
                  <StepCard
                    step={step}
                    index={idx}
                    total={steps.length}
                    onConfigure={() => setConfigStepIdx(idx)}
                    onRemove={() => removeStep(idx)}
                    onTitleChange={(title) => updateStep(idx, { title })}
                  />
                </div>

                {/* Connector + Add Step button */}
                <div className="flow-connector my-1">
                  <div className="line" style={{ height: 16 }} />
                </div>
                <div className="flex justify-center mb-1">
                  <button
                    onClick={() =>
                      setOpenPickerIdx(
                        openPickerIdx === idx + 1 ? null : idx + 1
                      )
                    }
                    className="add-step-btn text-xs text-[var(--color-text-muted)] border border-[var(--color-border)] rounded-full px-4 py-1.5 transition-colors hover:bg-[var(--color-surface)]"
                  >
                    + Add Step
                  </button>
                </div>

                {/* Agent picker (inline) */}
                <AgentPicker
                  isOpen={openPickerIdx === idx + 1}
                  agents={filteredPickerAgents}
                  loading={agentsLoading}
                  search={pickerSearch}
                  onSearchChange={setPickerSearch}
                  onSelect={(agent) => {
                    addAgentAsStep(agent, idx + 1);
                  }}
                  onClose={() => {
                    setOpenPickerIdx(null);
                    setPickerSearch("");
                  }}
                />

                {/* Arrow to next step */}
                {idx < steps.length - 1 && (
                  <div className="flow-connector my-1">
                    <div className="line" style={{ height: 12 }} />
                    <div className="arrow" />
                  </div>
                )}
              </div>
            ))}
            <div ref={stepsEndRef} />
          </div>
        )}

        {/* ── Bottom Summary Bar ── */}
        <div className="mt-10 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
          {launchError && (
            <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg p-3 mb-4 text-sm text-[var(--color-primary)]">
              {launchError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                  Total
                </span>
                <div className="text-xl font-bold text-[var(--color-secondary)]">
                  ${totalBudget.toFixed(2)}{" "}
                  <span className="text-xs font-normal text-[var(--color-text-muted)]">
                    USDC
                  </span>
                </div>
              </div>
              <div className="h-8 w-px bg-[var(--color-border)] hidden sm:block" />
              <span className="text-sm text-[var(--color-text-muted)]">
                {steps.length} step{steps.length !== 1 ? "s" : ""}
              </span>
              <div className="h-8 w-px bg-[var(--color-border)] hidden sm:block" />
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoMatch}
                  onChange={(e) => setAutoMatch(e.target.checked)}
                  className="accent-[var(--color-secondary)] w-4 h-4"
                />
                <span className="text-sm text-[var(--color-text-muted)]">
                  Auto-match
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  className="accent-[var(--color-secondary)] w-4 h-4"
                />
                <span className="text-sm text-[var(--color-text-muted)]">
                  Save as template
                </span>
              </label>
            </div>

            {!isSignedIn && !hasApiKey ? (
              isConnected ? (
                <button
                  onClick={signIn}
                  className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-bold px-8 py-3 rounded-xl transition-colors text-sm whitespace-nowrap"
                >
                  Sign In to Launch →
                </button>
              ) : (
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <button
                      onClick={show}
                      className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-bold px-8 py-3 rounded-xl transition-colors text-sm whitespace-nowrap"
                    >
                      Connect Wallet →
                    </button>
                  )}
                </ConnectKitButton.Custom>
              )
            ) : (
              <button
                onClick={handleLaunch}
                disabled={launching || steps.length < 2}
                className="bg-[var(--color-secondary)] hover:brightness-110 disabled:opacity-50 text-black font-bold px-8 py-3 rounded-xl transition-all text-sm whitespace-nowrap"
              >
                {launching ? "Launching..." : "Launch Workflow →"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Configuration Panel (slide-in) ── */}
      <div className={`config-overlay ${configStepIdx !== null ? "open" : ""}`}>
        <div
          className="config-backdrop"
          onClick={() => setConfigStepIdx(null)}
        />
        <div className="config-panel">
          {configStep && configStepIdx !== null && (
            <ConfigPanel
              step={configStep}
              index={configStepIdx}
              agents={agents}
              agentsLoading={agentsLoading}
              onChange={(updates) => updateStep(configStepIdx, updates)}
              onAssignAgent={(agent) =>
                assignAgentToStep(configStepIdx, agent)
              }
              onClose={() => setConfigStepIdx(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STEP CARD (compact, in the flow)
   ═══════════════════════════════════════════════════════════════════════════ */
function StepCard({
  step,
  index,
  total,
  onConfigure,
  onRemove,
  onTitleChange,
}: {
  step: PipelineStep;
  index: number;
  total: number;
  onConfigure: () => void;
  onRemove: () => void;
  onTitleChange: (title: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const outputIcon = OUTPUT_ICONS[step.outputFormat] || "📦";
  const isUnassigned = !step.agentId;

  return (
    <div
      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-5 py-4 hover:border-[var(--color-secondary)]/30 transition-colors relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-3">
        {/* Step number badge */}
        <div className="flex-shrink-0 w-8 h-8 bg-[var(--color-secondary)] text-black text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
          {index + 1}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm truncate">
                {isUnassigned ? (
                  <span className="text-[var(--color-text-muted)] italic">
                    Unassigned
                  </span>
                ) : (
                  step.agentDisplayName
                )}
              </span>
              {!isUnassigned && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  {renderStars(step.agentReputationScore)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-semibold text-[var(--color-secondary)]">
                ${step.budgetUsdc.toFixed(2)}
              </span>
              <button
                onClick={onConfigure}
                className="text-xs text-[var(--color-text-muted)] hover:text-white border border-[var(--color-border)] hover:border-[var(--color-text-muted)] px-2.5 py-1 rounded-lg transition-colors"
              >
                Configure ▸
              </button>
            </div>
          </div>

          {/* Inline editable title */}
          <input
            type="text"
            value={step.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="What should this agent do?"
            className="inline-edit-title text-sm text-[var(--color-text-muted)] w-full mb-1.5"
          />

          {/* Skills + output format */}
          <div className="flex items-center gap-2 flex-wrap">
            {step.agentSkills.slice(0, 3).map((s) => (
              <span
                key={s}
                className="text-[10px] bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]"
              >
                {s}
              </span>
            ))}
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {outputIcon} {step.outputFormat}
            </span>
          </div>
        </div>
      </div>

      {/* Hover actions: drag handle + delete */}
      <div
        className={`absolute -left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 transition-opacity ${hovered ? "opacity-100" : "opacity-0"}`}
      >
        <span
          className="cursor-grab active:cursor-grabbing text-[var(--color-text-muted)] text-xs select-none"
          title="Drag to reorder"
        >
          ⋮⋮
        </span>
      </div>
      <button
        onClick={onRemove}
        className={`absolute -right-2 -top-2 w-5 h-5 bg-[var(--color-primary)] text-white text-xs rounded-full flex items-center justify-center transition-opacity hover:bg-[#ff3b3b] ${hovered ? "opacity-100" : "opacity-0"}`}
        title="Remove step"
      >
        ×
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AGENT PICKER (inline expansion)
   ═══════════════════════════════════════════════════════════════════════════ */
function AgentPicker({
  isOpen,
  agents,
  loading,
  search,
  onSearchChange,
  onSelect,
  onClose,
}: {
  isOpen: boolean;
  agents: Agent[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (agent: Agent) => void;
  onClose: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [showCount, setShowCount] = useState(6);

  useEffect(() => {
    if (isOpen) {
      setShowCount(6);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen]);

  return (
    <div className={`agent-picker-wrapper ${isOpen ? "open" : ""}`}>
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 my-2">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold">Pick an Agent</h4>
          <button
            onClick={onClose}
            className="text-xs text-[var(--color-text-muted)] hover:text-white transition-colors"
          >
            ✕ Close
          </button>
        </div>

        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="🔍 Search agents or skills..."
          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-[var(--color-secondary)] transition-colors"
        />

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="text-center py-6 text-sm text-[var(--color-text-muted)]">
              Loading agents...
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-6 text-sm text-[var(--color-text-muted)]">
              No agents found
            </div>
          ) : (
            <>
              {agents.slice(0, showCount).map((agent) => (
                <AgentPickerCard
                  key={agent.id}
                  agent={agent}
                  onSelect={() => onSelect(agent)}
                />
              ))}
              {agents.length > showCount && (
                <button
                  onClick={() => setShowCount((c) => c + 6)}
                  className="w-full text-center text-xs text-[var(--color-secondary)] hover:underline py-2"
                >
                  Show more agents... ({agents.length - showCount} remaining)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentPickerCard({
  agent,
  onSelect,
}: {
  agent: Agent;
  onSelect: () => void;
}) {
  const firstPortfolio = agent.portfolio?.[0];
  const price = agent.taskRateUsdc
    ? `$${agent.taskRateUsdc}/task`
    : agent.hourlyRateUsdc
      ? `$${agent.hourlyRateUsdc}/hr`
      : "—";

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 hover:border-[var(--color-secondary)]/40 transition-colors group/card"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-[var(--color-surface-hover)] rounded-lg flex items-center justify-center text-base flex-shrink-0">
          🤖
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="font-semibold text-sm truncate">
              {agent.displayName || agent.name}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0 text-xs">
              {renderStars(agent.reputationScore)}
              <span className="text-[var(--color-secondary)] font-semibold">
                {price}
              </span>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] line-clamp-1 mb-1.5">
            {agent.bio ||
              agent.skills?.join(", ") ||
              "No description"}
          </p>

          {/* Portfolio preview snippet */}
          {firstPortfolio &&
            (firstPortfolio.inputExample || firstPortfolio.outputExample) && (
              <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
                {firstPortfolio.inputExample && (
                  <span className="truncate max-w-[40%]">
                    📥 &quot;{firstPortfolio.inputExample.slice(0, 40)}...&quot;
                  </span>
                )}
                {firstPortfolio.inputExample &&
                  firstPortfolio.outputExample && <span>→</span>}
                {firstPortfolio.outputExample && (
                  <span className="truncate max-w-[40%]">
                    📤 &quot;{firstPortfolio.outputExample.slice(0, 40)}...&quot;
                  </span>
                )}
              </div>
            )}
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURATION PANEL (slide-in from right / bottom sheet on mobile)
   ═══════════════════════════════════════════════════════════════════════════ */
function ConfigPanel({
  step,
  index,
  agents,
  agentsLoading,
  onChange,
  onAssignAgent,
  onClose,
}: {
  step: PipelineStep;
  index: number;
  agents: Agent[];
  agentsLoading: boolean;
  onChange: (updates: Partial<PipelineStep>) => void;
  onAssignAgent: (agent: Agent) => void;
  onClose: () => void;
}) {
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");

  const preview = step.agentPortfolioPreview;
  const isUnassigned = !step.agentId;

  const filteredAgents = agents.filter((a) => {
    if (!agentSearch) return true;
    const q = agentSearch.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.displayName?.toLowerCase().includes(q) ||
      a.skills?.some((s) => s.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
        <h3 className="font-bold text-base">
          Step {index + 1} Configuration
        </h3>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text-muted)]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Agent info */}
        <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-4">
          {isUnassigned ? (
            <div className="text-center py-2">
              <p className="text-sm text-[var(--color-text-muted)] mb-2">
                No agent assigned
              </p>
              <button
                onClick={() => setShowAgentPicker(true)}
                className="text-sm text-[var(--color-secondary)] hover:underline"
              >
                Pick an agent →
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-[var(--color-surface-hover)] rounded-lg flex items-center justify-center text-base">
                  🤖
                </div>
                <div>
                  <h4 className="font-semibold text-sm">
                    {step.agentDisplayName}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    {renderStars(step.agentReputationScore)}
                    <span>({ratingNumber(step.agentReputationScore)})</span>
                    <span>·</span>
                    <span>${step.budgetUsdc}/task</span>
                    <span>·</span>
                    <span>{step.agentTasksCompleted} completed</span>
                  </div>
                </div>
              </div>
              <Link
                href={`/agents/${step.agentName}`}
                className="text-xs text-[var(--color-secondary)] hover:underline"
              >
                View Full Profile →
              </Link>
            </div>
          )}
        </div>

        {/* Task title */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5 font-semibold">
            Task Title *
          </label>
          <input
            type="text"
            value={step.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="What should this agent do?"
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-secondary)] transition-colors"
          />
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5 font-semibold">
            Instructions
          </label>
          <textarea
            value={step.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Detailed instructions, tone, format requirements..."
            rows={4}
            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-secondary)] resize-none transition-colors"
          />
        </div>

        {/* Budget + Output Format */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5 font-semibold">
              Budget (USDC)
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={step.budgetUsdc || ""}
              onChange={(e) =>
                onChange({ budgetUsdc: parseFloat(e.target.value) || 0 })
              }
              placeholder="5.00"
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-secondary)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5 font-semibold">
              Output Format
            </label>
            <select
              value={step.outputFormat}
              onChange={(e) => onChange({ outputFormat: e.target.value })}
              className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-secondary)] transition-colors"
            >
              <option value="text">📝 Text</option>
              <option value="image">🖼️ Image</option>
              <option value="audio">🎤 Audio</option>
              <option value="video">🎬 Video</option>
              <option value="code">💻 Code</option>
              <option value="other">📦 Other</option>
            </select>
          </div>
        </div>

        {/* Portfolio preview */}
        {preview &&
          (preview.inputExample || preview.outputExample) && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-2 font-semibold">
                Portfolio Preview
              </h4>
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 space-y-2">
                {preview.inputExample && (
                  <div className="text-xs">
                    <span className="text-[var(--color-text-muted)]">
                      📥{" "}
                    </span>
                    <span className="text-[var(--color-text-muted)] italic">
                      &quot;{preview.inputExample.slice(0, 120)}
                      {preview.inputExample.length > 120 ? "..." : ""}&quot;
                    </span>
                  </div>
                )}
                {preview.outputExample && (
                  <div className="text-xs">
                    <span className="text-[var(--color-secondary)]">
                      📤{" "}
                    </span>
                    <span className="italic">
                      &quot;{preview.outputExample.slice(0, 120)}
                      {preview.outputExample.length > 120 ? "..." : ""}&quot;
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* Change agent */}
        <div>
          <h4 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-2 font-semibold">
            {isUnassigned ? "Assign Agent" : "Change Agent"}
          </h4>
          {showAgentPicker ? (
            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
              <input
                type="text"
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                placeholder="🔍 Search agents..."
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-[var(--color-secondary)]"
                autoFocus
              />
              <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                {agentsLoading ? (
                  <p className="text-xs text-[var(--color-text-muted)] text-center py-4">
                    Loading...
                  </p>
                ) : (
                  filteredAgents.slice(0, 10).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        onAssignAgent(a);
                        setShowAgentPicker(false);
                        setAgentSearch("");
                      }}
                      className="w-full text-left flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--color-surface)] transition-colors text-sm"
                    >
                      <span>🤖</span>
                      <span className="font-medium truncate">
                        {a.displayName || a.name}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)] ml-auto flex-shrink-0">
                        {a.taskRateUsdc
                          ? `$${a.taskRateUsdc}`
                          : "—"}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => {
                  setShowAgentPicker(false);
                  setAgentSearch("");
                }}
                className="w-full text-center text-xs text-[var(--color-text-muted)] mt-2 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAgentPicker(true)}
              className="w-full text-left bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-secondary)]/40 rounded-lg px-4 py-2.5 text-sm transition-colors text-[var(--color-text-muted)]"
            >
              🔄 {isUnassigned ? "Pick an agent" : "Pick a different agent"}
            </button>
          )}
        </div>
      </div>

      {/* Panel footer */}
      <div className="p-5 border-t border-[var(--color-border)]">
        <button
          onClick={onClose}
          className="w-full bg-[var(--color-secondary)] text-black font-semibold py-2.5 rounded-lg hover:brightness-110 transition-all text-sm"
        >
          Done ✓
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface WorkflowStep {
  id: string;
  stepNumber: number;
  title: string;
  description?: string;
  status: string;
  budgetUsdc: number;
  outputFormat?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  taskId?: string;
  output?: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  totalBudgetUsdc: number;
  progress: string;
  completedSteps: number;
  steps: WorkflowStep[];
  createdAt: string;
}

function statusIcon(status: string) {
  switch (status) {
    case "completed": return "✅";
    case "active": case "running": return "🔵";
    case "skipped": return "⏭️";
    case "failed": return "❌";
    default: return "⏳";
  }
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "bg-[var(--color-border)] text-[var(--color-text-muted)]",
    running: "bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]",
    completed: "bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]",
    paused: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
    cancelled: "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
  };
  return map[status] || map.draft;
}

export default function WorkflowDetailPage() {
  const params = useParams();
  const workflowId = params.id as string;

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  const fetchWorkflow = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Workflow not found");
      } else {
        setWorkflow(json.workflow);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // Auto-refresh for running workflows
  useEffect(() => {
    if (workflow?.status !== "running") return;
    const interval = setInterval(fetchWorkflow, 10000);
    return () => clearInterval(interval);
  }, [workflow?.status, fetchWorkflow]);

  const handleAction = async (action: string) => {
    const apiKey = localStorage.getItem("clawwork_api_key");
    if (!apiKey) { setError("API key required"); return; }
    setActionLoading(action);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const json = await res.json();
      if (json.success) {
        fetchWorkflow();
      } else {
        setError(json.error || `Failed to ${action}`);
      }
    } catch {
      setError("Network error");
    } finally {
      setActionLoading("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="text-[var(--color-text-muted)]">Loading workflow...</div>
      </div>
    );
  }

  if (error && !workflow) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Error</h2>
          <p className="text-[var(--color-text-muted)] mb-6">{error}</p>
          <Link
            href="/workflows"
            className="inline-block bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            ← Back to Workflows
          </Link>
        </div>
      </div>
    );
  }

  if (!workflow) return null;

  const progressPct = workflow.totalSteps > 0 ? (workflow.completedSteps / workflow.totalSteps) * 100 : 0;
  const spentUsdc = workflow.steps
    ?.filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + (s.budgetUsdc || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-6">
          <Link href="/workflows" className="hover:text-white transition-colors">Workflows</Link>
          <span>/</span>
          <span className="text-white">{workflow.name}</span>
        </div>

        {/* Header */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold">{workflow.name}</h1>
                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${statusBadge(workflow.status)}`}>
                  {statusIcon(workflow.status)} {workflow.status}
                </span>
              </div>
              {workflow.description && (
                <p className="text-[var(--color-text-muted)] text-sm">{workflow.description}</p>
              )}
            </div>

            {/* Actions */}
            {(workflow.status === "running" || workflow.status === "paused") && (
              <div className="flex gap-2">
                {workflow.status === "running" && (
                  <button
                    onClick={() => handleAction("pause")}
                    disabled={!!actionLoading}
                    className="bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/25 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {actionLoading === "pause" ? "..." : "⏸️ Pause"}
                  </button>
                )}
                {workflow.status === "paused" && (
                  <button
                    onClick={() => handleAction("resume")}
                    disabled={!!actionLoading}
                    className="bg-[var(--color-secondary)]/15 border border-[var(--color-secondary)]/30 text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/25 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {actionLoading === "resume" ? "..." : "▶️ Resume"}
                  </button>
                )}
                <button
                  onClick={() => handleAction("cancel")}
                  disabled={!!actionLoading}
                  className="bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/25 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {actionLoading === "cancel" ? "..." : "✕ Cancel"}
                </button>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-1">
              <span>Progress: {workflow.completedSteps} / {workflow.totalSteps} steps</span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <div className="w-full h-3 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)] rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Budget */}
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-[var(--color-text-muted)]">Spent: </span>
              <span className="font-semibold">${spentUsdc.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Budget: </span>
              <span className="font-semibold text-[var(--color-secondary)]">${workflow.totalBudgetUsdc?.toFixed(2) || "0.00"}</span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              Created {new Date(workflow.createdAt).toLocaleDateString()}
            </div>
          </div>

          {error && (
            <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg p-3 mt-4 text-sm text-[var(--color-primary)]">
              {error}
            </div>
          )}
        </div>

        {/* Steps */}
        <h2 className="text-lg font-bold mb-4">Pipeline Steps</h2>
        <div className="space-y-0">
          {(workflow.steps || []).map((step, i) => (
            <div key={step.id || i}>
              {/* Connector */}
              {i > 0 && (
                <div className="flex flex-col items-center">
                  <div className="w-px h-4 bg-[var(--color-border)]" />
                  <div className="text-[var(--color-text-muted)] text-[10px]">▼</div>
                  <div className="w-px h-2 bg-[var(--color-border)]" />
                </div>
              )}

              <div className={`bg-[var(--color-surface)] border rounded-xl p-5 transition-colors ${
                step.status === "active" || step.status === "running"
                  ? "border-[var(--color-secondary)]/40"
                  : step.status === "completed"
                  ? "border-[var(--color-secondary)]/20"
                  : "border-[var(--color-border)]"
              }`}>
                <div className="flex items-start gap-4">
                  {/* Step number + status */}
                  <div className="flex flex-col items-center gap-1">
                    <span className={`text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center ${
                      step.status === "completed"
                        ? "bg-[var(--color-secondary)]/20 text-[var(--color-secondary)]"
                        : step.status === "active" || step.status === "running"
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-[var(--color-border)] text-[var(--color-text-muted)]"
                    }`}>
                      {step.stepNumber || i + 1}
                    </span>
                    <span className="text-base">{statusIcon(step.status)}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold">{step.title}</h3>
                      <span className="text-[var(--color-secondary)] font-semibold text-sm">
                        ${step.budgetUsdc?.toFixed(2)}
                      </span>
                    </div>

                    {step.description && (
                      <p className="text-[var(--color-text-muted)] text-sm mb-2">{step.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      {step.assignedAgentName && (
                        <Link
                          href={`/agents/${step.assignedAgentName}`}
                          className="hover:text-[var(--color-secondary)] transition-colors"
                        >
                          🤖 {step.assignedAgentName}
                        </Link>
                      )}
                      {step.outputFormat && <span>📄 {step.outputFormat}</span>}
                      {step.taskId && (
                        <Link
                          href={`/tasks/${step.taskId}`}
                          className="hover:text-[var(--color-secondary)] transition-colors"
                        >
                          🔗 View Task
                        </Link>
                      )}
                      <span className={`capitalize ${
                        step.status === "completed" ? "text-[var(--color-secondary)]" :
                        step.status === "active" || step.status === "running" ? "text-[var(--color-accent)]" :
                        ""
                      }`}>
                        {step.status}
                      </span>
                    </div>

                    {/* Output preview */}
                    {step.status === "completed" && step.output && (
                      <div className="mt-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Output</span>
                        <p className="text-sm mt-1 line-clamp-3">{step.output}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {(!workflow.steps || workflow.steps.length === 0) && (
          <div className="text-center py-12 text-[var(--color-text-muted)]">
            <div className="text-4xl mb-3">📋</div>
            <p>No steps data available</p>
          </div>
        )}
      </div>
    </div>
  );
}

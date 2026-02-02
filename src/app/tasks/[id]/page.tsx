"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import TaskDeposit from "@/components/TaskDeposit";
import TaskApprove from "@/components/TaskApprove";

interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  postedByType: string;
  postedById: string;
  budgetUsdc: number;
  deadline?: string;
  requiredSkills: string[];
  status: string;
  assignedAgentId?: string;
  escrowTxHash?: string;
  completionTxHash?: string;
  taskInputs?: Record<string, unknown>;
  additionalNotes?: string;
  deliverables?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function formatDeadline(deadline: string): string {
  const date = new Date(deadline);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) return `Overdue (was ${date.toLocaleString()})`;
  if (diffMin < 60) return `${diffMin}m left`;
  if (diffHours < 24) return `${diffHours}h left`;
  if (diffDays <= 7) return `${diffDays}d left`;
  return date.toLocaleString();
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskId, setTaskId] = useState<string>("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    params.then((p) => {
      setTaskId(p.id);
    });
  }, [params]);

  useEffect(() => {
    if (taskId) fetchTask();
  }, [taskId]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("clawwork_api_key") || "" : "";
    if (stored) setApiKey(stored);
  }, []);

  const fetchTask = async () => {
    try {
      setLoading(true);
      const taskRes = await fetch(`/api/tasks/${taskId}`);
      const taskData = await taskRes.json();
      if (taskData.success) setTask(taskData.task);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] px-6 py-12">
        <div className="max-w-4xl mx-auto text-center text-[var(--color-text-muted)]">Loading...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] px-6 py-12">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Order Not Found</h1>
          <Link href="/dashboard" className="text-[var(--color-primary)]">← Back to orders</Link>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    open: "bg-[var(--color-secondary)]/20 text-[var(--color-secondary)]",
    in_progress: "bg-[var(--color-accent)]/20 text-[var(--color-accent)]",
    review: "bg-blue-500/20 text-blue-400",
    completed: "bg-green-500/20 text-green-400",
    cancelled: "bg-red-500/20 text-red-400",
    disputed: "bg-orange-500/20 text-orange-400",
  };

  const statusLabels: Record<string, string> = {
    open: "PENDING",
    in_progress: "IN PROGRESS",
    review: "IN REVIEW",
    completed: "COMPLETED",
    cancelled: "CANCELLED",
    disputed: "DISPUTED",
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-[var(--color-text-muted)] hover:text-white text-sm mb-6 inline-block">
          ← My Orders
        </Link>

        {/* Order Header */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[task.status] || ""}`}>
                  {statusLabels[task.status] || task.status.replace("_", " ").toUpperCase()}
                </span>
                <span className="text-xs bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-2 py-1 rounded-full">
                  {task.category}
                </span>
              </div>
              <h1 className="text-3xl font-bold mb-2">{task.title}</h1>
            </div>
            <div className="text-right ml-6">
              <div className="text-3xl font-bold text-[var(--color-secondary)]">${task.budgetUsdc}</div>
              <div className="text-sm text-[var(--color-text-muted)]">USDC</div>
            </div>
          </div>

          <p className="text-[var(--color-text-muted)] mb-6 leading-relaxed whitespace-pre-wrap">{task.description}</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-1">Created</div>
              <div className="text-sm">{new Date(task.createdAt).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-1">Deadline</div>
              <div className="text-sm">{task.deadline ? formatDeadline(task.deadline) : "None"}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-1">Ordered By</div>
              <div className="text-sm capitalize">{task.postedByType}</div>
            </div>
          </div>

          {/* Required Skills */}
          {task.requiredSkills.length > 0 && (
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-2">Required Skills</div>
              <div className="flex flex-wrap gap-2">
                {task.requiredSkills.map((skill, i) => (
                  <span key={i} className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 text-[var(--color-primary)] px-3 py-1 rounded-full text-xs">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Task Inputs */}
          {task.taskInputs && Object.keys(task.taskInputs).length > 0 && (
            <div className="mt-6">
              <div className="text-xs text-[var(--color-text-muted)] mb-2">Order Inputs</div>
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-4 space-y-2">
                {Object.entries(task.taskInputs).map(([key, value]) => (
                  <div key={key} className="flex gap-3">
                    <span className="text-sm text-[var(--color-text-muted)] min-w-[120px]">{key}:</span>
                    <span className="text-sm">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Additional Notes */}
          {task.additionalNotes && (
            <div className="mt-4">
              <div className="text-xs text-[var(--color-text-muted)] mb-2">Additional Notes</div>
              <p className="text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-4 whitespace-pre-wrap">{task.additionalNotes}</p>
            </div>
          )}

          {/* Deliverables */}
          {task.deliverables && (
            <div className="mt-6">
              <div className="text-xs text-[var(--color-text-muted)] mb-2">📦 Deliverables</div>
              <div className="bg-[var(--color-secondary)]/5 border border-[var(--color-secondary)]/30 rounded-xl p-4 space-y-2">
                {typeof task.deliverables === "object" && task.deliverables !== null && (
                  <>
                    {(task.deliverables as Record<string, unknown>).outputNotes && (
                      <p className="text-sm">{String((task.deliverables as Record<string, unknown>).outputNotes)}</p>
                    )}
                    {(task.deliverables as Record<string, unknown>).outputUrl && (
                      <a href={String((task.deliverables as Record<string, unknown>).outputUrl)} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--color-accent)] hover:underline block">
                        📎 {String((task.deliverables as Record<string, unknown>).outputUrl)}
                      </a>
                    )}
                    {(task.deliverables as Record<string, unknown>).output && (
                      <pre className="text-xs bg-[var(--color-bg)] rounded-lg p-3 overflow-x-auto">{JSON.stringify((task.deliverables as Record<string, unknown>).output, null, 2)}</pre>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Fund Order (Escrow Deposit) — shown for in_progress orders */}
        {task.status === "in_progress" && !task.escrowTxHash && (
          <div className="mb-6">
            <TaskDeposit taskId={taskId} budgetUsdc={task.budgetUsdc} apiKey={apiKey} />
            {!apiKey && (
              <div className="mt-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4">
                <label className="block text-sm font-medium mb-1">API Key (for escrow authorization)</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  placeholder="cw_..."
                />
              </div>
            )}
          </div>
        )}

        {/* Escrow Funded indicator */}
        {task.escrowTxHash && (
          <div className="mb-6 bg-[var(--color-secondary)]/10 border border-[var(--color-secondary)]/30 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-[var(--color-secondary)] text-lg">🔒</span>
            <div>
              <div className="text-sm font-medium text-[var(--color-secondary)]">Escrow Funded — ${task.budgetUsdc} USDC locked</div>
              <a
                href={`https://basescan.org/tx/${task.escrowTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                View transaction →
              </a>
            </div>
          </div>
        )}

        {/* Approve & Pay — shown for orders in review */}
        {task.status === "review" && (
          <div className="mb-6">
            <TaskApprove taskId={taskId} budgetUsdc={task.budgetUsdc} apiKey={apiKey} />
          </div>
        )}
      </div>
    </div>
  );
}

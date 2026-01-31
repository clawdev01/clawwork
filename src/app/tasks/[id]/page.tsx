"use client";

import { useState, useEffect } from "react";

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
  bidCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Bid {
  id: string;
  taskId: string;
  agentId: string;
  agentName?: string;
  amountUsdc: number;
  proposal: string;
  estimatedHours?: number;
  status: string;
  createdAt: string;
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [task, setTask] = useState<Task | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskId, setTaskId] = useState<string>("");

  // Bid form
  const [showBidForm, setShowBidForm] = useState(false);
  const [bidApiKey, setBidApiKey] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [bidProposal, setBidProposal] = useState("");
  const [bidHours, setBidHours] = useState("");
  const [bidSubmitting, setBidSubmitting] = useState(false);
  const [bidMessage, setBidMessage] = useState("");

  useEffect(() => {
    params.then((p) => {
      setTaskId(p.id);
    });
  }, [params]);

  useEffect(() => {
    if (taskId) fetchTask();
  }, [taskId]);

  const fetchTask = async () => {
    try {
      setLoading(true);
      const [taskRes, bidsRes] = await Promise.all([
        fetch(`/api/tasks/${taskId}`),
        fetch(`/api/tasks/${taskId}/bids`),
      ]);
      const taskData = await taskRes.json();
      const bidsData = await bidsRes.json();
      if (taskData.success) setTask(taskData.task);
      if (bidsData.success) setBids(bidsData.bids || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const submitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setBidSubmitting(true);
    setBidMessage("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bidApiKey}`,
        },
        body: JSON.stringify({
          amountUsdc: parseFloat(bidAmount),
          proposal: bidProposal,
          estimatedHours: bidHours ? parseFloat(bidHours) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBidMessage("✅ Bid submitted!");
        setShowBidForm(false);
        setBidAmount("");
        setBidProposal("");
        setBidHours("");
        fetchTask();
      } else {
        setBidMessage(`❌ ${data.error}`);
      }
    } catch {
      setBidMessage("❌ Network error");
    } finally {
      setBidSubmitting(false);
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
          <h1 className="text-2xl font-bold mb-4">Task Not Found</h1>
          <a href="/tasks" className="text-[var(--color-primary)]">← Back to tasks</a>
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

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <a href="/tasks" className="text-[var(--color-text-muted)] hover:text-white text-sm mb-6 inline-block">
          ← Back to tasks
        </a>

        {/* Task Header */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[task.status] || ""}`}>
                  {task.status.replace("_", " ").toUpperCase()}
                </span>
                <span className="text-xs bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-2 py-1 rounded-full">
                  {task.category}
                </span>
              </div>
              <h1 className="text-3xl font-bold mb-2">{task.title}</h1>
            </div>
            <div className="text-right ml-6">
              <div className="text-3xl font-bold text-[var(--color-secondary)]">${task.budgetUsdc}</div>
              <div className="text-sm text-[var(--color-text-muted)]">USDC Budget</div>
            </div>
          </div>

          <p className="text-[var(--color-text-muted)] mb-6 leading-relaxed whitespace-pre-wrap">{task.description}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-1">Posted</div>
              <div className="text-sm">{new Date(task.createdAt).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-1">Deadline</div>
              <div className="text-sm">{task.deadline ? new Date(task.deadline).toLocaleDateString() : "None"}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-1">Bids</div>
              <div className="text-sm">{task.bidCount}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-muted)] mb-1">Posted By</div>
              <div className="text-sm">{task.postedByType}</div>
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
        </div>

        {/* Submit Bid */}
        {task.status === "open" && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 mb-6">
            {!showBidForm ? (
              <button
                onClick={() => setShowBidForm(true)}
                className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Submit a Bid
              </button>
            ) : (
              <form onSubmit={submitBid}>
                <h3 className="text-lg font-semibold mb-4">Submit Your Bid</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">API Key</label>
                    <input
                      type="password"
                      value={bidApiKey}
                      onChange={(e) => setBidApiKey(e.target.value)}
                      className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                      placeholder="cw_..."
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Amount (USDC)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Est. Hours</label>
                      <input
                        type="number"
                        step="0.5"
                        value={bidHours}
                        onChange={(e) => setBidHours(e.target.value)}
                        className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Proposal</label>
                    <textarea
                      value={bidProposal}
                      onChange={(e) => setBidProposal(e.target.value)}
                      rows={4}
                      className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                      placeholder="Why are you the best agent for this task?"
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={bidSubmitting}
                      className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-medium px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {bidSubmitting ? "Submitting..." : "Submit Bid"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBidForm(false)}
                      className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-white px-6 py-2 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {bidMessage && <p className="text-sm mt-2">{bidMessage}</p>}
                </div>
              </form>
            )}
          </div>
        )}

        {/* Bids List */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">Bids ({bids.length})</h2>
          {bids.length === 0 ? (
            <p className="text-[var(--color-text-muted)] text-center py-8">No bids yet. Be the first!</p>
          ) : (
            <div className="space-y-4">
              {bids.map((bid) => (
                <div key={bid.id} className="border border-[var(--color-border)] rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <a href={`/agents/${bid.agentName || bid.agentId}`} className="font-medium hover:text-[var(--color-primary)] transition-colors">
                        {bid.agentName || bid.agentId}
                      </a>
                      <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${bid.status === "accepted" ? "bg-green-500/20 text-green-400" : bid.status === "rejected" ? "bg-red-500/20 text-red-400" : "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]"}`}>
                        {bid.status}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-[var(--color-secondary)]">${bid.amountUsdc}</div>
                      {bid.estimatedHours && <div className="text-xs text-[var(--color-text-muted)]">{bid.estimatedHours}h est.</div>}
                    </div>
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)] whitespace-pre-wrap">{bid.proposal}</p>
                  <div className="text-xs text-[var(--color-text-muted)] mt-2">{new Date(bid.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

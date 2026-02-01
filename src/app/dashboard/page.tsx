"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import WalletBalance from "@/components/WalletBalance";

interface AvailabilitySchedule {
  type: "always" | "scheduled" | "manual";
  schedule?: {
    days: number[];
    startHour: number;
    endHour: number;
    timezone: string;
  };
}

interface DashboardData {
  profile: {
    id: string;
    name: string;
    displayName: string;
    bio: string;
    skills: string[];
    reputationScore: number;
    tasksCompleted: number;
    totalEarnedUsdc: number;
    walletAddress: string | null;
    platform: string;
    status: string;
    availabilitySchedule: AvailabilitySchedule | null;
    createdAt: string;
  };
  stats: {
    reputationScore: number;
    tasksCompleted: number;
    totalEarnedUsdc: number;
    activeTasks: number;
    pendingBids: number;
  };
  activeTasks: Array<{
    id: string;
    title: string;
    budgetUsdc: number;
    status: string;
    deadline: string | null;
    updatedAt: string;
  }>;
  recentBids: Array<{
    id: string;
    taskId: string;
    taskTitle: string;
    taskStatus: string;
    amountUsdc: number;
    status: string;
    autoBid: number;
    createdAt: string;
  }>;
  earningsSummary: Array<{
    taskId: string;
    title: string;
    budgetUsdc: number;
    completedAt: string;
  }>;
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    read: number;
    createdAt: string;
  }>;
  unreadCount: number;
  autoBidRules: Array<{
    id: string;
    name: string;
    enabled: number;
    categories: string[];
    skills: string[];
    bidStrategy: string;
    minBudgetUsdc: number | null;
    maxBudgetUsdc: number | null;
    totalBidsPlaced: number;
    totalBidsAccepted: number;
  }>;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function AvailabilityToggle({
  status,
  schedule,
  apiKey,
  activeTasks,
  onUpdate,
}: {
  status: string;
  schedule: AvailabilitySchedule | null;
  apiKey: string;
  activeTasks: number;
  onUpdate: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const isActive = status === "active";
  const isDraining = status === "draining";
  const isInactive = status === "inactive";

  const toggleStatus = async () => {
    setToggling(true);
    try {
      const newStatus = isActive || isDraining ? "inactive" : "active";
      const res = await fetch("/api/agents/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) onUpdate();
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  };

  const scheduleLabel = schedule?.type === "scheduled" && schedule.schedule
    ? `${schedule.schedule.days.map((d) => DAY_NAMES[d] || d).join(", ")} · ${schedule.schedule.startHour}:00–${schedule.schedule.endHour}:00 ${schedule.schedule.timezone || "UTC"}`
    : schedule?.type === "always"
    ? "Always available"
    : null;

  const borderColor = isActive
    ? "bg-[var(--color-secondary)]/5 border-[var(--color-secondary)]/30"
    : isDraining
    ? "bg-[var(--color-accent)]/5 border-[var(--color-accent)]/30"
    : "bg-[var(--color-primary)]/5 border-[var(--color-primary)]/30";

  const statusIcon = isActive ? "🟢" : isDraining ? "⏳" : "🔴";
  const statusTitle = isActive
    ? "Your agent is receiving tasks"
    : isDraining
    ? `Finishing ${activeTasks} active task${activeTasks !== 1 ? "s" : ""}... will pause automatically`
    : "Your agent is paused";
  const statusDesc = isActive
    ? "Visible in search · Eligible for auto-matching · Accepting bids"
    : isDraining
    ? "Hidden from search · No new tasks · Completing current work"
    : "Hidden from search · Not receiving new tasks";

  const buttonLabel = isActive
    ? "Pause After Current Tasks"
    : isDraining
    ? "Resume (Cancel Pause)"
    : "Activate Agent";

  const buttonStyle = isInactive
    ? "bg-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/80 text-white"
    : isDraining
    ? "bg-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/80 text-white"
    : "bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-white";

  return (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border transition-colors ${borderColor}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{statusIcon}</span>
        <div>
          <p className="font-semibold">{statusTitle}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{statusDesc}</p>
          {scheduleLabel && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1">📅 {scheduleLabel}</p>
          )}
        </div>
      </div>
      <button
        onClick={toggleStatus}
        disabled={toggling}
        className={`whitespace-nowrap font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50 ${buttonStyle}`}
      >
        {toggling ? "..." : buttonLabel}
      </button>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
      <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-[var(--color-secondary)]" : ""}`}>{value}</div>
    </div>
  );
}

function EarningsChart({ earnings }: { earnings: DashboardData["earningsSummary"] }) {
  if (earnings.length === 0) {
    return <p className="text-[var(--color-text-muted)] text-center py-4">No completed tasks yet</p>;
  }
  const maxAmount = Math.max(...earnings.map((e) => e.budgetUsdc), 1);
  return (
    <div className="flex items-end gap-3 h-40">
      {earnings.map((e) => (
        <div key={e.taskId} className="flex-1 flex flex-col items-center gap-2">
          <div className="text-xs text-[var(--color-text-muted)]">${e.budgetUsdc.toFixed(0)}</div>
          <div
            className="w-full bg-[var(--color-secondary)] rounded-t-md min-h-[4px]"
            style={{ height: `${(e.budgetUsdc / maxAmount) * 100}%` }}
          />
          <div className="text-[10px] text-[var(--color-text-muted)] truncate max-w-full" title={e.title}>
            {e.title.length > 10 ? e.title.slice(0, 10) + "…" : e.title}
          </div>
        </div>
      ))}
    </div>
  );
}

function bidStatusColor(status: string) {
  switch (status) {
    case "accepted": return "text-[var(--color-secondary)]";
    case "rejected": return "text-[var(--color-primary)]";
    case "withdrawn": return "text-[var(--color-text-muted)]";
    default: return "text-[var(--color-accent)]";
  }
}

export default function DashboardPage() {
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("clawwork_api_key");
    if (stored) {
      setSavedKey(stored);
      setApiKey(stored);
    }
  }, []);

  const fetchDashboard = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/agents/me/dashboard", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to load dashboard");
        setData(null);
      } else {
        setData(json);
        localStorage.setItem("clawwork_api_key", key);
        setSavedKey(key);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (savedKey) fetchDashboard(savedKey);
  }, [savedKey, fetchDashboard]);

  // API Key entry
  if (!data && !loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold mb-2">Agent Dashboard</h1>
          <p className="text-[var(--color-text-muted)] mb-6">Enter your API key to view your dashboard.</p>
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
            onKeyDown={(e) => e.key === "Enter" && apiKey && fetchDashboard(apiKey)}
          />
          <button
            onClick={() => fetchDashboard(apiKey)}
            disabled={!apiKey}
            className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Load Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="text-[var(--color-text-muted)] text-lg">Loading dashboard...</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">{data.profile.displayName || data.profile.name}</h1>
            <p className="text-[var(--color-text-muted)]">@{data.profile.name} · {data.profile.platform}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/agents/${data.profile.name}`}
              className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-4 py-2 rounded-xl text-sm hover:border-[var(--color-secondary)]/30 transition-colors"
            >
              View Profile
            </Link>
            <button
              onClick={() => { localStorage.removeItem("clawwork_api_key"); setSavedKey(""); setData(null); setApiKey(""); }}
              className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-4 py-2 rounded-xl text-sm hover:border-[var(--color-primary)]/30 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Availability Toggle */}
        <AvailabilityToggle
          status={data.profile.status}
          schedule={data.profile.availabilitySchedule}
          apiKey={savedKey}
          activeTasks={data.stats.activeTasks}
          onUpdate={() => fetchDashboard(savedKey)}
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Reputation" value={`${data.stats.reputationScore}/100`} />
          <StatCard label="Completed" value={String(data.stats.tasksCompleted)} />
          <StatCard label="Earned" value={`$${data.stats.totalEarnedUsdc?.toFixed(2) || "0.00"}`} accent />
          <StatCard label="Active Tasks" value={String(data.stats.activeTasks)} accent />
          <StatCard label="Pending Bids" value={String(data.stats.pendingBids)} />
          <WalletBalance />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Active Tasks */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">Active Tasks</h2>
              {data.activeTasks.length === 0 ? (
                <p className="text-[var(--color-text-muted)] text-center py-6">No active tasks</p>
              ) : (
                <div className="space-y-3">
                  {data.activeTasks.map((task) => (
                    <Link
                      key={task.id}
                      href={`/tasks/${task.id}`}
                      className="block bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl p-4 hover:border-[var(--color-secondary)]/30 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold">{task.title}</div>
                          {task.deadline && (
                            <div className="text-xs text-[var(--color-text-muted)] mt-1">
                              Due: {new Date(task.deadline).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <span className="text-[var(--color-secondary)] font-bold">${task.budgetUsdc.toFixed(2)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Bid History */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">Recent Bids</h2>
              {data.recentBids.length === 0 ? (
                <p className="text-[var(--color-text-muted)] text-center py-6">No bids placed yet</p>
              ) : (
                <div className="space-y-3">
                  {data.recentBids.map((bid) => (
                    <div
                      key={bid.id}
                      className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl p-4"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="font-medium text-sm">{bid.taskTitle}</div>
                        <span className="font-bold">${bid.amountUsdc.toFixed(2)}</span>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className={bidStatusColor(bid.status)}>{bid.status}</span>
                        {bid.autoBid ? (
                          <span className="text-[var(--color-accent)]">⚡ auto-bid</span>
                        ) : null}
                        <span className="text-[var(--color-text-muted)]">
                          {new Date(bid.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Earnings Chart */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-4">Recent Earnings</h2>
              <EarningsChart earnings={data.earningsSummary} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Notifications */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold">Notifications</h3>
                {data.unreadCount > 0 && (
                  <span className="bg-[var(--color-primary)] text-white text-xs px-2 py-0.5 rounded-full">
                    {data.unreadCount}
                  </span>
                )}
              </div>
              {data.notifications.length === 0 ? (
                <p className="text-[var(--color-text-muted)] text-sm text-center py-4">No notifications</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {data.notifications.slice(0, 10).map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-3 rounded-lg text-sm ${
                        notif.read ? "bg-[var(--color-surface-hover)]" : "bg-[var(--color-surface-hover)] border-l-2 border-[var(--color-secondary)]"
                      }`}
                    >
                      <div className="font-medium text-xs">{notif.title}</div>
                      <div className="text-[var(--color-text-muted)] text-xs mt-1">{notif.message}</div>
                      <div className="text-[var(--color-text-muted)] text-[10px] mt-1">
                        {new Date(notif.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Auto-Bid Rules */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <h3 className="font-semibold mb-4">Auto-Bid Rules</h3>
              {data.autoBidRules.length === 0 ? (
                <p className="text-[var(--color-text-muted)] text-sm text-center py-4">No auto-bid rules configured</p>
              ) : (
                <div className="space-y-3">
                  {data.autoBidRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg p-3"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-sm">{rule.name || "Unnamed Rule"}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          rule.enabled ? "bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]" : "bg-[var(--color-border)] text-[var(--color-text-muted)]"
                        }`}>
                          {rule.enabled ? "Active" : "Paused"}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        {rule.bidStrategy} · {rule.totalBidsPlaced} bids · {rule.totalBidsAccepted} accepted
                      </div>
                      {rule.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {rule.skills.map((s) => (
                            <span key={s} className="text-[10px] bg-[var(--color-surface)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Skills */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <h3 className="font-semibold mb-4">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {data.profile.skills.map((skill) => (
                  <span
                    key={skill}
                    className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-2 py-1 rounded-full text-xs"
                  >
                    {skill}
                  </span>
                ))}
                {data.profile.skills.length === 0 && (
                  <p className="text-[var(--color-text-muted)] text-sm">No skills added</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

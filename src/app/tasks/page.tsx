"use client";

import { useState, useEffect } from "react";

interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  budgetUsdc: number;
  deadline?: string;
  requiredSkills: string[];
  status: string;
  bidCount: number;
  createdAt: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const categories = [
    "research",
    "coding",
    "design",
    "data",
    "writing",
    "automation",
    "other",
  ];

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        status: "open",
        limit: "50",
      });
      
      const response = await fetch(`/api/tasks?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort tasks
  const filteredTasks = tasks
    .filter((task) => {
      const matchesCategory = categoryFilter === "" || task.category === categoryFilter;
      return matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "budget_high":
          return b.budgetUsdc - a.budgetUsdc;
        case "budget_low":
          return a.budgetUsdc - b.budgetUsdc;
        case "deadline":
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  const formatDeadline = (deadline?: string) => {
    if (!deadline) return "No deadline";
    const date = new Date(deadline);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMin = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMs < 0) return "Overdue";
    if (diffMin < 60) return `${diffMin}m left`;
    if (diffHours < 24) return `${diffHours}h left`;
    if (diffDays === 1) return "Due tomorrow";
    if (diffDays <= 7) return `${diffDays} days left`;
    return date.toLocaleDateString();
  };

  const getDeadlineColor = (deadline?: string) => {
    if (!deadline) return "text-[var(--color-text-muted)]";
    const date = new Date(deadline);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffMs < 0) return "text-red-400";
    if (diffHours <= 1) return "text-red-400";
    if (diffHours <= 4) return "text-[var(--color-accent)]";
    if (diffHours <= 24) return "text-orange-400";
    return "text-[var(--color-secondary)]";
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Browse Tasks</h1>
          <p className="text-[var(--color-text-muted)] text-lg">
            Find opportunities to showcase your skills and earn crypto
          </p>
        </div>

        {/* Filters */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              >
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-sm font-medium mb-2">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              >
                <option value="newest">Newest</option>
                <option value="budget_high">Budget (High to Low)</option>
                <option value="budget_low">Budget (Low to High)</option>
                <option value="deadline">Deadline (Urgent First)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[var(--color-text-muted)]">
            {loading ? "Loading..." : `${filteredTasks.length} tasks found`}
          </p>
          <a
            href="/tasks/new"
            className="bg-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/80 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
          >
            Post a Task
          </a>
        </div>

        {/* Tasks List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-[var(--color-text-muted)]">Loading tasks...</div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-[var(--color-text-muted)]">No tasks found matching your criteria.</div>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-primary)]/30 transition-colors cursor-pointer"
                onClick={() => window.location.href = `/tasks/${task.id}`}
              >
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Main Content */}
                  <div className="lg:col-span-2">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold mb-2 hover:text-[var(--color-primary)] transition-colors">
                          {task.title}
                        </h3>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-xs bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-2 py-1 rounded-full">
                            {task.category}
                          </span>
                          <span className="text-sm text-[var(--color-text-muted)]">
                            Posted {new Date(task.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-[var(--color-secondary)]">
                          ${task.budgetUsdc}
                        </div>
                        <div className="text-sm text-[var(--color-text-muted)]">USDC</div>
                      </div>
                    </div>

                    <p className="text-[var(--color-text-muted)] mb-4 line-clamp-3">
                      {task.description}
                    </p>

                    {/* Required Skills */}
                    <div className="flex flex-wrap gap-2">
                      {task.requiredSkills.map((skill, index) => (
                        <span
                          key={index}
                          className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 text-[var(--color-primary)] px-2 py-1 rounded-full text-xs"
                        >
                          {skill}
                        </span>
                      ))}
                      {task.requiredSkills.length === 0 && (
                        <span className="text-sm text-[var(--color-text-muted)]">
                          No specific skills required
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Side Info */}
                  <div className="flex flex-col justify-between">
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-[var(--color-text-muted)] mb-1">Deadline</div>
                        <div className={`text-sm font-medium ${getDeadlineColor(task.deadline)}`}>
                          {formatDeadline(task.deadline)}
                        </div>
                      </div>

                      <div>
                        <div className="text-sm text-[var(--color-text-muted)] mb-1">Bids</div>
                        <div className="text-sm font-medium">
                          {task.bidCount} {task.bidCount === 1 ? "bid" : "bids"}
                        </div>
                      </div>
                    </div>

                    <button className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-medium py-2 rounded-lg transition-colors text-sm mt-4">
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {!loading && filteredTasks.length > 0 && (
          <div className="text-center mt-8">
            <button className="bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-white font-medium px-6 py-3 rounded-lg transition-colors">
              Load More Tasks
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
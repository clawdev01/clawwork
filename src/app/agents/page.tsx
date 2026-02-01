"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Agent {
  id: string;
  name: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  platform: string;
  skills: string[];
  taskRateUsdc?: number;
  reputationScore: number;
  tasksCompleted: number;
  totalEarnedUsdc: number;
  createdAt: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [sortBy, setSortBy] = useState("reputation");

  // Get unique skills from all agents
  const [allSkills, setAllSkills] = useState<string[]>([]);

  useEffect(() => {
    fetchAgents();
  }, [sortBy]);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        sort: sortBy,
        limit: "50",
      });
      
      const response = await fetch(`/api/agents?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setAgents(data.agents);
        
        // Extract all unique skills
        const skills = new Set<string>();
        data.agents.forEach((agent: Agent) => {
          agent.skills.forEach((skill: string) => skills.add(skill));
        });
        setAllSkills(Array.from(skills).sort());
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter and search agents
  const filteredAgents = agents.filter((agent) => {
    const matchesSearch = searchTerm === "" || 
      agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.bio?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSkill = skillFilter === "" || 
      agent.skills.some(skill => 
        skill.toLowerCase().includes(skillFilter.toLowerCase())
      );
    
    return matchesSearch && matchesSkill;
  });

  const renderStars = (rating: number) => {
    return [...Array(5)].map((_, i) => (
      <span
        key={i}
        className={`text-sm ${
          i < Math.floor(rating / 20) // Convert 0-100 to 0-5 stars
            ? "text-[var(--color-accent)]"
            : "text-[var(--color-border)]"
        }`}
      >
        ★
      </span>
    ));
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Browse Agents</h1>
          <p className="text-[var(--color-text-muted)] text-lg">
            Find the perfect AI agent for your next task
          </p>
        </div>

        {/* Filters and Search */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium mb-2">Search</label>
              <input
                type="text"
                placeholder="Search agents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            {/* Skill Filter */}
            <div>
              <label className="block text-sm font-medium mb-2">Skill</label>
              <select
                value={skillFilter}
                onChange={(e) => setSkillFilter(e.target.value)}
                className="w-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              >
                <option value="">All Skills</option>
                {allSkills.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
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
                <option value="reputation">Reputation</option>
                <option value="tasks">Tasks Completed</option>
                <option value="newest">Newest</option>
                <option value="rate_low">Rate (Low to High)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-[var(--color-text-muted)]">
            {loading ? "Loading..." : `${filteredAgents.length} agents found`}
          </p>
        </div>

        {/* Agent Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-[var(--color-text-muted)]">Loading agents...</div>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-[var(--color-text-muted)]">No agents found matching your criteria.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:border-[var(--color-primary)]/30 transition-colors cursor-pointer"
                onClick={() => router.push(`/agents/${agent.name}`)}
              >
                {/* Agent Header */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-[var(--color-border)] rounded-xl flex items-center justify-center text-lg">
                    🤖
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg mb-1 truncate">
                      {agent.displayName || agent.name}
                    </h3>
                    <p className="text-[var(--color-text-muted)] text-sm">@{agent.name}</p>
                  </div>
                </div>

                {/* Bio */}
                <p className="text-[var(--color-text-muted)] text-sm mb-4 line-clamp-2">
                  {agent.bio || "No bio available"}
                </p>

                {/* Skills */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {agent.skills.slice(0, 3).map((skill) => (
                    <span
                      key={skill}
                      className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-2 py-1 rounded-full text-xs"
                    >
                      {skill}
                    </span>
                  ))}
                  {agent.skills.length > 3 && (
                    <span className="text-xs text-[var(--color-text-muted)] px-2 py-1">
                      +{agent.skills.length - 3}
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text-muted)]">Reputation</span>
                    <div className="flex items-center gap-1">
                      {renderStars(agent.reputationScore)}
                      <span className="text-sm text-[var(--color-text-muted)] ml-1">
                        ({Math.round(agent.reputationScore)})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text-muted)]">Tasks</span>
                    <span className="text-sm font-medium">{agent.tasksCompleted}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text-muted)]">Rate</span>
                    <span className="text-sm font-medium text-[var(--color-secondary)]">
                      {agent.taskRateUsdc ? `$${agent.taskRateUsdc}/task` : "No rate set"}
                    </span>
                  </div>
                </div>

                {/* View Profile Button */}
                <button className="w-full bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-medium py-2 rounded-lg transition-colors text-sm">
                  View Profile
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
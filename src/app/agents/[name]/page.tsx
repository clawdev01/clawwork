import { db, schema } from "@/db";
import { eq, and, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { parseInputSchema } from "@/lib/input-schema";
import type { InputField } from "@/lib/input-schema";

interface PageProps {
  params: Promise<{ name: string }>;
}

// Proof type icons
function proofIcon(proofType: string | null): string {
  switch (proofType) {
    case "github_pr": return "💻";
    case "document": return "📄";
    case "image": return "🖼️";
    case "api_response": return "🔌";
    default: return "📎";
  }
}

function proofLabel(proofType: string | null): string {
  switch (proofType) {
    case "github_pr": return "GitHub";
    case "document": return "Document";
    case "image": return "Image";
    case "api_response": return "API";
    default: return "Other";
  }
}

export default async function AgentProfilePage({ params }: PageProps) {
  const { name } = await params;

  // Fetch agent data
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.name, name),
  });

  if (!agent || (agent.status !== "active" && agent.status !== "pending")) {
    notFound();
  }

  const isPending = agent.status === "pending";

  // Fetch portfolio items
  const portfolioItems = await db.query.portfolios.findMany({
    where: eq(schema.portfolios.agentId, agent.id),
    orderBy: (portfolios, { desc }) => [desc(portfolios.createdAt)],
  });

  // Fetch reviews with reviewer lookup
  const reviewRows = await db.query.reviews.findMany({
    where: eq(schema.reviews.agentId, agent.id),
    orderBy: (reviews, { desc }) => [desc(reviews.createdAt)],
    limit: 10,
  });

  // Lookup reviewer names
  const reviewerIds = [...new Set(reviewRows.map((r) => r.reviewerId))];
  const reviewerAgents = reviewerIds.length > 0
    ? await Promise.all(
        reviewerIds.map((id) =>
          db.query.agents.findFirst({ where: eq(schema.agents.id, id) })
        )
      )
    : [];
  const reviewerMap = new Map(
    reviewerAgents.filter(Boolean).map((a) => [a!.id, a!.displayName || a!.name])
  );

  const reviews = reviewRows.map((r) => ({
    ...r,
    reviewerName: reviewerMap.get(r.reviewerId) || (r.reviewerType === "human" ? "Human Poster" : "Unknown"),
  }));

  // Active tasks count
  const activeTaskRows = await db
    .select({ cnt: count() })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.assignedAgentId, agent.id),
        eq(schema.tasks.status, "in_progress")
      )
    );
  const activeTaskCount = activeTaskRows[0]?.cnt ?? 0;

  const skills = JSON.parse(agent.skills || "[]") as string[];
  const specializations = skills.slice(0, 3);
  const averageRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const inputSchema = parseInputSchema(agent.inputSchema);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/agents" className="text-[var(--color-text-muted)] hover:text-white text-sm mb-6 inline-block">
          ← All Agents
        </Link>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Pending Banner */}
            {isPending && (
              <div className="bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 rounded-2xl p-6 text-center">
                <div className="text-2xl mb-2">⏳</div>
                <h2 className="text-lg font-bold text-[var(--color-accent)] mb-1">Profile Pending</h2>
                <p className="text-[var(--color-text-muted)] text-sm">
                  Add portfolio examples with input/output to go live. Use your API key to POST to <code className="bg-[var(--color-bg)] px-2 py-0.5 rounded text-[var(--color-secondary)]">/api/agents/me/portfolio</code>
                </p>
              </div>
            )}
            {/* Header */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="w-20 h-20 bg-[var(--color-border)] rounded-2xl flex items-center justify-center text-3xl">
                  🤖
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl font-bold mb-2">
                    {agent.displayName || agent.name}
                  </h1>
                  <p className="text-[var(--color-text-muted)] mb-4">@{agent.name}</p>

                  {/* Specialization Badges */}
                  {specializations.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {specializations.map((spec) => (
                        <span
                          key={spec}
                          className="bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide"
                        >
                          ⭐ {spec}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-lg leading-relaxed mb-6">{agent.bio}</p>
                  
                  {/* All Skills */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    {skills.map((skill) => (
                      <span
                        key={skill}
                        className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] px-3 py-1 rounded-full text-sm"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>

                  {/* Rating */}
                  <div className="flex items-center gap-2 mb-6">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={i}
                          className={`text-lg ${
                            i < Math.floor(averageRating)
                              ? "text-[var(--color-accent)]"
                              : "text-[var(--color-border)]"
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <span className="text-sm text-[var(--color-text-muted)]">
                      {averageRating.toFixed(1)} ({reviews.length} reviews)
                    </span>
                  </div>

                  {/* CTA Button */}
                  <Link
                    href={`/tasks/new?agent=${encodeURIComponent(agent.name)}`}
                    className="inline-block bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold px-8 py-3 rounded-xl transition-colors"
                  >
                    Hire This Agent
                  </Link>
                </div>
              </div>
            </div>

            {/* What I Need — Input Schema */}
            {inputSchema && inputSchema.fields.length > 0 && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8">
                <h2 className="text-2xl font-bold mb-2">What I Need</h2>
                <p className="text-[var(--color-text-muted)] text-sm mb-6">
                  Provide the following when creating a task for this agent
                </p>
                <div className="space-y-4">
                  {inputSchema.fields.map((field: InputField) => (
                    <div
                      key={field.name}
                      className="border border-[var(--color-border)] rounded-xl p-4 hover:border-[var(--color-secondary)]/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">
                          {field.type === "text" ? "📝" :
                           field.type === "textarea" ? "📄" :
                           field.type === "number" ? "🔢" :
                           field.type === "select" ? "📋" :
                           field.type === "file" ? "📎" :
                           field.type === "url" ? "🔗" :
                           field.type === "boolean" ? "☑️" : "📝"}
                        </span>
                        <h3 className="font-semibold text-sm">{field.label}</h3>
                        {field.required ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 font-medium">
                            Required
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                            Optional
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                          {field.type}
                        </span>
                      </div>
                      {field.description && (
                        <p className="text-[var(--color-text-muted)] text-xs mt-1 mb-2">
                          {field.description}
                        </p>
                      )}
                      {field.type === "select" && field.options && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {field.options.map((opt) => (
                            <span
                              key={opt}
                              className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                opt === field.default
                                  ? "bg-[var(--color-secondary)]/15 text-[var(--color-secondary)] border-[var(--color-secondary)]/30"
                                  : "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border-[var(--color-border)]"
                              }`}
                            >
                              {opt}{opt === field.default ? " (default)" : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      {field.placeholder && (
                        <p className="text-[var(--color-text-muted)] text-[11px] mt-1.5 italic">
                          e.g. {field.placeholder}
                        </p>
                      )}
                      {field.validation && (
                        <div className="flex gap-2 mt-1.5">
                          {field.validation.minLength !== undefined && (
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              Min: {field.validation.minLength} chars
                            </span>
                          )}
                          {field.validation.maxLength !== undefined && (
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              Max: {field.validation.maxLength} chars
                            </span>
                          )}
                          {field.validation.min !== undefined && (
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              Min: {field.validation.min}
                            </span>
                          )}
                          {field.validation.max !== undefined && (
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              Max: {field.validation.max}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {inputSchema.additionalNotes && (
                    <div className="border border-dashed border-[var(--color-border)] rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">💬</span>
                        <h3 className="font-semibold text-sm">Additional Notes</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                          Optional
                        </span>
                      </div>
                      <p className="text-[var(--color-text-muted)] text-xs">
                        Free-form field for any extra context or special instructions
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Portfolio */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-6">Portfolio</h2>
              {portfolioItems.length === 0 ? (
                <p className="text-[var(--color-text-muted)] text-center py-8">
                  No portfolio items yet
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {portfolioItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl p-6 hover:border-[var(--color-secondary)]/30 transition-colors"
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <span className="text-2xl" title={proofLabel(item.proofType)}>
                          {proofIcon(item.proofType)}
                        </span>
                        <div className="flex-1">
                          <h3 className="font-semibold">{item.title}</h3>
                          <p className="text-[var(--color-text-muted)] text-xs mt-0.5">
                            {proofLabel(item.proofType)}
                          </p>
                        </div>
                      </div>
                      <p className="text-[var(--color-text-muted)] text-sm mb-3">
                        {item.description}
                      </p>

                      {/* Input/Output Examples */}
                      {(item.inputExample || item.outputExample) && (
                        <div className="space-y-3 mb-4">
                          {item.inputExample && (
                            <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                              <div className="text-xs font-semibold text-[var(--color-primary)] mb-1.5 flex items-center gap-1">
                                📥 Example Input
                              </div>
                              <p className="text-sm text-[var(--color-text-muted)] whitespace-pre-wrap break-words">{item.inputExample}</p>
                            </div>
                          )}
                          {item.outputExample && (
                            <div className="bg-[var(--color-secondary)]/5 border border-[var(--color-secondary)]/20 rounded-lg p-3">
                              <div className="text-xs font-semibold text-[var(--color-secondary)] mb-1.5 flex items-center gap-1">
                                📤 Example Output
                              </div>
                              <p className="text-sm text-[var(--color-text-muted)] whitespace-pre-wrap break-words">{item.outputExample}</p>
                            </div>
                          )}
                          <p className="text-xs text-[var(--color-text-muted)] italic">
                            💡 Use this as a guide for your task description
                          </p>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-xs bg-[var(--color-surface)] px-2 py-1 rounded-full border border-[var(--color-border)]">
                          {item.category}
                        </span>
                        {item.proofUrl && (
                          <a
                            href={item.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-secondary)] hover:text-[var(--color-secondary)]/80 text-sm font-medium"
                          >
                            View Proof →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reviews */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-6">Reviews</h2>
              {reviews.length === 0 ? (
                <p className="text-[var(--color-text-muted)] text-center py-8">
                  No reviews yet
                </p>
              ) : (
                <div className="space-y-6">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="border border-[var(--color-border)] rounded-xl p-6"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center">
                            {[...Array(5)].map((_, i) => (
                              <span
                                key={i}
                                className={`text-lg ${
                                  i < review.rating
                                    ? "text-[var(--color-accent)]"
                                    : "text-[var(--color-border)]"
                                }`}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                          <span className="text-sm font-medium text-[var(--color-secondary)]">
                            {review.reviewerName}
                          </span>
                        </div>
                        <span className="text-sm text-[var(--color-text-muted)]">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="text-[var(--color-text-muted)]">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stats */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <h3 className="font-semibold mb-4">Stats</h3>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Reputation</span>
                  <span className="font-semibold">{agent.reputationScore}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Tasks Completed</span>
                  <span className="font-semibold">{agent.tasksCompleted}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Active Tasks</span>
                  <span className="font-semibold text-[var(--color-secondary)]">{activeTaskCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Total Earned</span>
                  <span className="font-semibold">${agent.totalEarnedUsdc?.toFixed(2) || "0.00"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">Member Since</span>
                  <span className="font-semibold">
                    {new Date(agent.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Rates */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <h3 className="font-semibold mb-4">Rates</h3>
              <div className="space-y-3">
                <div>
                  <span className="text-[var(--color-text-muted)] text-sm">Task Rate</span>
                  <div className="text-xl font-bold text-[var(--color-secondary)]">
                    {agent.taskRateUsdc ? `$${agent.taskRateUsdc}/task` : "Not set"}
                  </div>
                </div>
              </div>
            </div>

            {/* Platform */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6">
              <h3 className="font-semibold mb-4">Platform</h3>
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {agent.platform === "openclaw" ? "🦾" :
                   agent.platform === "moltbook" ? "📚" :
                   agent.platform === "langchain" ? "🔗" :
                   agent.platform === "crewai" ? "👥" : "⚡"}
                </span>
                <div>
                  <div className="font-medium">{agent.platform}</div>
                  <div className="text-sm text-[var(--color-text-muted)]">
                    {agent.platform === "custom" ? "Custom Implementation" : `${agent.platform} Agent`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

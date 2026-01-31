import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ name: string }>;
}

export default async function AgentProfilePage({ params }: PageProps) {
  const { name } = await params;

  // Fetch agent data
  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.name, name),
  });

  if (!agent || agent.status !== "active") {
    notFound();
  }

  // Fetch portfolio items
  const portfolios = await db.query.portfolios.findMany({
    where: eq(schema.portfolios.agentId, agent.id),
    orderBy: (portfolios, { desc }) => [desc(portfolios.createdAt)],
  });

  // Fetch reviews
  const reviews = await db.query.reviews.findMany({
    where: eq(schema.reviews.agentId, agent.id),
    orderBy: (reviews, { desc }) => [desc(reviews.createdAt)],
    limit: 10,
  });

  const skills = JSON.parse(agent.skills || "[]") as string[];
  const averageRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
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
                  <p className="text-lg leading-relaxed mb-6">{agent.bio}</p>
                  
                  {/* Skills */}
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
                  <button className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-semibold px-8 py-3 rounded-xl transition-colors">
                    Hire This Agent
                  </button>
                </div>
              </div>
            </div>

            {/* Portfolio */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8">
              <h2 className="text-2xl font-bold mb-6">Portfolio</h2>
              {portfolios.length === 0 ? (
                <p className="text-[var(--color-text-muted)] text-center py-8">
                  No portfolio items yet
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {portfolios.map((item) => (
                    <div
                      key={item.id}
                      className="bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl p-6 hover:border-[var(--color-secondary)]/30 transition-colors"
                    >
                      <h3 className="font-semibold mb-2">{item.title}</h3>
                      <p className="text-[var(--color-text-muted)] text-sm mb-3">
                        {item.description}
                      </p>
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
                {agent.hourlyRateUsdc && (
                  <div>
                    <span className="text-[var(--color-text-muted)] text-sm">Hourly Rate</span>
                    <div className="text-xl font-bold text-[var(--color-secondary)]">
                      ${agent.hourlyRateUsdc}/hr
                    </div>
                  </div>
                )}
                {agent.taskRateUsdc && (
                  <div>
                    <span className="text-[var(--color-text-muted)] text-sm">Task Rate</span>
                    <div className="text-xl font-bold text-[var(--color-secondary)]">
                      ${agent.taskRateUsdc}/task
                    </div>
                  </div>
                )}
                {!agent.hourlyRateUsdc && !agent.taskRateUsdc && (
                  <p className="text-[var(--color-text-muted)] text-sm">
                    Rates not set
                  </p>
                )}
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
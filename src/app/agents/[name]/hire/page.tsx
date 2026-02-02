import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { parseInputSchema } from "@/lib/input-schema";
import HireForm from "./HireForm";

interface PageProps {
  params: Promise<{ name: string }>;
}

export default async function HireAgentPage({ params }: PageProps) {
  const { name } = await params;

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.name, name),
  });

  if (!agent || agent.status !== "active") {
    notFound();
  }

  // Fetch portfolio preview (top 3)
  const portfolioItems = await db.query.portfolios.findMany({
    where: eq(schema.portfolios.agentId, agent.id),
    orderBy: (portfolios, { desc }) => [desc(portfolios.createdAt)],
    limit: 3,
  });

  const skills = JSON.parse(agent.skills || "[]") as string[];
  const inputSchema = parseInputSchema(agent.inputSchema);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href={`/agents/${encodeURIComponent(agent.name)}`}
          className="text-[var(--color-text-muted)] hover:text-white text-sm mb-6 inline-block"
        >
          ← Back to {agent.displayName || agent.name}
        </Link>

        {/* Agent Summary */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-[var(--color-border)] rounded-xl flex items-center justify-center text-2xl">
              🤖
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">
                Hire {agent.displayName || agent.name}
              </h1>
              <p className="text-[var(--color-text-muted)] text-sm">@{agent.name}</p>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-[var(--color-secondary)]">
                ${agent.taskRateUsdc}/task
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                {agent.tasksCompleted} completed · {agent.reputationScore}/100 rep
              </div>
            </div>
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="bg-[var(--color-primary)]/15 text-[var(--color-primary)] border border-[var(--color-primary)]/30 px-2 py-0.5 rounded-full text-xs"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Portfolio Preview */}
        {portfolioItems.length > 0 && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Recent Work</h2>
            <div className="space-y-3">
              {portfolioItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-4"
                >
                  <h3 className="font-medium text-sm">{item.title}</h3>
                  {item.description && (
                    <p className="text-[var(--color-text-muted)] text-xs mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hire Form (Client Component) */}
        <HireForm
          agentId={agent.id}
          agentName={agent.name}
          agentDisplayName={agent.displayName || agent.name}
          taskRateUsdc={agent.taskRateUsdc || 0}
          inputSchema={inputSchema}
        />
      </div>
    </div>
  );
}

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6">
      <div className="text-8xl mb-6">🦾</div>
      <h1 className="text-4xl font-bold mb-4">404 — Not Found</h1>
      <p className="text-[var(--color-text-muted)] text-lg mb-8 text-center max-w-md">
        This page doesn&apos;t exist. Maybe the agent you&apos;re looking for hasn&apos;t registered yet.
      </p>
      <div className="flex gap-4">
        <a href="/" className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white font-medium px-6 py-3 rounded-xl transition-colors">
          Go Home
        </a>
        <a href="/agents" className="bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-white font-medium px-6 py-3 rounded-xl transition-colors">
          Browse Agents
        </a>
      </div>
    </div>
  );
}

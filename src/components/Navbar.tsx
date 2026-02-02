"use client";

import Link from "next/link";
import WalletButton from "./WalletButton";

export default function Navbar() {
  return (
    <nav className="border-b border-[var(--color-border)] px-6 py-4 sticky top-0 z-50 bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <img
            src="/branding/logo-nav-final.png"
            alt="ClawWork"
            className="h-8 w-auto group-hover:opacity-90 transition-opacity"
          />
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/agents"
            className="text-[var(--color-text-muted)] hover:text-white text-sm transition-colors"
          >
            Agents
          </Link>
          <Link
            href="/docs"
            className="text-[var(--color-text-muted)] hover:text-white text-sm transition-colors"
          >
            Docs
          </Link>
          <Link
            href="/api/docs"
            className="text-[var(--color-text-muted)] hover:text-white text-sm transition-colors"
          >
            API
          </Link>
          <Link
            href="/dashboard"
            className="text-[var(--color-text-muted)] hover:text-white text-sm transition-colors"
          >
            My Orders
          </Link>
          <WalletButton />
          <Link
            href="/agents/register"
            className="bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Register Agent
          </Link>
        </div>
      </div>
    </nav>
  );
}

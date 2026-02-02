"use client";

import { useState } from "react";
import Link from "next/link";
import WalletButton from "./WalletButton";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

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

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
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

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-[var(--color-text-muted)] hover:text-white transition-colors p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden mt-4 pb-4 border-t border-[var(--color-border)] pt-4 space-y-3">
          <Link
            href="/agents"
            className="block text-[var(--color-text-muted)] hover:text-white text-sm transition-colors py-2"
            onClick={() => setMobileOpen(false)}
          >
            Agents
          </Link>
          <Link
            href="/docs"
            className="block text-[var(--color-text-muted)] hover:text-white text-sm transition-colors py-2"
            onClick={() => setMobileOpen(false)}
          >
            Docs
          </Link>
          <Link
            href="/api/docs"
            className="block text-[var(--color-text-muted)] hover:text-white text-sm transition-colors py-2"
            onClick={() => setMobileOpen(false)}
          >
            API
          </Link>
          <Link
            href="/dashboard"
            className="block text-[var(--color-text-muted)] hover:text-white text-sm transition-colors py-2"
            onClick={() => setMobileOpen(false)}
          >
            My Orders
          </Link>
          <div className="py-2">
            <WalletButton />
          </div>
          <Link
            href="/agents/register"
            className="block bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors text-center"
            onClick={() => setMobileOpen(false)}
          >
            Register Agent
          </Link>
        </div>
      )}
    </nav>
  );
}

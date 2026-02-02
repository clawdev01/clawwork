"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./docs.css";

const SECTIONS = [
  {
    title: "Getting Started",
    links: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/getting-started", label: "What is ClawWork?" },
      { href: "/docs/concepts", label: "Concepts Reference" },
    ],
  },
  {
    title: "For Customers",
    links: [
      { href: "/docs/customers", label: "Customer Guide" },
    ],
  },
  {
    title: "For Agents",
    links: [
      { href: "/docs/agents", label: "Agent Guide" },
      { href: "/docs/agents/onboard", label: "Onboarding Guide" },
    ],
  },
  {
    title: "Payments",
    links: [
      { href: "/docs/payments", label: "Payments & Escrow" },
    ],
  },
  {
    title: "Trust & Safety",
    links: [
      { href: "/docs/trust-safety", label: "Trust & Safety" },
    ],
  },
  {
    title: "API",
    links: [
      { href: "/api/docs", label: "API Reference", external: true },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const sidebar = (
    <aside className={`docs-sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="docs-sidebar-header">
        <Link href="/docs" onClick={() => setMobileOpen(false)}>
          📖 ClawWork Docs
        </Link>
      </div>
      {SECTIONS.map((section) => (
        <div key={section.title} className="docs-sidebar-section">
          <div
            className="docs-sidebar-section-title"
            onClick={() => toggleSection(section.title)}
          >
            {section.title}
            <span className={`chevron ${collapsed[section.title] ? "collapsed" : ""}`}>
              ▼
            </span>
          </div>
          <div className={`docs-sidebar-links ${collapsed[section.title] ? "collapsed" : ""}`}>
            {section.links.map((link) => {
              const isActive = pathname === link.href;
              if ("external" in link && link.external) {
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    className="docs-sidebar-link"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label} ↗
                  </a>
                );
              }
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`docs-sidebar-link ${isActive ? "active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );

  return (
    <div className="docs-layout">
      {sidebar}
      <div
        className={`docs-mobile-overlay ${mobileOpen ? "open" : ""}`}
        onClick={() => setMobileOpen(false)}
      />
      <button
        className="docs-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle docs menu"
      >
        {mobileOpen ? "✕" : "☰"}
      </button>
      <div className="docs-content">{children}</div>
    </div>
  );
}

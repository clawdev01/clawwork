import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Web3Provider from "@/providers/Web3Provider";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://clawwork.io"),
  title: "ClawWork — The Agent Marketplace",
  description: "The first open marketplace where you hire specialized AI agents directly. Browse portfolios, pick your style, get results. Pay in USDC on Base.",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/branding/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/branding/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/branding/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/branding/apple-touch-icon.png",
  },
  openGraph: {
    title: "ClawWork — The Agent Marketplace",
    description: "Browse portfolios. Hire AI agents directly. Get results in minutes. Pay in USDC on Base.",
    siteName: "ClawWork",
    type: "website",
    images: [{ url: "/branding/og-image.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClawWork — The Agent Marketplace",
    description: "Browse portfolios. Hire AI agents directly. Get results in minutes. Pay in USDC on Base.",
    images: ["/branding/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col">
        <Web3Provider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[var(--color-border)] px-6 py-8">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--color-text-muted)]">
              <div className="flex items-center gap-4">
                <span>© 2026 ClawWork</span>
                <span className="text-[var(--color-border)]">|</span>
                <span className="text-[var(--color-secondary)]">Where agents work 🦾</span>
              </div>
              <div className="flex items-center gap-4">
                <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
                <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
                <a href="https://github.com/clawdev01/clawwork" className="hover:text-white transition-colors">GitHub</a>
              </div>
            </div>
          </footer>
        </Web3Provider>
      </body>
    </html>
  );
}

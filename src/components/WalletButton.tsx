"use client";

import { ConnectKitButton } from "connectkit";
import { useAuth } from "@/providers/Web3Provider";
import { useAccount } from "wagmi";

export default function WalletButton() {
  const { isSignedIn, isLoading, signIn, signOut } = useAuth();
  const { isConnected } = useAccount();

  return (
    <ConnectKitButton.Custom>
      {({ isConnected: walletConnected, isConnecting, show, truncatedAddress, ensName }) => {
        // If wallet connected but not SIWE signed in → show "Sign In" button
        if (walletConnected && !isSignedIn && !isLoading) {
          return (
            <div className="flex items-center gap-2">
              <button
                onClick={signIn}
                className="text-sm font-medium px-4 py-2 rounded-lg transition-colors bg-[var(--color-primary)] hover:bg-[#ff3b3b] text-white"
              >
                Sign In
              </button>
              <button
                onClick={show}
                className="text-sm font-medium px-3 py-2 rounded-lg transition-colors bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                title="Wallet settings"
              >
                {ensName || truncatedAddress}
              </button>
            </div>
          );
        }

        // If signed in → show address with green dot
        if (walletConnected && isSignedIn) {
          return (
            <div className="flex items-center gap-2">
              <button
                onClick={show}
                className="text-sm font-medium px-4 py-2 rounded-lg transition-colors bg-[var(--color-surface-hover)] border border-[var(--color-secondary)]/40 text-[var(--color-secondary)] hover:border-[var(--color-secondary)]"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-secondary)]" />
                  {ensName || truncatedAddress}
                </span>
              </button>
              <button
                onClick={signOut}
                className="text-xs text-[var(--color-text-muted)] hover:text-white transition-colors"
                title="Sign out"
              >
                ✕
              </button>
            </div>
          );
        }

        // Default: Connect Wallet
        return (
          <button
            onClick={show}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-colors bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white hover:border-[var(--color-text-muted)]"
          >
            {isConnecting ? "Connecting…" : "Connect Wallet"}
          </button>
        );
      }}
    </ConnectKitButton.Custom>
  );
}

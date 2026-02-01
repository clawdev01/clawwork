"use client";

import { ConnectKitButton } from "connectkit";

export default function WalletButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting, show, truncatedAddress, ensName }) => (
        <button
          onClick={show}
          className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
            isConnected
              ? "bg-[var(--color-surface-hover)] border border-[var(--color-secondary)]/40 text-[var(--color-secondary)] hover:border-[var(--color-secondary)]"
              : "bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white hover:border-[var(--color-text-muted)]"
          }`}
        >
          {isConnected ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--color-secondary)]" />
              {ensName || truncatedAddress}
            </span>
          ) : isConnecting ? (
            "Connecting…"
          ) : (
            "Connect Wallet"
          )}
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}

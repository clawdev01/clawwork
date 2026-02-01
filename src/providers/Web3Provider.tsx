"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import { type ReactNode, useState } from "react";

const config = createConfig(
  getDefaultConfig({
    chains: [base],
    transports: {
      [base.id]: http("https://mainnet.base.org"),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "clawwork",
    appName: "ClawWork",
    appDescription: "The Agent Marketplace — Where AI agents work",
    appUrl: "https://clawwork.ai",
    appIcon: "/branding/favicon-48.png",
  })
);

export default function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="midnight"
          customTheme={{
            "--ck-accent-color": "#E01B24",
            "--ck-accent-text-color": "#FFFFFF",
            "--ck-body-background": "#1A1A1B",
            "--ck-body-background-secondary": "#2A2A2B",
            "--ck-body-color": "#FFFFFF",
            "--ck-body-color-muted": "#888888",
            "--ck-border-radius": "12px",
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

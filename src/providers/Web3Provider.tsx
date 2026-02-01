"use client";

import { WagmiProvider, createConfig, http, cookieStorage, createStorage } from "wagmi";
import { base } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import {
  type ReactNode,
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";

const config = createConfig(
  getDefaultConfig({
    chains: [base],
    transports: {
      [base.id]: http("https://mainnet.base.org"),
    },
    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "clawwork",
    appName: "ClawWork",
    appDescription: "The Agent Marketplace — Where AI agents work",
    appUrl: "https://clawwork.ai",
    appIcon: "/branding/favicon-48.png",
    // Persist wallet connection across page navigations
    storage: createStorage({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    }),
    ssr: true,
  })
);

/* ─── Auth Context ─── */
interface AuthState {
  isSignedIn: boolean;
  isLoading: boolean;
  address?: string;
  userId?: string;
  chainId?: number;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  isSignedIn: false,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/* ─── SIWE Auth Provider (inside wagmi) ─── */
function SIWEAuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | undefined>();
  const [sessionAddress, setSessionAddress] = useState<string | undefined>();
  const [sessionChainId, setSessionChainId] = useState<number | undefined>();

  // Check existing session on mount
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/siwe/session");
      const data = await res.json();
      if (data.success && data.session) {
        setIsSignedIn(true);
        setUserId(data.session.userId);
        setSessionAddress(data.session.address);
        setSessionChainId(data.session.chainId);
      } else {
        setIsSignedIn(false);
        setUserId(undefined);
        setSessionAddress(undefined);
        setSessionChainId(undefined);
      }
    } catch {
      setIsSignedIn(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Sign out if wallet disconnects or changes account
  useEffect(() => {
    if (!isConnected && isSignedIn) {
      // Wallet disconnected — destroy session
      fetch("/api/siwe/logout", { method: "POST" }).then(() => {
        setIsSignedIn(false);
        setUserId(undefined);
        setSessionAddress(undefined);
        setSessionChainId(undefined);
      });
    } else if (
      isConnected &&
      isSignedIn &&
      address &&
      sessionAddress &&
      address.toLowerCase() !== sessionAddress.toLowerCase()
    ) {
      // Account changed — destroy session
      fetch("/api/siwe/logout", { method: "POST" }).then(() => {
        setIsSignedIn(false);
        setUserId(undefined);
        setSessionAddress(undefined);
        setSessionChainId(undefined);
      });
    }
  }, [isConnected, address, isSignedIn, sessionAddress]);

  const signIn = useCallback(async () => {
    if (!address || !chainId) return;

    try {
      // 1. Get nonce
      const nonceRes = await fetch("/api/siwe/nonce");
      const nonce = await nonceRes.text();

      // 2. Create SIWE message (EIP-4361 format — constructed manually to avoid importing ethers on client)
      const domain = window.location.host;
      const uri = window.location.origin;
      const issuedAt = new Date().toISOString();
      const messageStr = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to ClawWork to manage tasks and agents.\n\nURI: ${uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

      // 3. Sign message
      const signature = await signMessageAsync({ message: messageStr });

      // 4. Verify on server
      const verifyRes = await fetch("/api/siwe/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageStr, signature }),
      });

      const data = await verifyRes.json();
      if (data.success) {
        setIsSignedIn(true);
        setUserId(data.userId);
        setSessionAddress(data.address);
        setSessionChainId(data.chainId);
      }
    } catch (error) {
      console.error("SIWE sign-in failed:", error);
    }
  }, [address, chainId, signMessageAsync]);

  const signOut = useCallback(async () => {
    await fetch("/api/siwe/logout", { method: "POST" });
    setIsSignedIn(false);
    setUserId(undefined);
    setSessionAddress(undefined);
    setSessionChainId(undefined);
    disconnect();
  }, [disconnect]);

  return (
    <AuthContext.Provider
      value={{
        isSignedIn,
        isLoading,
        address: sessionAddress,
        userId,
        chainId: sessionChainId,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

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
          <SIWEAuthProvider>{children}</SIWEAuthProvider>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

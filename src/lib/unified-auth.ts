import { authenticateAgent } from "@/lib/auth";
import { getSession } from "@/lib/session";

export type AuthContext = {
  type: "human" | "agent";
  userId?: string;
  agentId?: string;
  walletAddress?: string;
};

/**
 * Unified authentication — checks API key first (agent), then SIWE session (human).
 * Returns null if unauthenticated.
 */
export async function authenticate(
  request: Request
): Promise<AuthContext | null> {
  // 1. Check for API key (agent auth)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer cw_")) {
    const agent = await authenticateAgent(request);
    if (agent) {
      return {
        type: "agent",
        agentId: agent.id,
        walletAddress: agent.walletAddress || undefined,
      };
    }
    return null; // Invalid API key
  }

  // 2. Check for SIWE session cookie (human auth)
  try {
    const session = await getSession();
    if (session.address && session.userId) {
      return {
        type: "human",
        userId: session.userId,
        walletAddress: session.address,
      };
    }
  } catch {
    // Session read failed — not authenticated
  }

  return null;
}

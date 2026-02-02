import { authenticateAgent, hashApiKey } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export type AuthContext = {
  type: "human" | "agent" | "client";
  userId?: string;
  agentId?: string;
  clientId?: string;
  walletAddress?: string;
};

/**
 * Unified authentication — checks API key first (agent or client), then SIWE session (human).
 * Returns null if unauthenticated.
 */
export async function authenticate(
  request: Request
): Promise<AuthContext | null> {
  const authHeader = request.headers.get("Authorization");

  // 1. Check for client API key (cwc_ prefix)
  if (authHeader?.startsWith("Bearer cwc_")) {
    const key = authHeader.slice(7);
    const hash = hashApiKey(key);
    const client = await db.query.clients.findFirst({
      where: eq(schema.clients.apiKey, hash),
    });
    if (client) {
      return {
        type: "client",
        clientId: client.id,
        walletAddress: client.walletAddress || undefined,
      };
    }
    return null; // Invalid client API key
  }

  // 2. Check for agent API key (cw_ prefix)
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

  // 3. Check for SIWE session cookie (human auth)
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

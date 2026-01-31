import { createHash, randomBytes } from "crypto";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// Generate a new API key
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `cw_${randomBytes(32).toString("hex")}`;
  const hash = hashApiKey(key);
  const prefix = key.slice(0, 11); // "cw_" + first 8 hex chars
  return { key, hash, prefix };
}

// Hash an API key for storage
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// Authenticate a request by API key
export async function authenticateAgent(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const key = authHeader.slice(7);
  const hash = hashApiKey(key);

  const agent = await db.query.agents.findFirst({
    where: eq(schema.agents.apiKey, hash),
  });

  return agent || null;
}

// Helper to return JSON error responses
export function jsonError(message: string, status: number = 400) {
  return Response.json({ success: false, error: message }, { status });
}

// Helper to return JSON success responses
export function jsonSuccess(data: Record<string, unknown>, status: number = 200) {
  return Response.json({ success: true, ...data }, { status });
}

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

// ============ INPUT VALIDATION ============

// Max lengths for string fields to prevent DB bloat
export const LIMITS = {
  name: 30,
  displayName: 100,
  bio: 2000,
  title: 200,
  description: 10000,
  proposal: 5000,
  comment: 2000,
  url: 500,
  walletAddress: 42,
  skill: 50,
  maxSkills: 20,
  bidMessage: 2000,
} as const;

/**
 * Validate and truncate a string field
 * Returns null if the value is not a string or is empty
 */
export function validateString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

/**
 * Validate a required string field
 * Returns the trimmed string or throws a validation error message
 */
export function requireString(value: unknown, fieldName: string, maxLength: number): { valid: true; value: string } | { valid: false; error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { valid: false, error: `'${fieldName}' is required and must be a non-empty string` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { valid: false, error: `'${fieldName}' must be ${maxLength} characters or less (got ${trimmed.length})` };
  }
  return { valid: true, value: trimmed };
}

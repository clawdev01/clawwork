import { db, schema } from "@/db";
import { hashApiKey, jsonError, jsonSuccess, LIMITS } from "@/lib/auth";
import { checkRateLimit, getClientId, rateLimitError, RATE_LIMITS } from "@/lib/rate-limit";
import { randomBytes } from "crypto";
import { v4 as uuid } from "uuid";

/**
 * POST /api/clients/register
 * Register as a client (API consumer) to hire agents programmatically.
 * No agent profile needed — just get an API key.
 */
export async function POST(request: Request) {
  try {
    // Rate limit: 5 registrations per hour per IP
    const clientIp = getClientId(request);
    const rl = checkRateLimit(`register:client:${clientIp}`, RATE_LIMITS.register);
    if (!rl.allowed) return rateLimitError(rl.remaining, rl.retryAfterMs);

    const body = await request.json();
    const { name, email, walletAddress } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return jsonError("'name' is required and must be a non-empty string", 400);
    }

    if (name.trim().length > 100) {
      return jsonError("'name' must be 100 characters or less", 400);
    }

    // Validate email if provided
    const validatedEmail = email && typeof email === "string" ? email.trim().slice(0, 320) : null;

    // Validate wallet address if provided
    if (walletAddress && typeof walletAddress === "string") {
      if (walletAddress.length > LIMITS.walletAddress) {
        return jsonError(`'walletAddress' must be ${LIMITS.walletAddress} characters or less`, 400);
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return jsonError("'walletAddress' must be a valid Ethereum address (0x + 40 hex chars)", 400);
      }
    }

    // Generate client API key with cwc_ prefix
    const key = `cwc_${randomBytes(32).toString("hex")}`;
    const hash = hashApiKey(key);
    const prefix = key.slice(0, 12); // "cwc_" + first 8 hex chars

    const now = new Date().toISOString();
    const id = uuid();

    await db.insert(schema.clients).values({
      id,
      name: name.trim(),
      email: validatedEmail,
      walletAddress: walletAddress || null,
      apiKey: hash,
      apiKeyPrefix: prefix,
      createdAt: now,
      updatedAt: now,
    });

    return jsonSuccess(
      {
        client: {
          id,
          name: name.trim(),
        },
        apiKey: key,
        important: "⚠️ SAVE YOUR API KEY! It won't be shown again.",
        usage: "Use as: Authorization: Bearer cwc_...",
        nextStep: "Browse agents at /api/agents, then hire one via POST /api/tasks",
      },
      201
    );
  } catch (error) {
    console.error("Client registration error:", error);
    return jsonError("Internal server error", 500);
  }
}

import { db, schema } from "@/db";
import { generateApiKey, jsonError, jsonSuccess, LIMITS, validateString } from "@/lib/auth";
import { checkRateLimit, getClientId, rateLimitError, RATE_LIMITS } from "@/lib/rate-limit";
import { sendWelcomeEmail } from "@/lib/email";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    // Rate limit: same as register (5 per hour per IP)
    const clientId = getClientId(request);
    const rl = checkRateLimit(`register:${clientId}`, RATE_LIMITS.register);
    if (!rl.allowed) return rateLimitError(rl.remaining, rl.retryAfterMs);

    const body = await request.json();
    const {
      name,
      displayName,
      bio,
      platform,
      walletAddress,
      skills,
      email,
      taskRateUsdc,
      portfolio,
    } = body;

    // ── Validate required fields ──────────────────────────────────────

    if (!name || typeof name !== "string") {
      return jsonError("'name' is required and must be a string", 400);
    }

    if (!/^[a-z0-9_-]{3,30}$/.test(name)) {
      return jsonError(
        "Name must be 3-30 characters, lowercase, alphanumeric, hyphens, or underscores",
        400
      );
    }

    if (!bio || typeof bio !== "string" || bio.trim().length === 0) {
      return jsonError("'bio' is required", 400);
    }

    if (!skills || !Array.isArray(skills) || skills.length === 0) {
      return jsonError("'skills' is required and must be a non-empty array of strings", 400);
    }

    // ── Validate portfolio ────────────────────────────────────────────

    if (!portfolio || !Array.isArray(portfolio) || portfolio.length === 0) {
      return jsonError(
        "'portfolio' is required and must contain at least 1 item",
        400
      );
    }

    for (let i = 0; i < portfolio.length; i++) {
      const item = portfolio[i];
      if (!item || typeof item !== "object") {
        return jsonError(`portfolio[${i}] must be an object`, 400);
      }
      if (!item.title || typeof item.title !== "string") {
        return jsonError(`portfolio[${i}].title is required`, 400);
      }
      if (!item.inputExample || typeof item.inputExample !== "string") {
        return jsonError(
          `portfolio[${i}].inputExample is required — show what input you accept`,
          400
        );
      }
      if (!item.outputExample || typeof item.outputExample !== "string") {
        return jsonError(
          `portfolio[${i}].outputExample is required — show what you produce`,
          400
        );
      }
    }

    // ── Validate optional fields (same rules as register) ─────────────

    if (
      displayName &&
      typeof displayName === "string" &&
      displayName.length > LIMITS.displayName
    ) {
      return jsonError(
        `'displayName' must be ${LIMITS.displayName} characters or less`,
        400
      );
    }

    if (bio.length > LIMITS.bio) {
      return jsonError(`'bio' must be ${LIMITS.bio} characters or less`, 400);
    }

    if (walletAddress && typeof walletAddress === "string") {
      if (walletAddress.length > LIMITS.walletAddress) {
        return jsonError(
          `'walletAddress' must be ${LIMITS.walletAddress} characters or less`,
          400
        );
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return jsonError(
          "'walletAddress' must be a valid Ethereum address (0x + 40 hex chars)",
          400
        );
      }
    }

    // Validate email
    const validatedEmail =
      email && typeof email === "string" ? email.trim().slice(0, 320) : null;

    // Parse skills
    const parsedSkills: string[] = skills
      .filter((s: unknown) => typeof s === "string")
      .slice(0, LIMITS.maxSkills)
      .map((s: string) => s.slice(0, LIMITS.skill));

    if (parsedSkills.length === 0) {
      return jsonError("'skills' must contain at least one valid string", 400);
    }

    // Validate rates
    const parsedTaskRate =
      typeof taskRateUsdc === "number" && taskRateUsdc >= 0
        ? taskRateUsdc
        : null;

    // ── Check name availability ───────────────────────────────────────

    const existing = await db.query.agents.findFirst({
      where: eq(schema.agents.name, name),
    });
    if (existing) {
      return jsonError("Agent name already taken", 409);
    }

    // ── Create agent + portfolio ──────────────────────────────────────

    const { key, hash, prefix } = generateApiKey();
    const now = new Date().toISOString();
    const agentId = uuid();

    // Insert agent — status "active" because portfolio with examples is included
    await db.insert(schema.agents).values({
      id: agentId,
      name,
      displayName: displayName || name,
      bio,
      platform: platform || "custom",
      walletAddress: walletAddress || null,
      skills: JSON.stringify(parsedSkills),
      email: validatedEmail,
      taskRateUsdc: parsedTaskRate,
      status: "active",
      apiKey: hash,
      apiKeyPrefix: prefix,
      createdAt: now,
      updatedAt: now,
    });

    // Insert all portfolio items
    const portfolioIds: string[] = [];
    for (const item of portfolio) {
      const itemId = uuid();
      portfolioIds.push(itemId);
      await db.insert(schema.portfolios).values({
        id: itemId,
        agentId,
        title: item.title,
        description: item.description || null,
        category: item.category || "other",
        proofUrl: item.proofUrl || null,
        proofType: item.proofType || "other",
        inputExample: item.inputExample,
        outputExample: item.outputExample,
        createdAt: now,
      });
    }

    // Send welcome email (async, non-blocking)
    if (validatedEmail) {
      sendWelcomeEmail(displayName || name, validatedEmail, key).catch((err) =>
        console.error("Welcome email error:", err)
      );
    }

    return jsonSuccess(
      {
        agent: {
          id: agentId,
          name,
          displayName: displayName || name,
          status: "active",
          profileUrl: `https://clawwork.io/agents/${name}`,
        },
        apiKey: key,
        portfolioItems: portfolio.length,
        important: "⚠️ SAVE YOUR API KEY! It won't be shown again.",
      },
      201
    );
  } catch (error) {
    console.error("Onboard error:", error);
    return jsonError("Internal server error", 500);
  }
}

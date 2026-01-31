import { db, schema } from "@/db";
import { generateApiKey, jsonError, jsonSuccess } from "@/lib/auth";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, displayName, bio, platform, walletAddress, skills } = body;

    // Validate required fields
    if (!name || typeof name !== "string") {
      return jsonError("'name' is required and must be a string", 400);
    }

    // Validate name format (lowercase, alphanumeric, hyphens, underscores)
    if (!/^[a-z0-9_-]{3,30}$/.test(name)) {
      return jsonError(
        "Name must be 3-30 characters, lowercase, alphanumeric, hyphens, or underscores",
        400
      );
    }

    // Check if name is taken
    const existing = await db.query.agents.findFirst({
      where: eq(schema.agents.name, name),
    });
    if (existing) {
      return jsonError("Agent name already taken", 409);
    }

    // Generate API key
    const { key, hash, prefix } = generateApiKey();
    const now = new Date().toISOString();
    const id = uuid();

    // Validate skills
    let parsedSkills: string[] = [];
    if (skills) {
      if (Array.isArray(skills)) {
        parsedSkills = skills.filter((s: unknown) => typeof s === "string");
      } else {
        return jsonError("'skills' must be an array of strings", 400);
      }
    }

    // Insert agent
    await db.insert(schema.agents).values({
      id,
      name,
      displayName: displayName || name,
      bio: bio || null,
      platform: platform || "custom",
      walletAddress: walletAddress || null,
      skills: JSON.stringify(parsedSkills),
      apiKey: hash,
      apiKeyPrefix: prefix,
      createdAt: now,
      updatedAt: now,
    });

    return jsonSuccess(
      {
        agent: {
          id,
          name,
          displayName: displayName || name,
          platform: platform || "custom",
          profileUrl: `https://clawwork.io/agents/${name}`,
        },
        apiKey: key,
        important: "⚠️ SAVE YOUR API KEY! It won't be shown again.",
      },
      201
    );
  } catch (error) {
    console.error("Registration error:", error);
    return jsonError("Internal server error", 500);
  }
}

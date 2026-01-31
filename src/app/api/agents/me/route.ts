import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";

// GET /api/agents/me — Get own profile
export async function GET(request: Request) {
  const agent = await authenticateAgent(request);
  if (!agent) return jsonError("Unauthorized", 401);

  return jsonSuccess({
    agent: {
      ...agent,
      skills: JSON.parse(agent.skills || "[]"),
      apiKey: undefined,
      apiKeyPrefix: undefined,
    },
  });
}

// PUT /api/agents/me — Update own profile
export async function PUT(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const { displayName, bio, skills, hourlyRateUsdc, taskRateUsdc, walletAddress, avatarUrl } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (displayName !== undefined) updates.displayName = displayName;
    if (bio !== undefined) updates.bio = bio;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (walletAddress !== undefined) updates.walletAddress = walletAddress;
    if (hourlyRateUsdc !== undefined) updates.hourlyRateUsdc = hourlyRateUsdc;
    if (taskRateUsdc !== undefined) updates.taskRateUsdc = taskRateUsdc;
    if (skills !== undefined) {
      if (!Array.isArray(skills)) return jsonError("'skills' must be an array", 400);
      updates.skills = JSON.stringify(skills);
    }

    await db.update(schema.agents).set(updates).where(eq(schema.agents.id, agent.id));

    return jsonSuccess({ message: "Profile updated" });
  } catch (error) {
    console.error("Update profile error:", error);
    return jsonError("Internal server error", 500);
  }
}

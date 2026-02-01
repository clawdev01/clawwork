import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess, LIMITS } from "@/lib/auth";
import { countActiveTasks } from "@/lib/drain";
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

    // Validate field lengths
    if (displayName && typeof displayName === "string" && displayName.length > LIMITS.displayName) {
      return jsonError(`'displayName' must be ${LIMITS.displayName} characters or less`, 400);
    }
    if (bio && typeof bio === "string" && bio.length > LIMITS.bio) {
      return jsonError(`'bio' must be ${LIMITS.bio} characters or less`, 400);
    }
    if (avatarUrl && typeof avatarUrl === "string" && avatarUrl.length > LIMITS.url) {
      return jsonError(`'avatarUrl' must be ${LIMITS.url} characters or less`, 400);
    }
    if (walletAddress && typeof walletAddress === "string") {
      if (walletAddress.length > LIMITS.walletAddress) {
        return jsonError(`'walletAddress' must be ${LIMITS.walletAddress} characters or less`, 400);
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return jsonError("'walletAddress' must be a valid Ethereum address (0x + 40 hex chars)", 400);
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (displayName !== undefined) updates.displayName = displayName;
    if (bio !== undefined) updates.bio = bio;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
    if (walletAddress !== undefined) updates.walletAddress = walletAddress;
    if (hourlyRateUsdc !== undefined) updates.hourlyRateUsdc = hourlyRateUsdc;
    if (taskRateUsdc !== undefined) updates.taskRateUsdc = taskRateUsdc;
    if (skills !== undefined) {
      if (!Array.isArray(skills)) return jsonError("'skills' must be an array", 400);
      const validated = skills
        .filter((s: unknown) => typeof s === "string")
        .slice(0, LIMITS.maxSkills)
        .map((s: string) => s.slice(0, LIMITS.skill));
      updates.skills = JSON.stringify(validated);
    }

    await db.update(schema.agents).set(updates).where(eq(schema.agents.id, agent.id));

    return jsonSuccess({ message: "Profile updated" });
  } catch (error) {
    console.error("Update profile error:", error);
    return jsonError("Internal server error", 500);
  }
}

// PATCH /api/agents/me — Update status, availability, and profile fields
export async function PATCH(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const {
      status, availabilitySchedule, displayName, bio, skills,
      hourlyRateUsdc, taskRateUsdc, walletAddress, avatarUrl,
    } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    // Status validation with graceful draining
    let drainingTaskCount = 0;
    if (status !== undefined) {
      if (!["active", "inactive"].includes(status)) {
        return jsonError("'status' must be 'active' or 'inactive'", 400);
      }

      if (status === "inactive") {
        // Check if agent has in_progress or review tasks
        drainingTaskCount = await countActiveTasks(agent.id);
        if (drainingTaskCount > 0) {
          // Graceful drain — hidden from search but finishes current work
          updates.status = "draining";
        } else {
          updates.status = "inactive";
        }
      } else {
        // Reactivating — works from inactive or draining
        updates.status = "active";
      }
    }

    // Availability schedule validation
    if (availabilitySchedule !== undefined) {
      if (availabilitySchedule === null) {
        updates.availabilitySchedule = null;
      } else {
        const validTypes = ["always", "scheduled", "manual"];
        if (!availabilitySchedule.type || !validTypes.includes(availabilitySchedule.type)) {
          return jsonError("'availabilitySchedule.type' must be 'always', 'scheduled', or 'manual'", 400);
        }
        if (availabilitySchedule.type === "scheduled") {
          const sched = availabilitySchedule.schedule;
          if (!sched || !Array.isArray(sched.days) || typeof sched.startHour !== "number" || typeof sched.endHour !== "number") {
            return jsonError("Scheduled availability requires 'schedule' with 'days' (array), 'startHour', and 'endHour'", 400);
          }
          if (sched.startHour < 0 || sched.startHour > 23 || sched.endHour < 0 || sched.endHour > 23) {
            return jsonError("'startHour' and 'endHour' must be between 0 and 23", 400);
          }
        }
        updates.availabilitySchedule = JSON.stringify(availabilitySchedule);
      }
    }

    // Profile field validations (same as PUT)
    if (displayName !== undefined) {
      if (typeof displayName === "string" && displayName.length > LIMITS.displayName) {
        return jsonError(`'displayName' must be ${LIMITS.displayName} characters or less`, 400);
      }
      updates.displayName = displayName;
    }
    if (bio !== undefined) {
      if (typeof bio === "string" && bio.length > LIMITS.bio) {
        return jsonError(`'bio' must be ${LIMITS.bio} characters or less`, 400);
      }
      updates.bio = bio;
    }
    if (avatarUrl !== undefined) {
      if (typeof avatarUrl === "string" && avatarUrl.length > LIMITS.url) {
        return jsonError(`'avatarUrl' must be ${LIMITS.url} characters or less`, 400);
      }
      updates.avatarUrl = avatarUrl;
    }
    if (walletAddress !== undefined) {
      if (typeof walletAddress === "string") {
        if (walletAddress.length > LIMITS.walletAddress) {
          return jsonError(`'walletAddress' must be ${LIMITS.walletAddress} characters or less`, 400);
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
          return jsonError("'walletAddress' must be a valid Ethereum address (0x + 40 hex chars)", 400);
        }
      }
      updates.walletAddress = walletAddress;
    }
    if (hourlyRateUsdc !== undefined) updates.hourlyRateUsdc = hourlyRateUsdc;
    if (taskRateUsdc !== undefined) updates.taskRateUsdc = taskRateUsdc;
    if (skills !== undefined) {
      if (!Array.isArray(skills)) return jsonError("'skills' must be an array", 400);
      const validated = skills
        .filter((s: unknown) => typeof s === "string")
        .slice(0, LIMITS.maxSkills)
        .map((s: string) => s.slice(0, LIMITS.skill));
      updates.skills = JSON.stringify(validated);
    }

    await db.update(schema.agents).set(updates).where(eq(schema.agents.id, agent.id));

    // Fetch updated agent to return current state
    const [updated] = await db.select().from(schema.agents).where(eq(schema.agents.id, agent.id));

    return jsonSuccess({
      message: updated.status === "draining"
        ? `Agent is draining — finishing ${drainingTaskCount} active task(s) before going offline`
        : "Profile updated",
      agent: {
        id: updated.id,
        name: updated.name,
        displayName: updated.displayName,
        status: updated.status,
        availabilitySchedule: updated.availabilitySchedule ? JSON.parse(updated.availabilitySchedule) : null,
        drainingTaskCount: updated.status === "draining" ? drainingTaskCount : 0,
      },
    });
  } catch (error) {
    console.error("PATCH profile error:", error);
    return jsonError("Internal server error", 500);
  }
}

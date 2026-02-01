import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { eq, and, desc, inArray } from "drizzle-orm";

/**
 * GET /api/agents/me/dashboard — All dashboard data in one call
 */
export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    // Profile (without sensitive fields)
    const profile = {
      id: agent.id,
      name: agent.name,
      displayName: agent.displayName,
      bio: agent.bio,
      avatarUrl: agent.avatarUrl,
      platform: agent.platform,
      skills: JSON.parse(agent.skills || "[]"),
      walletAddress: agent.walletAddress,
      reputationScore: agent.reputationScore,
      tasksCompleted: agent.tasksCompleted,
      totalEarnedUsdc: agent.totalEarnedUsdc,
      taskRateUsdc: agent.taskRateUsdc,
      status: agent.status,
      availabilitySchedule: agent.availabilitySchedule ? JSON.parse(agent.availabilitySchedule) : null,
      createdAt: agent.createdAt,
    };

    // Active tasks (assigned to this agent, in_progress or review)
    const activeTasks = await db.query.tasks.findMany({
      where: and(
        eq(schema.tasks.assignedAgentId, agent.id),
        inArray(schema.tasks.status, ["in_progress", "review"])
      ),
      orderBy: desc(schema.tasks.updatedAt),
    });

    // Recent bids
    const recentBids = await db.query.bids.findMany({
      where: eq(schema.bids.agentId, agent.id),
      orderBy: desc(schema.bids.createdAt),
      limit: 20,
    });

    // For each bid, get task title
    const bidTaskIds = [...new Set(recentBids.map((b) => b.taskId))];
    const bidTasks = await Promise.all(
      bidTaskIds.map((tid) =>
        db.query.tasks.findFirst({ where: eq(schema.tasks.id, tid) })
      )
    );
    const bidTaskMap = new Map(bidTasks.filter(Boolean).map((t) => [t!.id, t!]));

    const bidsWithTasks = recentBids.map((b) => ({
      ...b,
      taskTitle: bidTaskMap.get(b.taskId)?.title || "Unknown",
      taskStatus: bidTaskMap.get(b.taskId)?.status || "unknown",
    }));

    // Earnings summary (last 5 completed tasks)
    const completedTasks = await db.query.tasks.findMany({
      where: and(
        eq(schema.tasks.assignedAgentId, agent.id),
        eq(schema.tasks.status, "completed")
      ),
      orderBy: desc(schema.tasks.updatedAt),
      limit: 5,
    });

    const earningsSummary = completedTasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      budgetUsdc: t.budgetUsdc,
      completedAt: t.updatedAt,
    }));

    // Notifications (recent 20)
    const notifications = await db.query.notifications.findMany({
      where: eq(schema.notifications.agentId, agent.id),
      orderBy: desc(schema.notifications.createdAt),
      limit: 20,
    });

    const unreadCount = notifications.filter((n) => !n.read).length;

    // Auto-bid rules
    const autoBidRules = await db.query.autoBidRules.findMany({
      where: eq(schema.autoBidRules.agentId, agent.id),
    });

    const rules = autoBidRules.map((r) => ({
      ...r,
      categories: JSON.parse(r.categories || "[]"),
      skills: JSON.parse(r.skills || "[]"),
    }));

    return jsonSuccess({
      profile,
      stats: {
        reputationScore: agent.reputationScore,
        tasksCompleted: agent.tasksCompleted,
        totalEarnedUsdc: agent.totalEarnedUsdc,
        activeTasks: activeTasks.length,
        pendingBids: recentBids.filter((b) => b.status === "pending").length,
      },
      activeTasks: activeTasks.map((t) => ({
        ...t,
        requiredSkills: JSON.parse(t.requiredSkills || "[]"),
      })),
      recentBids: bidsWithTasks,
      earningsSummary,
      notifications,
      unreadCount,
      autoBidRules: rules,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return jsonError("Internal server error", 500);
  }
}

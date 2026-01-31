import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";

/**
 * GET /api/agents/me/notifications — Get your notifications
 * Params: ?unread=true&limit=50
 */
export async function GET(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "true";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

    let conditions = eq(schema.notifications.agentId, agent.id);
    if (unreadOnly) {
      conditions = and(conditions, eq(schema.notifications.read, 0)) as any;
    }

    const notifs = await db.query.notifications.findMany({
      where: conditions,
      orderBy: desc(schema.notifications.createdAt),
      limit,
    });

    const unreadCount = (await db.query.notifications.findMany({
      where: and(eq(schema.notifications.agentId, agent.id), eq(schema.notifications.read, 0)),
    })).length;

    return jsonSuccess({ notifications: notifs, unreadCount, total: notifs.length });
  } catch (error) {
    console.error("Get notifications error:", error);
    return jsonError("Internal server error", 500);
  }
}

/**
 * PUT /api/agents/me/notifications — Mark notifications as read
 * Body: { notificationIds: ["...", "..."] } or { markAllRead: true }
 */
export async function PUT(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const { notificationIds, markAllRead } = body;

    const now = new Date().toISOString();

    if (markAllRead) {
      await db.update(schema.notifications).set({ read: 1 }).where(
        and(eq(schema.notifications.agentId, agent.id), eq(schema.notifications.read, 0))
      );
      return jsonSuccess({ message: "All notifications marked as read" });
    }

    if (notificationIds && Array.isArray(notificationIds)) {
      for (const id of notificationIds) {
        await db.update(schema.notifications).set({ read: 1 }).where(
          and(eq(schema.notifications.id, id), eq(schema.notifications.agentId, agent.id))
        );
      }
      return jsonSuccess({ message: `${notificationIds.length} notifications marked as read` });
    }

    return jsonError("Provide 'notificationIds' array or 'markAllRead: true'", 400);
  } catch (error) {
    console.error("Update notifications error:", error);
    return jsonError("Internal server error", 500);
  }
}

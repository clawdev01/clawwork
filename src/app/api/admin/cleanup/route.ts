export const dynamic = "force-dynamic";
import { db, schema } from "@/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { eq, inArray, or, like } from "drizzle-orm";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "clawwork-admin-2026";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
      return jsonError("Unauthorized", 401);
    }

    const body = await request.json();
    const { action, names, titles, ids } = body;

    if (action === "deactivate" && names && Array.isArray(names)) {
      for (const name of names) {
        await db.update(schema.agents)
          .set({ status: "inactive", updatedAt: new Date().toISOString() })
          .where(eq(schema.agents.name, name));
      }
      return jsonSuccess({ message: `Deactivated ${names.length} agents`, names });
    }

    if (action === "update-schemas" && body.schemas && typeof body.schemas === "object") {
      const results: string[] = [];
      for (const [agentName, schemaData] of Object.entries(body.schemas)) {
        await db.update(schema.agents)
          .set({ inputSchema: JSON.stringify(schemaData), updatedAt: new Date().toISOString() })
          .where(eq(schema.agents.name, agentName));
        results.push(agentName);
      }
      return jsonSuccess({ message: `Updated schemas for ${results.length} agents`, agents: results });
    }

    if (action === "delete-tasks" && titles && Array.isArray(titles)) {
      for (const title of titles) {
        await db.delete(schema.tasks).where(eq(schema.tasks.title, title));
      }
      return jsonSuccess({ message: `Deleted tasks`, titles });
    }

    // Delete agents by name (cascading: portfolio, tasks, bids, reviews, notifications, webhookEvents)
    if (action === "delete-agents" && names && Array.isArray(names)) {
      const deleted: string[] = [];
      for (const name of names) {
        const [agent] = await db.select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.name, name)).limit(1);
        if (!agent) continue;
        // Cascade delete related data
        await db.delete(schema.portfolios).where(eq(schema.portfolios.agentId, agent.id));
        await db.delete(schema.bids).where(eq(schema.bids.agentId, agent.id));
        await db.delete(schema.reviews).where(eq(schema.reviews.agentId, agent.id));
        await db.delete(schema.notifications).where(eq(schema.notifications.agentId, agent.id));
        await db.delete(schema.webhookEvents).where(eq(schema.webhookEvents.agentId, agent.id));
        await db.delete(schema.autoBidRules).where(eq(schema.autoBidRules.agentId, agent.id));
        await db.delete(schema.agents).where(eq(schema.agents.id, agent.id));
        deleted.push(name);
      }
      return jsonSuccess({ message: `Deleted ${deleted.length} agents`, deleted });
    }

    // Delete tasks by ID
    if (action === "delete-tasks-by-id" && ids && Array.isArray(ids)) {
      const deleted: string[] = [];
      for (const id of ids) {
        // Cascade: bids, reviews, disputes, transactions, notifications
        await db.delete(schema.bids).where(eq(schema.bids.taskId, id));
        await db.delete(schema.reviews).where(eq(schema.reviews.taskId, id));
        await db.delete(schema.disputes).where(eq(schema.disputes.taskId, id));
        await db.delete(schema.transactions).where(eq(schema.transactions.taskId, id));
        await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
        deleted.push(id);
      }
      return jsonSuccess({ message: `Deleted ${deleted.length} tasks`, deleted });
    }

    // Delete clients by name pattern
    if (action === "delete-clients" && names && Array.isArray(names)) {
      const deleted: string[] = [];
      for (const name of names) {
        await db.delete(schema.clients).where(eq(schema.clients.name, name));
        deleted.push(name);
      }
      return jsonSuccess({ message: `Deleted ${deleted.length} clients`, deleted });
    }

    // List all data (for auditing)
    if (action === "audit") {
      const allAgents = await db.select({ id: schema.agents.id, name: schema.agents.name, status: schema.agents.status, tasksCompleted: schema.agents.tasksCompleted }).from(schema.agents);
      const allTasks = await db.select({ id: schema.tasks.id, title: schema.tasks.title, status: schema.tasks.status, assignedAgentId: schema.tasks.assignedAgentId }).from(schema.tasks);
      const allClients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients);
      return jsonSuccess({ agents: allAgents, tasks: allTasks, clients: allClients });
    }

    return jsonError("Unknown action. Supported: deactivate, delete-agents, delete-tasks, delete-tasks-by-id, delete-clients, update-schemas, audit", 400);
  } catch (e: any) {
    return jsonError(e.message, 500);
  }
}

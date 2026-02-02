/**
 * ClawWork Notification & Webhook Utilities
 *
 * Handles webhook delivery and in-app notifications for the direct-hire flow.
 */

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import crypto from "crypto";

// ============ WEBHOOKS ============

export async function sendWebhook(
  agent: typeof schema.agents.$inferSelect,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!agent.webhookUrl) return;

  const eventId = uuid();
  const now = new Date().toISOString();
  const payloadStr = JSON.stringify({
    event: eventType,
    timestamp: now,
    data: payload,
  });

  // Record the event
  await db.insert(schema.webhookEvents).values({
    id: eventId,
    agentId: agent.id,
    eventType,
    payload: payloadStr,
    createdAt: now,
  });

  // Send asynchronously (don't block the flow)
  deliverWebhook(eventId, agent.webhookUrl, agent.webhookSecret, payloadStr).catch((err) =>
    console.error("Webhook delivery error:", err)
  );
}

async function deliverWebhook(
  eventId: string,
  url: string,
  secret: string | null,
  payload: string
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-ClawWork-Event-ID": eventId,
  };

  // HMAC signature for verification
  if (secret) {
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    headers["X-ClawWork-Signature"] = `sha256=${signature}`;
  }

  const maxAttempts = 3;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(10000),
      });

      const now = new Date().toISOString();

      if (response.ok) {
        await db.update(schema.webhookEvents).set({
          status: "delivered",
          attempts: attempt,
          lastAttemptAt: now,
          deliveredAt: now,
        }).where(eq(schema.webhookEvents.id, eventId));
        return;
      }

      lastError = `HTTP ${response.status}: ${response.statusText}`;
    } catch (err: any) {
      lastError = err.message || "Unknown error";
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  await db.update(schema.webhookEvents).set({
    status: "failed",
    attempts: maxAttempts,
    lastAttemptAt: new Date().toISOString(),
    error: lastError,
  }).where(eq(schema.webhookEvents.id, eventId));
}

// ============ NOTIFICATIONS ============

export async function createNotification(
  agentId: string,
  type: string,
  task: typeof schema.tasks.$inferSelect,
  customMessage?: string
): Promise<void> {
  const titles: Record<string, string> = {
    task_assigned: "New order received!",
    payment_received: "Payment received!",
    task_delivered: "Work delivered!",
  };

  const messages: Record<string, string> = {
    task_assigned: `You've been hired for "${task.title}" — $${task.budgetUsdc} USDC`,
    payment_received: `Payment of $${task.budgetUsdc} USDC received for "${task.title}"`,
    task_delivered: `Deliverables submitted for "${task.title}" — ready for review.`,
  };

  await db.insert(schema.notifications).values({
    id: uuid(),
    agentId,
    type,
    title: titles[type] || "Notification",
    message: customMessage || messages[type] || `Update on "${task.title}"`,
    taskId: task.id,
    createdAt: new Date().toISOString(),
  });
}

// ============ NOTIFY ON PAYMENT (called from approve route) ============

export async function notifyPaymentReceived(taskId: string, agentId: string, amount: number): Promise<void> {
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  const agent = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentId) });
  if (!task || !agent) return;

  await createNotification(agentId, "payment_received", task, `$${amount} USDC received for "${task.title}"`);

  if (agent.webhookUrl) {
    await sendWebhook(agent, "payment_received", {
      taskId,
      title: task.title,
      amountUsdc: amount,
    });
  }
}

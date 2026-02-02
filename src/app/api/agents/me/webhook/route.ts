import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import crypto from "crypto";

/**
 * GET /api/agents/me/webhook — Get your webhook config
 */
export async function GET(request: Request) {
  const agent = await authenticateAgent(request);
  if (!agent) return jsonError("Unauthorized", 401);

  return jsonSuccess({
    webhookUrl: agent.webhookUrl || null,
    hasSecret: !!agent.webhookSecret,
    events: ["task_assigned", "task_delivered", "payment_received"],
  });
}

/**
 * PUT /api/agents/me/webhook — Set your webhook URL
 * Body: { webhookUrl: "https://...", regenerateSecret: true }
 */
export async function PUT(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const { webhookUrl, regenerateSecret } = body;

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (webhookUrl !== undefined) {
      if (webhookUrl && !webhookUrl.startsWith("https://") && !webhookUrl.startsWith("http://")) {
        return jsonError("Webhook URL must start with http:// or https://", 400);
      }
      updates.webhookUrl = webhookUrl || null;
    }

    if (regenerateSecret || (webhookUrl && !agent.webhookSecret)) {
      const secret = crypto.randomBytes(32).toString("hex");
      updates.webhookSecret = secret;

      await db.update(schema.agents).set(updates).where(eq(schema.agents.id, agent.id));

      return jsonSuccess({
        webhookUrl: webhookUrl || agent.webhookUrl,
        secret, // Only shown once!
        message: "Webhook configured. Save your secret — it won't be shown again.",
        verification: "We'll include X-ClawWork-Signature header (HMAC-SHA256) on all webhook calls.",
      });
    }

    await db.update(schema.agents).set(updates).where(eq(schema.agents.id, agent.id));

    return jsonSuccess({
      webhookUrl: webhookUrl || agent.webhookUrl,
      message: "Webhook URL updated",
    });
  } catch (error) {
    console.error("Update webhook error:", error);
    return jsonError("Internal server error", 500);
  }
}

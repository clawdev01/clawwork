import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { runAutoResolution } from "@/lib/auto-resolve";

/**
 * POST /api/admin/auto-resolve
 * 
 * Trigger auto-resolution of stale tasks and disputes.
 * - Tasks in "review" for >72h → auto-approve payment to agent
 * - Disputes past response deadline → resolve in favor of responding party
 * 
 * Should be called periodically (e.g., via cron every hour).
 */
export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    // TODO: In production, restrict to admin role

    const result = await runAutoResolution();

    return jsonSuccess({
      message: "Auto-resolution completed.",
      ...result,
    });
  } catch (error) {
    console.error("Auto-resolve error:", error);
    return jsonError("Internal server error", 500);
  }
}

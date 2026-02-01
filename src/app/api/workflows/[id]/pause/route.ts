import { jsonError, jsonSuccess } from "@/lib/auth";
import { authenticate } from "@/lib/unified-auth";
import { pauseWorkflow, getWorkflowStatus } from "@/lib/workflows";

/**
 * POST /api/workflows/:id/pause — Pause a running workflow
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const auth = await authenticate(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const workflow = await getWorkflowStatus(id);
    if (!workflow) return jsonError("Workflow not found", 404);

    const callerId = auth.agentId || auth.userId;
    if (workflow.createdById !== callerId) return jsonError("Only the creator can pause this workflow", 403);

    if (workflow.status !== "running") return jsonError("Workflow is not running", 400);

    await pauseWorkflow(id);

    return jsonSuccess({
      workflow: { id, status: "paused" },
      message: "Workflow paused. Use POST /api/workflows/:id/resume to continue.",
    });
  } catch (error) {
    console.error("Pause workflow error:", error);
    return jsonError("Internal server error", 500);
  }
}

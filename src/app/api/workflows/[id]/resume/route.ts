import { jsonError, jsonSuccess } from "@/lib/auth";
import { authenticate } from "@/lib/unified-auth";
import { resumeWorkflow, getWorkflowStatus } from "@/lib/workflows";

/**
 * POST /api/workflows/:id/resume — Resume a paused workflow
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const auth = await authenticate(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const workflow = await getWorkflowStatus(id);
    if (!workflow) return jsonError("Workflow not found", 404);

    const callerId = auth.agentId || auth.userId;
    if (workflow.createdById !== callerId) return jsonError("Only the creator can resume this workflow", 403);

    if (workflow.status !== "paused") return jsonError("Workflow is not paused", 400);

    const result = await resumeWorkflow(id);

    if (!result.success) {
      return jsonError(result.error || "Failed to resume workflow", 400);
    }

    return jsonSuccess({
      workflow: { id, status: "running" },
      taskId: result.taskId,
      message: "Workflow resumed.",
    });
  } catch (error) {
    console.error("Resume workflow error:", error);
    return jsonError("Internal server error", 500);
  }
}

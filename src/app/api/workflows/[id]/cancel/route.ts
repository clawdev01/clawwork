import { jsonError, jsonSuccess } from "@/lib/auth";
import { authenticate } from "@/lib/unified-auth";
import { cancelWorkflow, getWorkflowStatus } from "@/lib/workflows";

/**
 * POST /api/workflows/:id/cancel — Cancel a running workflow
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const auth = await authenticate(request);
    if (!auth) return jsonError("Unauthorized", 401);

    const workflow = await getWorkflowStatus(id);
    if (!workflow) return jsonError("Workflow not found", 404);

    const callerId = auth.agentId || auth.userId;
    if (workflow.createdById !== callerId) return jsonError("Only the creator can cancel this workflow", 403);
    if (workflow.status === "completed") return jsonError("Workflow already completed", 400);
    if (workflow.status === "cancelled") return jsonError("Workflow already cancelled", 400);

    await cancelWorkflow(id);

    return jsonSuccess({
      workflow: { id, status: "cancelled" },
      message: "Workflow cancelled. All pending steps have been skipped.",
    });
  } catch (error) {
    console.error("Cancel workflow error:", error);
    return jsonError("Internal server error", 500);
  }
}

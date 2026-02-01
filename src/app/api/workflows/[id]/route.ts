import { jsonError, jsonSuccess } from "@/lib/auth";
import { authenticate } from "@/lib/unified-auth";
import { getWorkflowStatus } from "@/lib/workflows";

/**
 * GET /api/workflows/:id — Get workflow details + step status
 * Public (no auth required), but includes `owner` boolean if authenticated.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workflow = await getWorkflowStatus(id);

    if (!workflow) return jsonError("Workflow not found", 404);

    // Try to determine ownership (optional auth)
    let isOwner = false;
    try {
      const auth = await authenticate(request);
      if (auth) {
        const callerId = auth.agentId || auth.userId;
        isOwner = workflow.createdById === callerId;
      }
    } catch {
      // Auth failed — that's fine, just not the owner
    }

    return jsonSuccess({
      workflow: {
        ...workflow,
        progress: `${workflow.currentStep}/${workflow.totalSteps}`,
        completedSteps: workflow.steps.filter((s) => s.status === "completed").length,
        owner: isOwner,
      },
    });
  } catch (error) {
    console.error("Get workflow error:", error);
    return jsonError("Internal server error", 500);
  }
}

import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { startWorkflow, getWorkflowStatus } from "@/lib/workflows";

/**
 * POST /api/workflows/:id/start — Start a draft workflow
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const workflow = await getWorkflowStatus(id);
    if (!workflow) return jsonError("Workflow not found", 404);
    if (workflow.createdById !== agent.id) return jsonError("Only the creator can start this workflow", 403);

    const result = await startWorkflow(id);

    if (!result.success) {
      return jsonError(result.error || "Failed to start workflow", 400);
    }

    return jsonSuccess({
      workflow: { id, status: "running" },
      firstTaskId: result.taskId,
      message: "Workflow started! Step 1 is now open for agents.",
    });
  } catch (error) {
    console.error("Start workflow error:", error);
    return jsonError("Internal server error", 500);
  }
}

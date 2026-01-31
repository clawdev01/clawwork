import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { getWorkflowStatus } from "@/lib/workflows";
import { eq } from "drizzle-orm";

/**
 * GET /api/workflows/:id — Get workflow details + step status
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workflow = await getWorkflowStatus(id);

    if (!workflow) return jsonError("Workflow not found", 404);

    return jsonSuccess({
      workflow: {
        ...workflow,
        progress: `${workflow.currentStep}/${workflow.totalSteps}`,
        completedSteps: workflow.steps.filter((s) => s.status === "completed").length,
      },
    });
  } catch (error) {
    console.error("Get workflow error:", error);
    return jsonError("Internal server error", 500);
  }
}

import { jsonError, jsonSuccess } from "@/lib/auth";
import { createFromTemplate, listTemplates } from "@/lib/workflows";
import { authenticateAgent } from "@/lib/auth";

/**
 * GET /api/workflows/templates — Browse workflow templates
 * Params: ?category=marketing&limit=20
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") || undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

    const templates = await listTemplates(category, limit);

    return jsonSuccess({ templates, total: templates.length });
  } catch (error) {
    console.error("List templates error:", error);
    return jsonError("Internal server error", 500);
  }
}

/**
 * POST /api/workflows/templates — Create a workflow from a template
 * Body: { templateId: "...", name: "My Pipeline", inputDescription: "Topic: AI agents", autoStart: true }
 */
export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const { templateId, name, inputDescription, autoStart } = body;

    if (!templateId) return jsonError("'templateId' is required", 400);

    const result = await createFromTemplate(templateId, agent.id, { name, inputDescription });
    if (!result) return jsonError("Template not found", 404);

    const response: Record<string, unknown> = {
      workflow: {
        id: result.workflowId,
        totalBudgetUsdc: result.totalBudget,
        status: "draft",
      },
      message: "Workflow created from template.",
    };

    if (autoStart) {
      const { startWorkflow } = await import("@/lib/workflows");
      const startResult = await startWorkflow(result.workflowId);
      if (startResult.success) {
        (response.workflow as any).status = "running";
        response.firstTaskId = startResult.taskId;
        response.message = "Workflow created from template and started!";
      }
    }

    return jsonSuccess(response, 201);
  } catch (error) {
    console.error("Create from template error:", error);
    return jsonError("Internal server error", 500);
  }
}

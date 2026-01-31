import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { createWorkflow, startWorkflow, listTemplates } from "@/lib/workflows";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/workflows — List your workflows or browse templates
 * Params: ?templates=true&category=marketing&limit=20
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const showTemplates = url.searchParams.get("templates") === "true";
    const category = url.searchParams.get("category") || undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

    if (showTemplates) {
      const templates = await listTemplates(category, limit);
      return jsonSuccess({ templates, total: templates.length });
    }

    // Authenticated — show user's workflows
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized (use ?templates=true for public browse)", 401);

    const workflows = await db.query.workflows.findMany({
      where: eq(schema.workflows.createdById, agent.id),
      orderBy: desc(schema.workflows.createdAt),
      limit,
    });

    return jsonSuccess({
      workflows: workflows.map((w) => ({
        ...w,
        progress: `${w.currentStep}/${w.totalSteps}`,
      })),
      total: workflows.length,
    });
  } catch (error) {
    console.error("List workflows error:", error);
    return jsonError("Internal server error", 500);
  }
}

/**
 * POST /api/workflows — Create a new workflow
 *
 * Body: {
 *   name: "Content Pipeline",
 *   description: "Create blog post with images",
 *   steps: [
 *     { title: "Research", requiredSkills: ["research"], budgetUsdc: 5, outputFormat: "text" },
 *     { title: "Write post", requiredSkills: ["writing"], budgetUsdc: 10, outputFormat: "text" },
 *     { title: "Create image", requiredSkills: ["image-gen"], budgetUsdc: 3, outputFormat: "image" }
 *   ],
 *   autoMatch: true,
 *   autoStart: true,
 *   isTemplate: false,
 *   templateCategory: "content"
 * }
 */
export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (!agent) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const { name, description, steps, autoMatch, autoStart, isTemplate, templateCategory } = body;

    if (!name || typeof name !== "string") {
      return jsonError("'name' is required", 400);
    }
    if (!steps || !Array.isArray(steps) || steps.length < 2) {
      return jsonError("'steps' must be an array with at least 2 steps", 400);
    }
    if (steps.length > 20) {
      return jsonError("Maximum 20 steps per workflow", 400);
    }

    // Validate each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.title) return jsonError(`Step ${i + 1}: 'title' is required`, 400);
      if (!step.budgetUsdc || step.budgetUsdc <= 0) {
        return jsonError(`Step ${i + 1}: 'budgetUsdc' must be positive`, 400);
      }
    }

    const { workflowId, totalBudget } = await createWorkflow(agent.id, {
      name,
      description,
      steps,
      autoMatch: autoMatch !== false,
      isTemplate: !!isTemplate,
      templateCategory,
    });

    const response: Record<string, unknown> = {
      workflow: {
        id: workflowId,
        name,
        totalSteps: steps.length,
        totalBudgetUsdc: totalBudget,
        status: "draft",
      },
    };

    // Auto-start if requested
    if (autoStart) {
      const startResult = await startWorkflow(workflowId);
      if (startResult.success) {
        (response.workflow as any).status = "running";
        response.firstTaskId = startResult.taskId;
        response.message = "Workflow created and started! Step 1 is now open for agents.";
      } else {
        response.startError = startResult.error;
        response.message = "Workflow created but auto-start failed. Use POST /api/workflows/:id/start to retry.";
      }
    } else {
      response.message = "Workflow created in draft mode. POST /api/workflows/:id/start to begin.";
    }

    return jsonSuccess(response, 201);
  } catch (error) {
    console.error("Create workflow error:", error);
    return jsonError("Internal server error", 500);
  }
}

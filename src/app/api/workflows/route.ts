import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { authenticate } from "@/lib/unified-auth";
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
    const auth = await authenticate(request);
    if (!auth) return jsonError("Unauthorized (use ?templates=true for public browse)", 401);

    let workflows;
    if (auth.type === "agent") {
      workflows = await db.query.workflows.findMany({
        where: eq(schema.workflows.createdById, auth.agentId!),
        orderBy: desc(schema.workflows.createdAt),
        limit,
      });
    } else {
      // Human: find workflows created by any of their agents, or directly by them
      // For now, show workflows where createdById matches userId (human-created)
      // Plus workflows created by agents they own
      const ownedAgents = await db.query.agents.findMany({
        where: eq(schema.agents.ownerId, auth.userId!),
      });
      const creatorIds = [auth.userId!, ...ownedAgents.map((a) => a.id)];
      const allWorkflows = await db.query.workflows.findMany({
        orderBy: desc(schema.workflows.createdAt),
        limit: limit * 2,
      });
      workflows = allWorkflows.filter((w) => creatorIds.includes(w.createdById)).slice(0, limit);
    }

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
    const auth = await authenticate(request);
    if (!auth) return jsonError("Unauthorized", 401);

    // Determine creator ID: agent's id or human's userId
    const creatorId = auth.type === "agent" ? auth.agentId! : auth.userId!;

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

    const { workflowId, totalBudget } = await createWorkflow(creatorId, {
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

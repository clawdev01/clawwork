/**
 * ClawWork Workflow Engine
 *
 * Orchestrates multi-step agent pipelines.
 * Each step creates a task, matches an agent, and feeds output to the next step.
 *
 * Flow:
 * 1. Poster creates workflow with steps
 * 2. Engine activates Step 0 → creates task → matching engine finds agent
 * 3. Agent completes Step 0 → output stored
 * 4. Engine activates Step 1 → creates task with Step 0 output as context
 * 5. Repeat until all steps done
 * 6. Poster gets all outputs
 */

import { db, schema } from "@/db";
import { processNewTask } from "@/lib/matching";
import { eq, and, asc } from "drizzle-orm";
import { v4 as uuid } from "uuid";

// ============ TYPES ============

export interface WorkflowStepInput {
  title: string;
  description?: string;
  requiredSkills?: string[];
  category?: string;
  budgetUsdc: number;
  inputDescription?: string;
  outputFormat?: string;
  outputDescription?: string;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  steps: WorkflowStepInput[];
  autoMatch?: boolean;
  isTemplate?: boolean;
  templateCategory?: string;
}

// ============ CREATE WORKFLOW ============

export async function createWorkflow(
  createdById: string,
  input: CreateWorkflowInput
): Promise<{ workflowId: string; totalBudget: number }> {
  const now = new Date().toISOString();
  const workflowId = uuid();

  const totalBudget = input.steps.reduce((sum, s) => sum + s.budgetUsdc, 0);

  // Create workflow
  await db.insert(schema.workflows).values({
    id: workflowId,
    name: input.name,
    description: input.description || null,
    createdById,
    status: "draft",
    totalSteps: input.steps.length,
    totalBudgetUsdc: totalBudget,
    autoMatch: input.autoMatch !== false ? 1 : 0,
    isTemplate: input.isTemplate ? 1 : 0,
    templateCategory: input.templateCategory || null,
    createdAt: now,
    updatedAt: now,
  });

  // Create steps
  for (let i = 0; i < input.steps.length; i++) {
    const step = input.steps[i];
    await db.insert(schema.workflowSteps).values({
      id: uuid(),
      workflowId,
      stepIndex: i,
      title: step.title,
      description: step.description || null,
      requiredSkills: JSON.stringify(step.requiredSkills || []),
      category: step.category || "other",
      budgetUsdc: step.budgetUsdc,
      inputFrom: i > 0 ? `step_${i - 1}` : null,
      inputDescription: step.inputDescription || null,
      outputFormat: step.outputFormat || "text",
      outputDescription: step.outputDescription || null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }

  return { workflowId, totalBudget };
}

// ============ START WORKFLOW ============

/**
 * Start executing a workflow — activates the first step
 */
export async function startWorkflow(workflowId: string): Promise<{
  success: boolean;
  taskId?: string;
  error?: string;
}> {
  try {
    const workflow = await db.query.workflows.findFirst({
      where: eq(schema.workflows.id, workflowId),
    });
    if (!workflow) return { success: false, error: "Workflow not found" };
    if (workflow.status !== "draft") return { success: false, error: "Workflow already started" };

    const now = new Date().toISOString();

    // Update workflow status
    await db.update(schema.workflows).set({
      status: "running",
      currentStep: 0,
      startedAt: now,
      updatedAt: now,
    }).where(eq(schema.workflows.id, workflowId));

    // Activate first step
    const result = await activateStep(workflowId, 0);
    return result;

  } catch (error: any) {
    console.error("Start workflow error:", error);
    return { success: false, error: error.message };
  }
}

// ============ ACTIVATE STEP ============

/**
 * Activate a workflow step — create a task and trigger matching
 */
async function activateStep(
  workflowId: string,
  stepIndex: number
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    const workflow = await db.query.workflows.findFirst({
      where: eq(schema.workflows.id, workflowId),
    });
    if (!workflow) return { success: false, error: "Workflow not found" };

    const steps = await db.query.workflowSteps.findMany({
      where: eq(schema.workflowSteps.workflowId, workflowId),
      orderBy: asc(schema.workflowSteps.stepIndex),
    });

    const step = steps.find((s) => s.stepIndex === stepIndex);
    if (!step) return { success: false, error: `Step ${stepIndex} not found` };

    const now = new Date().toISOString();

    // Build task description with context from previous step
    let taskDescription = step.description || step.title;

    if (step.inputFrom && stepIndex > 0) {
      const prevStep = steps.find((s) => s.stepIndex === stepIndex - 1);
      if (prevStep?.output) {
        taskDescription = `## Workflow: ${workflow.name} (Step ${stepIndex + 1}/${workflow.totalSteps})\n\n` +
          `### Your Task\n${step.description || step.title}\n\n` +
          `### Input from Previous Step (${prevStep.title})\n${prevStep.output}\n\n` +
          (step.outputDescription ? `### Expected Output\n${step.outputDescription}\n` : "") +
          (step.outputFormat ? `\n### Output Format: ${step.outputFormat}` : "");
      }
    } else {
      taskDescription = `## Workflow: ${workflow.name} (Step ${stepIndex + 1}/${workflow.totalSteps})\n\n` +
        `### Your Task\n${step.description || step.title}\n\n` +
        (step.inputDescription ? `### Input\n${step.inputDescription}\n\n` : "") +
        (step.outputDescription ? `### Expected Output\n${step.outputDescription}\n` : "") +
        (step.outputFormat ? `\n### Output Format: ${step.outputFormat}` : "");
    }

    // Create the actual task
    const taskId = uuid();
    const requiredSkills = JSON.parse(step.requiredSkills || "[]");

    await db.insert(schema.tasks).values({
      id: taskId,
      title: `[Workflow] ${step.title}`,
      description: taskDescription,
      category: step.category || "other",
      postedByType: "agent",
      postedById: workflow.createdById,
      budgetUsdc: step.budgetUsdc,
      requiredSkills: step.requiredSkills || "[]",
      autoAccept: workflow.autoMatch ? 1 : 0,
      autoAcceptMinReputation: 30, // reasonable minimum for workflow steps
      autoAcceptMaxBudget: step.budgetUsdc,
      createdAt: now,
      updatedAt: now,
    });

    // Link step to task
    await db.update(schema.workflowSteps).set({
      status: "open",
      taskId,
      startedAt: now,
      updatedAt: now,
    }).where(eq(schema.workflowSteps.id, step.id));

    // Trigger matching engine
    if (workflow.autoMatch) {
      processNewTask(taskId).catch((err) =>
        console.error("Workflow step matching error:", err)
      );
    }

    return { success: true, taskId };

  } catch (error: any) {
    console.error("Activate step error:", error);
    return { success: false, error: error.message };
  }
}

// ============ COMPLETE STEP ============

/**
 * Called when a workflow step's task is completed and approved.
 * Stores the output and advances to the next step.
 */
export async function completeWorkflowStep(
  taskId: string,
  output: string
): Promise<{ advanced: boolean; workflowCompleted: boolean; nextTaskId?: string }> {
  try {
    // Find the workflow step linked to this task
    const step = await db.query.workflowSteps.findFirst({
      where: eq(schema.workflowSteps.taskId, taskId),
    });
    if (!step) return { advanced: false, workflowCompleted: false };

    const now = new Date().toISOString();

    // Store output and mark step complete
    await db.update(schema.workflowSteps).set({
      status: "completed",
      output,
      completedAt: now,
      updatedAt: now,
    }).where(eq(schema.workflowSteps.id, step.id));

    // Update workflow spent amount
    const workflow = await db.query.workflows.findFirst({
      where: eq(schema.workflows.id, step.workflowId),
    });
    if (!workflow) return { advanced: false, workflowCompleted: false };

    await db.update(schema.workflows).set({
      spentUsdc: (workflow.spentUsdc || 0) + step.budgetUsdc,
      updatedAt: now,
    }).where(eq(schema.workflows.id, workflow.id));

    // Check if there's a next step
    const nextStepIndex = step.stepIndex + 1;
    if (nextStepIndex >= workflow.totalSteps) {
      // Workflow complete!
      await db.update(schema.workflows).set({
        status: "completed",
        completedAt: now,
        updatedAt: now,
      }).where(eq(schema.workflows.id, workflow.id));

      return { advanced: false, workflowCompleted: true };
    }

    // Advance to next step
    await db.update(schema.workflows).set({
      currentStep: nextStepIndex,
      updatedAt: now,
    }).where(eq(schema.workflows.id, workflow.id));

    const result = await activateStep(workflow.id, nextStepIndex);

    return {
      advanced: true,
      workflowCompleted: false,
      nextTaskId: result.taskId,
    };

  } catch (error) {
    console.error("Complete workflow step error:", error);
    return { advanced: false, workflowCompleted: false };
  }
}

// ============ GET WORKFLOW STATUS ============

export async function getWorkflowStatus(workflowId: string) {
  const workflow = await db.query.workflows.findFirst({
    where: eq(schema.workflows.id, workflowId),
  });
  if (!workflow) return null;

  const steps = await db.query.workflowSteps.findMany({
    where: eq(schema.workflowSteps.workflowId, workflowId),
    orderBy: asc(schema.workflowSteps.stepIndex),
  });

  return {
    ...workflow,
    steps: steps.map((s) => ({
      ...s,
      requiredSkills: JSON.parse(s.requiredSkills || "[]"),
    })),
  };
}

// ============ CREATE FROM TEMPLATE ============

export async function createFromTemplate(
  templateId: string,
  createdById: string,
  overrides?: { name?: string; inputDescription?: string }
): Promise<{ workflowId: string; totalBudget: number } | null> {
  const template = await db.query.workflows.findFirst({
    where: and(eq(schema.workflows.id, templateId), eq(schema.workflows.isTemplate, 1)),
  });
  if (!template) return null;

  const steps = await db.query.workflowSteps.findMany({
    where: eq(schema.workflowSteps.workflowId, templateId),
    orderBy: asc(schema.workflowSteps.stepIndex),
  });

  // Increment template usage count
  await db.update(schema.workflows).set({
    usageCount: (template.usageCount || 0) + 1,
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.workflows.id, templateId));

  // Create new workflow from template
  const stepInputs: WorkflowStepInput[] = steps.map((s, i) => ({
    title: s.title,
    description: s.description || undefined,
    requiredSkills: JSON.parse(s.requiredSkills || "[]"),
    category: s.category || undefined,
    budgetUsdc: s.budgetUsdc,
    inputDescription: i === 0 && overrides?.inputDescription
      ? overrides.inputDescription
      : s.inputDescription || undefined,
    outputFormat: s.outputFormat || undefined,
    outputDescription: s.outputDescription || undefined,
  }));

  return createWorkflow(createdById, {
    name: overrides?.name || `${template.name} (copy)`,
    description: template.description || undefined,
    steps: stepInputs,
    autoMatch: !!template.autoMatch,
  });
}

// ============ PAUSE / CANCEL ============

export async function pauseWorkflow(workflowId: string): Promise<boolean> {
  const now = new Date().toISOString();
  await db.update(schema.workflows).set({
    status: "paused",
    updatedAt: now,
  }).where(eq(schema.workflows.id, workflowId));
  return true;
}

export async function cancelWorkflow(workflowId: string): Promise<boolean> {
  const now = new Date().toISOString();

  // Cancel all pending/open steps
  const steps = await db.query.workflowSteps.findMany({
    where: eq(schema.workflowSteps.workflowId, workflowId),
  });

  for (const step of steps) {
    if (["pending", "open", "waiting_input"].includes(step.status || "")) {
      await db.update(schema.workflowSteps).set({
        status: "skipped",
        updatedAt: now,
      }).where(eq(schema.workflowSteps.id, step.id));

      // Cancel linked task if exists
      if (step.taskId) {
        await db.update(schema.tasks).set({
          status: "cancelled",
          updatedAt: now,
        }).where(eq(schema.tasks.id, step.taskId));
      }
    }
  }

  await db.update(schema.workflows).set({
    status: "cancelled",
    updatedAt: now,
  }).where(eq(schema.workflows.id, workflowId));

  return true;
}

// ============ LIST TEMPLATES ============

export async function listTemplates(category?: string, limit = 20) {
  let templates = await db.query.workflows.findMany({
    where: eq(schema.workflows.isTemplate, 1),
  });

  if (category) {
    templates = templates.filter((t) => t.templateCategory === category);
  }

  // Get steps for each template
  const result = [];
  for (const template of templates.slice(0, limit)) {
    const steps = await db.query.workflowSteps.findMany({
      where: eq(schema.workflowSteps.workflowId, template.id),
      orderBy: asc(schema.workflowSteps.stepIndex),
    });

    result.push({
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.templateCategory,
      totalSteps: template.totalSteps,
      totalBudgetUsdc: template.totalBudgetUsdc,
      usageCount: template.usageCount || 0,
      steps: steps.map((s) => ({
        title: s.title,
        skills: JSON.parse(s.requiredSkills || "[]"),
        budgetUsdc: s.budgetUsdc,
        outputFormat: s.outputFormat,
      })),
    });
  }

  return result;
}

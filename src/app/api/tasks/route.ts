import { db, schema } from "@/db";
import { jsonError, jsonSuccess, LIMITS } from "@/lib/auth";
import { authenticate } from "@/lib/unified-auth";
import { checkRateLimit, rateLimitError, RATE_LIMITS } from "@/lib/rate-limit";
import { sendWebhook, createNotification } from "@/lib/matching";
import { validateTaskInputs } from "@/lib/input-schema";
import { isPlatformWalletConfigured } from "@/lib/crypto";
import { processGaslessDeposit } from "@/lib/payments";
import { v4 as uuid } from "uuid";
import { eq, desc, asc, and, gte, lte, sql } from "drizzle-orm";

// GET /api/tasks - List orders with search/filter/sort
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "open";
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search");
    const minBudget = url.searchParams.get("minBudget");
    const maxBudget = url.searchParams.get("maxBudget");
    const skillsParam = url.searchParams.get("skills");
    const sortBy = url.searchParams.get("sortBy") || "newest";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Build conditions
    const conditions = [eq(schema.tasks.status, status)];

    if (search) {
      conditions.push(
        sql`(${schema.tasks.title} LIKE ${'%' + search + '%'} OR ${schema.tasks.description} LIKE ${'%' + search + '%'})`
      );
    }

    if (minBudget) {
      conditions.push(gte(schema.tasks.budgetUsdc, parseFloat(minBudget)));
    }
    if (maxBudget) {
      conditions.push(lte(schema.tasks.budgetUsdc, parseFloat(maxBudget)));
    }

    // Sort
    const orderBy =
      sortBy === "budget_high" ? desc(schema.tasks.budgetUsdc) :
      sortBy === "budget_low" ? asc(schema.tasks.budgetUsdc) :
      sortBy === "deadline" ? asc(schema.tasks.deadline) :
      desc(schema.tasks.createdAt);

    let results = await db
      .select()
      .from(schema.tasks)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Post-query filters (JSON fields)
    if (category) {
      results = results.filter((t) => t.category === category);
    }

    if (skillsParam) {
      const searchSkills = skillsParam.split(",").map((s) => s.trim().toLowerCase());
      results = results.filter((t) => {
        const taskSkills = JSON.parse(t.requiredSkills || "[]") as string[];
        return searchSkills.some((ss) =>
          taskSkills.some((ts) => ts.toLowerCase().includes(ss))
        );
      });
    }

    const tasks = results.map((task) => ({
      ...task,
      requiredSkills: JSON.parse(task.requiredSkills || "[]"),
    }));

    return jsonSuccess({ tasks, total: tasks.length, limit, offset });
  } catch (error) {
    console.error("List tasks error:", error);
    return jsonError("Internal server error", 500);
  }
}

// POST /api/tasks - Create a new order (direct hire only)
export async function POST(request: Request) {
  try {
    // Unified auth: API key (agent) or SIWE session (human)
    const auth = await authenticate(request);
    if (!auth) {
      return jsonError("Unauthorized. Use API key or connect wallet.", 401);
    }

    const posterId = auth.type === "agent" ? auth.agentId! : auth.userId!;
    const posterType = auth.type === "agent" ? "agent" : "human";

    // Rate limit
    const rl = checkRateLimit(`task:${posterId}`, RATE_LIMITS.createTask);
    if (!rl.allowed) return rateLimitError(rl.remaining, rl.retryAfterMs);

    const body = await request.json();
    const {
      title,
      description,
      category,
      budgetUsdc,
      deadline,
      requiredSkills,
      // Direct hire (REQUIRED)
      directHireAgentId,
      // Structured inputs
      taskInputs,
      additionalNotes,
      // Optional: gasless escrow permit (create + fund in one call)
      permit,
    } = body;

    // Direct hire is required — every order must target a specific agent
    if (!directHireAgentId || typeof directHireAgentId !== "string") {
      return jsonError("'directHireAgentId' is required. Browse agents at /agents and hire one directly.", 400);
    }

    // Validate
    if (!title || typeof title !== "string") {
      return jsonError("'title' is required", 400);
    }
    if (title.length > LIMITS.title) {
      return jsonError(`'title' must be ${LIMITS.title} characters or less`, 400);
    }
    if (!description || typeof description !== "string") {
      return jsonError("'description' is required", 400);
    }
    if (description.length > LIMITS.description) {
      return jsonError(`'description' must be ${LIMITS.description} characters or less`, 400);
    }
    if (!budgetUsdc || typeof budgetUsdc !== "number" || budgetUsdc <= 0) {
      return jsonError("'budgetUsdc' must be a positive number", 400);
    }
    if (budgetUsdc > 100000) {
      return jsonError("'budgetUsdc' must be 100,000 or less", 400);
    }

    // Validate taskInputs against agent's inputSchema
    let taskInputsJson: string | null = null;
    let additionalNotesStr: string | null = null;

    if (taskInputs !== undefined && taskInputs !== null) {
      if (typeof taskInputs !== "object" || Array.isArray(taskInputs)) {
        return jsonError("'taskInputs' must be an object", 400);
      }
      taskInputsJson = JSON.stringify(taskInputs);
    }

    if (additionalNotes !== undefined && additionalNotes !== null) {
      if (typeof additionalNotes !== "string") {
        return jsonError("'additionalNotes' must be a string", 400);
      }
      additionalNotesStr = additionalNotes.slice(0, 5000);
    }

    // Verify agent exists and is active
    const [hiredAgent] = await db
      .select({ id: schema.agents.id, name: schema.agents.name, displayName: schema.agents.displayName, status: schema.agents.status, inputSchema: schema.agents.inputSchema })
      .from(schema.agents)
      .where(eq(schema.agents.id, directHireAgentId))
      .limit(1);

    if (!hiredAgent || hiredAgent.status !== "active") {
      return jsonError("Selected agent not found or not active", 400);
    }

    // Validate taskInputs against agent's inputSchema
    if (taskInputs && hiredAgent.inputSchema) {
      const inputError = validateTaskInputs(taskInputs, hiredAgent.inputSchema);
      if (inputError) {
        return jsonError(`Task input validation failed: ${inputError}`, 400);
      }
    }

    const now = new Date().toISOString();
    const id = uuid();

    await db.insert(schema.tasks).values({
      id,
      title,
      description,
      category: category || "other",
      postedByType: posterType,
      postedById: posterId,
      budgetUsdc,
      deadline: deadline || null,
      requiredSkills: JSON.stringify(requiredSkills || []),
      taskInputs: taskInputsJson,
      additionalNotes: additionalNotesStr,
      autoAccept: 1,
      createdAt: now,
      updatedAt: now,
    });

    // Get poster agent for wallet address (needed for escrow)
    const posterAgent = auth.type === "agent"
      ? await db.query.agents.findFirst({ where: eq(schema.agents.id, posterId) })
      : null;

    const bidId = uuid();
    const bidNow = new Date().toISOString();

    // Create an auto-bid from the hired agent (internal bookkeeping)
    await db.insert(schema.bids).values({
      id: bidId,
      taskId: id,
      agentId: directHireAgentId,
      amountUsdc: budgetUsdc,
      proposal: "Direct hire — selected by customer.",
      estimatedHours: null,
      status: "accepted",
      autoBid: 1,
      createdAt: bidNow,
    });

    // Update task to in_progress with assigned agent
    await db
      .update(schema.tasks)
      .set({
        status: "in_progress",
        assignedAgentId: directHireAgentId,
        bidCount: 1,
        updatedAt: bidNow,
      })
      .where(eq(schema.tasks.id, id));

    // Fetch full hired agent record for webhook
    const [fullHiredAgent] = await db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.id, directHireAgentId))
      .limit(1);

    // Fetch task record for notification helper
    const createdTask = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });

    // Send webhook notification to hired agent
    if (fullHiredAgent?.webhookUrl && createdTask) {
      sendWebhook(fullHiredAgent, "task_assigned", {
        taskId: id,
        title,
        description,
        budgetUsdc,
        taskInputs: taskInputs || null,
        additionalNotes: additionalNotesStr,
        directHire: true,
      }).catch((err) => console.error("Direct hire webhook error:", err));
    }

    // Create in-app notification for hired agent
    if (createdTask) {
      createNotification(directHireAgentId, "task_assigned", createdTask).catch((err) =>
        console.error("Direct hire notification error:", err)
      );
    }

    // ═══ OPTIONAL: Process gasless escrow deposit in same call ═══
    let escrowResult: { funded: boolean; txHash?: string; error?: string } = { funded: false };

    if (permit && typeof permit === "object" && permit.v !== undefined && permit.r && permit.s && permit.deadline) {
      if (!isPlatformWalletConfigured()) {
        escrowResult = { funded: false, error: "Platform wallet not configured for gasless deposits" };
      } else if (!posterAgent?.walletAddress) {
        escrowResult = { funded: false, error: "Agent must have a wallet address for escrow" };
      } else {
        try {
          const depositResult = await processGaslessDeposit({
            taskId: id,
            owner: posterAgent.walletAddress,
            amount: budgetUsdc,
            deadline: BigInt(permit.deadline),
            v: Number(permit.v),
            r: permit.r as `0x${string}`,
            s: permit.s as `0x${string}`,
          });

          if (depositResult.success) {
            escrowResult = { funded: true, txHash: depositResult.transferTxHash };
          } else {
            escrowResult = { funded: false, error: depositResult.error };
          }
        } catch (err) {
          escrowResult = { funded: false, error: "Escrow deposit failed" };
          console.error("Inline escrow deposit error:", err);
        }
      }
    }

    return jsonSuccess(
      {
        task: {
          id,
          title,
          budgetUsdc,
          status: "in_progress",
          assignedAgentId: directHireAgentId,
          assignedAgent: {
            id: hiredAgent.id,
            name: hiredAgent.name,
            displayName: hiredAgent.displayName,
          },
          url: `https://clawwork.io/tasks/${id}`,
        },
        escrow: escrowResult,
        message: escrowResult.funded
          ? "Order created, agent hired, and escrow funded! Work is starting now."
          : "Order created and agent hired! Work is starting now. Fund escrow via POST /api/tasks/:id/deposit-gasless",
      },
      201
    );
  } catch (error) {
    console.error("Create task error:", error);
    return jsonError("Internal server error", 500);
  }
}

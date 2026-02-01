import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess, LIMITS } from "@/lib/auth";
import { checkRateLimit, getClientId, rateLimitError, RATE_LIMITS } from "@/lib/rate-limit";
import { processNewTask } from "@/lib/matching";
import { v4 as uuid } from "uuid";
import { eq, desc, asc, and, like, gte, lte, sql } from "drizzle-orm";

// GET /api/tasks - List open tasks with search/filter/sort
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

// POST /api/tasks - Create a new task
export async function POST(request: Request) {
  try {
    // Authenticate
    const agent = await authenticateAgent(request);
    if (!agent) {
      return jsonError("Unauthorized. Include 'Authorization: Bearer YOUR_API_KEY'", 401);
    }

    // Rate limit: 30 tasks per hour per agent
    const rl = checkRateLimit(`task:${agent.id}`, RATE_LIMITS.createTask);
    if (!rl.allowed) return rateLimitError(rl.remaining, rl.retryAfterMs);

    const body = await request.json();
    const {
      title,
      description,
      category,
      budgetUsdc,
      deadline,
      requiredSkills,
      // Auto-accept settings
      autoAccept,
      autoAcceptMinReputation,
      autoAcceptMaxBudget,
      autoAcceptPreferredSkills,
    } = body;

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

    const now = new Date().toISOString();
    const id = uuid();

    await db.insert(schema.tasks).values({
      id,
      title,
      description,
      category: category || "other",
      postedByType: "agent",
      postedById: agent.id,
      budgetUsdc,
      deadline: deadline || null,
      requiredSkills: JSON.stringify(requiredSkills || []),
      autoAccept: autoAccept ? 1 : 0,
      autoAcceptMinReputation: autoAcceptMinReputation || null,
      autoAcceptMaxBudget: autoAcceptMaxBudget || null,
      autoAcceptPreferredSkills: autoAcceptPreferredSkills ? JSON.stringify(autoAcceptPreferredSkills) : null,
      createdAt: now,
      updatedAt: now,
    });

    // 🔥 MATCHING ENGINE: find agents, auto-bid, auto-accept
    const matchingPromise = processNewTask(id).catch((err) =>
      console.error("Matching engine error:", err)
    );

    const matchResult = await Promise.race([
      matchingPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);

    const response: Record<string, unknown> = {
      task: {
        id,
        title,
        budgetUsdc,
        status: "open",
        autoAccept: !!autoAccept,
        url: `https://clawwork.io/tasks/${id}`,
      },
    };

    if (matchResult && typeof matchResult === "object") {
      const mr = matchResult as any;
      response.matching = {
        matchedAgents: mr.matchedAgents,
        autoBidsPlaced: mr.autoBidsPlaced,
        autoAccepted: mr.autoAccepted,
        webhooksSent: mr.webhooksSent,
        notificationsCreated: mr.notificationsCreated,
      };

      if (mr.autoAccepted) {
        response.task = {
          ...(response.task as object),
          status: "in_progress",
          assignedAgentId: mr.acceptedAgentId,
        };
        response.message = "Task created and auto-matched with an agent! Work is starting now.";
      }
    }

    return jsonSuccess(response, 201);
  } catch (error) {
    console.error("Create task error:", error);
    return jsonError("Internal server error", 500);
  }
}

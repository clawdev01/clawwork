import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
import { processNewTask } from "@/lib/matching";
import { v4 as uuid } from "uuid";
import { eq, desc } from "drizzle-orm";

// GET /api/tasks - List open tasks
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "open";
    const category = url.searchParams.get("category");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let results = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.status, status))
      .orderBy(desc(schema.tasks.createdAt))
      .limit(limit)
      .offset(offset);

    if (category) {
      results = results.filter((t) => t.category === category);
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
    if (!description || typeof description !== "string") {
      return jsonError("'description' is required", 400);
    }
    if (!budgetUsdc || typeof budgetUsdc !== "number" || budgetUsdc <= 0) {
      return jsonError("'budgetUsdc' must be a positive number", 400);
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
    // Runs async so task creation returns fast
    const matchingPromise = processNewTask(id).catch((err) =>
      console.error("Matching engine error:", err)
    );

    // Wait briefly for instant matches (auto-accept can happen in <100ms)
    const matchResult = await Promise.race([
      matchingPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 2000)), // 2s timeout
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

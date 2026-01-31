import { db, schema } from "@/db";
import { authenticateAgent, jsonError, jsonSuccess } from "@/lib/auth";
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
    const { title, description, category, budgetUsdc, deadline, requiredSkills } = body;

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
      createdAt: now,
      updatedAt: now,
    });

    return jsonSuccess(
      {
        task: {
          id,
          title,
          budgetUsdc,
          status: "open",
          url: `https://clawwork.io/tasks/${id}`,
        },
      },
      201
    );
  } catch (error) {
    console.error("Create task error:", error);
    return jsonError("Internal server error", 500);
  }
}

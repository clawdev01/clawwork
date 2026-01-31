import { db, schema } from "@/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";

// GET /api/tasks/:id — Get task details
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const task = await db.query.tasks.findFirst({
      where: eq(schema.tasks.id, id),
    });

    if (!task) {
      return jsonError("Task not found", 404);
    }

    return jsonSuccess({
      task: {
        ...task,
        requiredSkills: JSON.parse(task.requiredSkills || "[]"),
      },
    });
  } catch (error) {
    console.error("Get task error:", error);
    return jsonError("Internal server error", 500);
  }
}

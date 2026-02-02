import { db, schema } from "@/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { eq } from "drizzle-orm";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "clawwork-admin-2026";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
      return jsonError("Unauthorized", 401);
    }

    const body = await request.json();
    const { action, names, titles } = body;

    if (action === "deactivate" && names && Array.isArray(names)) {
      for (const name of names) {
        await db.update(schema.agents)
          .set({ status: "inactive", updatedAt: new Date().toISOString() })
          .where(eq(schema.agents.name, name));
      }
      return jsonSuccess({ message: `Deactivated ${names.length} agents`, names });
    }

    if (action === "delete-tasks" && titles && Array.isArray(titles)) {
      for (const title of titles) {
        await db.delete(schema.tasks).where(eq(schema.tasks.title, title));
      }
      return jsonSuccess({ message: `Deleted tasks`, titles });
    }

    return jsonError("Unknown action", 400);
  } catch (e: any) {
    return jsonError(e.message, 500);
  }
}

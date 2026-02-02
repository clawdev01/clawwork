export const dynamic = "force-dynamic";
import { db, schema } from "@/db";
import { jsonError, jsonSuccess } from "@/lib/auth";
import { inArray } from "drizzle-orm";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "clawwork-admin-2026";

// GET /api/admin/agent-keys?names=productshot-pro,threadweaver
// Returns agent API keys for local worker setup
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (authHeader !== `Bearer ${ADMIN_SECRET}`) {
      return jsonError("Unauthorized", 401);
    }

    const url = new URL(request.url);
    const namesParam = url.searchParams.get("names");
    if (!namesParam) return jsonError("'names' query param required", 400);

    const names = namesParam.split(",").map(n => n.trim());

    const agents = await db
      .select({ name: schema.agents.name, apiKey: schema.agents.apiKey })
      .from(schema.agents)
      .where(inArray(schema.agents.name, names));

    const keys: Record<string, string> = {};
    for (const a of agents) {
      keys[a.name] = a.apiKey;
    }

    return jsonSuccess({ keys });
  } catch (error) {
    return jsonError("Internal server error", 500);
  }
}

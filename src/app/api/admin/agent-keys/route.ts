export const dynamic = "force-dynamic";
import { db, schema } from "@/db";
import { jsonError, jsonSuccess, generateApiKey, hashApiKey } from "@/lib/auth";
import { eq, inArray } from "drizzle-orm";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "clawwork-admin-2026";

function checkAdmin(request: Request): boolean {
  return request.headers.get("Authorization") === `Bearer ${ADMIN_SECRET}`;
}

// POST /api/admin/agent-keys — Rotate keys for specified agents
// Body: { "names": ["productshot-pro", "threadweaver"] }
// Returns new plaintext keys (only time they're visible)
export async function POST(request: Request) {
  try {
    if (!checkAdmin(request)) return jsonError("Unauthorized", 401);

    const body = await request.json();
    const names: string[] = body.names;
    if (!names?.length) return jsonError("'names' array required", 400);

    const results: Record<string, string> = {};

    for (const name of names) {
      const agent = await db.query.agents.findFirst({
        where: eq(schema.agents.name, name),
      });
      if (!agent) { results[name] = "NOT_FOUND"; continue; }

      const { key, hash, prefix } = generateApiKey();
      await db.update(schema.agents)
        .set({ apiKey: hash, apiKeyPrefix: prefix })
        .where(eq(schema.agents.name, name));

      results[name] = key;
    }

    return jsonSuccess({ keys: results });
  } catch (error) {
    return jsonError("Internal server error", 500);
  }
}

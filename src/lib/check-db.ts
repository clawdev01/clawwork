import { db, schema } from "../db";

async function check() {
  const agents = await db.select().from(schema.agents);
  const tasks = await db.select().from(schema.tasks);
  const reviews = await db.select().from(schema.reviews);
  const portfolios = await db.select().from(schema.portfolios);
  console.log(`Agents: ${agents.length}, Tasks: ${tasks.length}, Reviews: ${reviews.length}, Portfolios: ${portfolios.length}`);
}
check();

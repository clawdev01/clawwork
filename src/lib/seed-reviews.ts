import { db, schema } from "../db";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";

async function seedReviews() {
  const agents = await db.select().from(schema.agents);
  const tasks = await db.select().from(schema.tasks);
  
  if (tasks.length === 0 || agents.length === 0) {
    console.log("No agents or tasks to reference");
    return;
  }

  const agentMap: Record<string, string> = {};
  for (const a of agents) agentMap[a.name] = a.id;

  const reviewData = [
    { agent: "deep-researcher", rating: 5, comment: "Incredible depth of research. The market analysis was thorough and actionable. Would hire again." },
    { agent: "deep-researcher", rating: 5, comment: "Fast turnaround, well-structured report with proper citations." },
    { agent: "deep-researcher", rating: 4, comment: "Good work overall, minor formatting issues but content was solid." },
    { agent: "code-forge", rating: 5, comment: "Clean code, comprehensive tests, great documentation. Exceeded expectations." },
    { agent: "code-forge", rating: 4, comment: "Solid implementation, delivered on time. One small bug found but fixed quickly." },
    { agent: "data-wizard", rating: 5, comment: "The visualizations were stunning and the insights were genuinely useful." },
    { agent: "data-wizard", rating: 4, comment: "Good analysis, would have liked more detail on methodology." },
    { agent: "content-crafter", rating: 5, comment: "SEO rankings improved within 2 weeks. Content was engaging and well-researched." },
    { agent: "content-crafter", rating: 4, comment: "Good writing quality, needed minor tone adjustments but responsive to feedback." },
    { agent: "auto-pilot", rating: 5, comment: "Set up our entire CI/CD pipeline in under an hour. Flawless." },
  ];

  const taskId = tasks[0].id;

  for (const review of reviewData) {
    const agentId = agentMap[review.agent];
    if (!agentId) continue;
    const reviewerId = agents[Math.floor(Math.random() * agents.length)].id;

    await db.insert(schema.reviews).values({
      id: uuid(),
      taskId,
      reviewerId,
      reviewerType: "agent",
      agentId,
      rating: review.rating,
      comment: review.comment,
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  console.log(`✅ Seeded ${reviewData.length} reviews`);
}

seedReviews().then(() => process.exit(0));

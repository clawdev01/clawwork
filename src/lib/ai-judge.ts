/**
 * ClawWork AI Judge — Dispute Resolution via Gemini
 *
 * Evaluates disputes by analyzing task requirements, deliverables,
 * portfolio quality standards, and evidence from both parties.
 * Returns a structured verdict with scores and recommendation.
 */

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// ============ TYPES ============

export interface JudgeVerdict {
  score: number; // 0-100 — how well the output matches the request
  completeness: number; // 0-100 — were all required inputs addressed?
  qualityVsPortfolio: number; // 0-100 — does output match portfolio quality level?
  recommendation: "full_refund" | "partial_refund" | "agent_paid" | "split";
  refundPercentage?: number; // for partial_refund/split
  reasoning: string; // detailed explanation
  concerns: string[]; // specific issues found
}

// ============ GEMINI API ============

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no content");
  }

  return text;
}

// ============ PROMPT CONSTRUCTION ============

function buildJudgePrompt(context: {
  task: typeof schema.tasks.$inferSelect;
  dispute: typeof schema.disputes.$inferSelect;
  portfolioExamples: Array<typeof schema.portfolios.$inferSelect>;
  agentProfile: typeof schema.agents.$inferSelect | null;
}): string {
  const { task, dispute, portfolioExamples, agentProfile } = context;

  // Parse JSON fields safely
  const taskInputs = safeParseJson(task.taskInputs);
  const deliverables = safeParseJson(task.deliverables);
  const requiredSkills = safeParseJson(task.requiredSkills);
  const buyerEvidence = safeParseJson(dispute.buyerEvidence);
  const agentEvidence = safeParseJson(dispute.agentEvidence);

  const portfolioSection = portfolioExamples.length > 0
    ? portfolioExamples.map((p, i) => `
  Example ${i + 1}: "${p.title}"
    Category: ${p.category || "N/A"}
    Description: ${p.description || "N/A"}
    Input Example: ${p.inputExample || "N/A"}
    Output Example: ${p.outputExample || "N/A"}`).join("\n")
    : "  No portfolio examples available.";

  return `You are an impartial AI judge evaluating a dispute on a freelance task marketplace. Your role is to analyze all available evidence and produce a fair, structured verdict.

## TASK DETAILS
- Title: ${task.title}
- Description: ${task.description}
- Category: ${task.category || "N/A"}
- Budget: $${task.budgetUsdc} USDC
- Required Skills: ${JSON.stringify(requiredSkills) || "None specified"}
- Deadline: ${task.deadline || "No deadline"}
- Additional Notes from Buyer: ${task.additionalNotes || "None"}

## TASK INPUTS (What the buyer specifically requested)
${taskInputs ? JSON.stringify(taskInputs, null, 2) : "No structured inputs provided."}

## AGENT PROFILE
- Name: ${agentProfile?.displayName || agentProfile?.name || "Unknown"}
- Bio: ${agentProfile?.bio || "N/A"}
- Skills: ${agentProfile?.skills || "N/A"}
- Reputation Score: ${agentProfile?.reputationScore ?? "N/A"}/100
- Tasks Completed: ${agentProfile?.tasksCompleted ?? 0}

## AGENT'S PORTFOLIO (Quality baseline — this is what the agent claims they can deliver)
${portfolioSection}

## DELIVERABLES (What the agent actually delivered)
${deliverables ? JSON.stringify(deliverables, null, 2) : "No deliverables submitted."}

## DISPUTE INFORMATION
- Reason: ${dispute.reason}
- Description: ${dispute.description || "No description provided"}
- Raised by: ${dispute.raisedByRole}
- Status: ${dispute.status}

## BUYER'S EVIDENCE
${buyerEvidence ? JSON.stringify(buyerEvidence, null, 2) : "No evidence submitted by buyer."}

## AGENT'S EVIDENCE
${agentEvidence ? JSON.stringify(agentEvidence, null, 2) : "No evidence submitted by agent."}

## EVALUATION CRITERIA

Please evaluate the following and provide scores from 0-100:

1. **Score** (0-100): Overall quality — how well does the delivered output match what was requested? Consider accuracy, relevance, and usefulness.

2. **Completeness** (0-100): Were ALL required task inputs and requirements addressed in the deliverables? A score of 100 means every requirement was fully met. A score of 0 means nothing was delivered.

3. **Quality vs Portfolio** (0-100): Compare the delivered work quality against the agent's portfolio examples. Does the output meet the quality standard the agent's portfolio suggests they can deliver? 100 means equal or better quality. 0 means drastically worse.

## RECOMMENDATION GUIDELINES

Based on your scores, recommend one of:
- **"full_refund"**: The agent clearly failed to deliver. Score < 20, or deliverables are missing/completely wrong, or evidence of scam/fraud. The buyer gets 100% back.
- **"agent_paid"**: The agent delivered satisfactory work. Score >= 70 and completeness >= 70. The dispute seems unjustified. Agent gets full payment.
- **"partial_refund"**: The agent delivered something but with significant gaps. Score 20-50 or completeness 30-60. Specify refundPercentage (% returned to buyer).
- **"split"**: Both parties have valid points. Score 50-70 or quality issues exist but work was substantially done. Specify refundPercentage (% returned to buyer, rest goes to agent).

When setting refundPercentage:
- For partial_refund: typically 40-80% refund to buyer
- For split: typically 30-60% refund to buyer

## IMPORTANT PRINCIPLES
- Be neutral — don't favor either party without evidence
- Absence of evidence from one party doesn't automatically mean the other is right
- If no deliverables exist and agent provides no evidence, lean toward full_refund
- If deliverables exist and buyer's complaints are vague with no evidence, lean toward agent_paid
- Consider the dispute reason when evaluating
- A "scam" reason requires strong evidence to confirm
- Quality is subjective — compare against portfolio, not perfection

## RESPONSE FORMAT

Return a JSON object with exactly this structure:
{
  "score": <number 0-100>,
  "completeness": <number 0-100>,
  "qualityVsPortfolio": <number 0-100>,
  "recommendation": "full_refund" | "partial_refund" | "agent_paid" | "split",
  "refundPercentage": <number 0-100 or null>,
  "reasoning": "<detailed explanation of your verdict, 2-4 paragraphs>",
  "concerns": ["<specific issue 1>", "<specific issue 2>", ...]
}`;
}

// ============ HELPERS ============

function safeParseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value; // Return raw string if not valid JSON
  }
}

function validateVerdict(raw: unknown): JudgeVerdict {
  const obj = raw as Record<string, unknown>;

  const score = clampScore(obj.score);
  const completeness = clampScore(obj.completeness);
  const qualityVsPortfolio = clampScore(obj.qualityVsPortfolio);

  const validRecs = ["full_refund", "partial_refund", "agent_paid", "split"] as const;
  const recommendation = validRecs.includes(obj.recommendation as typeof validRecs[number])
    ? (obj.recommendation as typeof validRecs[number])
    : deriveRecommendation(score, completeness);

  const refundPercentage = (recommendation === "partial_refund" || recommendation === "split")
    ? clampScore(obj.refundPercentage ?? 50)
    : undefined;

  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "AI judge could not provide detailed reasoning.";
  const concerns = Array.isArray(obj.concerns)
    ? obj.concerns.filter((c): c is string => typeof c === "string")
    : [];

  return { score, completeness, qualityVsPortfolio, recommendation, refundPercentage, reasoning, concerns };
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (isNaN(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function deriveRecommendation(score: number, completeness: number): JudgeVerdict["recommendation"] {
  const avg = (score + completeness) / 2;
  if (avg < 20) return "full_refund";
  if (avg < 45) return "partial_refund";
  if (avg < 65) return "split";
  return "agent_paid";
}

// ============ MAIN JUDGE FUNCTION ============

export async function judgeDispute(disputeId: string): Promise<JudgeVerdict> {
  // 1. Fetch dispute
  const dispute = await db.query.disputes.findFirst({
    where: eq(schema.disputes.id, disputeId),
  });
  if (!dispute) throw new Error(`Dispute not found: ${disputeId}`);

  // 2. Fetch task
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, dispute.taskId),
  });
  if (!task) throw new Error(`Task not found for dispute: ${disputeId}`);

  // 3. Fetch agent profile and portfolio
  let agentProfile: typeof schema.agents.$inferSelect | null = null;
  let portfolioExamples: Array<typeof schema.portfolios.$inferSelect> = [];

  if (task.assignedAgentId) {
    agentProfile = await db.query.agents.findFirst({
      where: eq(schema.agents.id, task.assignedAgentId),
    }) ?? null;

    if (agentProfile) {
      portfolioExamples = await db.query.portfolios.findMany({
        where: eq(schema.portfolios.agentId, agentProfile.id),
      });
    }
  }

  // 4. Build prompt and call Gemini
  const prompt = buildJudgePrompt({ task, dispute, portfolioExamples, agentProfile });
  const responseText = await callGemini(prompt);

  // 5. Parse and validate response
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${responseText.slice(0, 500)}`);
  }

  const verdict = validateVerdict(parsed);

  // 6. Store verdict on dispute
  const now = new Date().toISOString();
  await db.update(schema.disputes).set({
    aiVerdict: JSON.stringify(verdict),
    aiJudgedAt: now,
    updatedAt: now,
  }).where(eq(schema.disputes.id, disputeId));

  return verdict;
}

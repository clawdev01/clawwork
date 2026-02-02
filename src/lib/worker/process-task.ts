/**
 * Internal Task Worker
 * 
 * Processes tasks for our own agents. Called after task creation
 * when the hired agent is one of ours (has no external webhookUrl).
 */

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

interface TaskInputs {
  [key: string]: unknown;
}

// ============ HANDLERS ============

async function handleProductShotPro(taskId: string, inputs: TaskInputs, notes: string | null): Promise<string> {
  const photoUrl = (inputs.productImage || inputs.product_photo || inputs.productPhotoUrl || inputs.imageUrl || inputs.photo_url || "") as string;
  const platform = (inputs.ecommerce_platform || inputs.platform || "general") as string;
  const style = (inputs.writing_style || inputs.style || "Clean White Background") as string;

  if (!photoUrl) {
    return JSON.stringify({ error: "No product photo provided. Please include a product photo URL." });
  }

  // Download input image
  const tmpDir = `/tmp/worker-${crypto.randomUUID()}`;
  fs.mkdirSync(tmpDir, { recursive: true });
  const inputPath = path.join(tmpDir, "input.png");
  const outputPath = path.join(tmpDir, "output.png");

  try {
    const res = await fetch(photoUrl);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    fs.writeFileSync(inputPath, Buffer.from(await res.arrayBuffer()));
  } catch (e: any) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return JSON.stringify({ error: `Could not download image: ${e.message}` });
  }

  // Build prompt
  const platformPrompts: Record<string, string> = {
    amazon: "Pure white background, product fills 85% of frame, professional lighting. Amazon marketplace compliant.",
    shopify: "Clean white background with subtle shadow, modern e-commerce style.",
    etsy: "Warm, artisanal feel with seamless neutral backdrop, soft directional lighting. Etsy marketplace style.",
    "instagram shop": "Lifestyle-inspired with clean backdrop, Instagram-ready square crop.",
    "general e-commerce": "Professional product photography with clean white background and studio lighting.",
  };

  const basePrompt = platformPrompts[platform.toLowerCase()] || platformPrompts["general e-commerce"];
  const fullPrompt = `Remove the background from this product photo and replace with a professional product photography setup. ${basePrompt} Style: ${style}. Keep the product EXACTLY as it is — same shape, color, details. Only change the background and lighting.`;

  try {
    const scriptPath = "/usr/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py";
    const cmd = `GEMINI_API_KEY="${GEMINI_API_KEY}" uv run ${scriptPath} --prompt "${fullPrompt.replace(/"/g, '\\"')}" -i "${inputPath}" --filename "${outputPath}" --resolution 1K 2>&1`;
    execSync(cmd, { timeout: 120000 });

    const outputData = fs.readFileSync(outputPath);
    const base64 = outputData.toString("base64");

    fs.rmSync(tmpDir, { recursive: true, force: true });

    return JSON.stringify({
      text: `Professional ${platform} product shot created with ${style} style.`,
      images: [`data:image/png;base64,${base64}`],
    });
  } catch (e: any) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return JSON.stringify({ error: `Image processing failed: ${e.message?.slice(0, 200)}` });
  }
}

async function handleTextAgent(taskId: string, inputs: TaskInputs, notes: string | null, systemPrompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return JSON.stringify({ error: "AI processing unavailable" });
  }

  const inputText = Object.values(inputs).filter(v => typeof v === "string").join("\n\n");
  const fullPrompt = `${systemPrompt}\n\n--- CLIENT INPUT ---\n${inputText}${notes ? `\n\nAdditional notes: ${notes}` : ""}`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    });

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("No response from AI");
    return JSON.stringify({ text });
  } catch (e: any) {
    return JSON.stringify({ error: `AI processing failed: ${e.message}` });
  }
}

// Agent-specific system prompts
const AGENT_PROMPTS: Record<string, string> = {
  threadweaver: "You are ThreadWeaver, an expert at converting content into viral Twitter/X threads. Create a thread with a killer hook, curiosity gaps, perfect pacing, and engagement triggers. Format each tweet on a new line, numbered. Keep each tweet under 280 characters. End with a strong call-to-action.",
  resumesniper: "You are ResumeSniper, an expert resume engineer. Take the provided resume and job description, then tailor the resume with ATS-optimized keywords, quantified achievements, and role-specific language. Output a complete, polished resume ready to submit.",
  listingglow: "You are ListingGlow, an expert real estate copywriter. Transform the provided property details into a compelling listing description with emotional hooks, lifestyle painting, and SEO optimization. MLS-ready format.",
  "brandvoice-rewriter": "You are BrandVoice Rewriter. Rewrite the provided content to match the specified brand voice and tone. Maintain the original message while making it sound authentic to the brand.",
  competitorradar: "You are CompetitorRadar. Analyze the provided competitors and market, then deliver a structured competitive intelligence report with strengths, weaknesses, opportunities, and actionable insights.",
  roastmylanding: "You are RoastMyLanding. Analyze the provided landing page URL/description and give a brutally honest but constructive review covering: headline, value prop, CTA, trust signals, design, copy, and conversion potential. Score each area 1-10.",
};

// ============ MAIN PROCESSOR ============

export async function processTask(taskId: string, agentName: string): Promise<void> {
  console.log(`[Worker] Processing task ${taskId} for agent ${agentName}`);

  // Get task details
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });

  if (!task) {
    console.error(`[Worker] Task ${taskId} not found`);
    return;
  }

  if (task.status !== "in_progress") {
    console.log(`[Worker] Task ${taskId} is ${task.status}, skipping`);
    return;
  }

  const inputs: TaskInputs = task.taskInputs ? JSON.parse(task.taskInputs) : {};
  const notes = task.additionalNotes;

  let deliverables: string;

  try {
    if (agentName === "productshot-pro") {
      deliverables = await handleProductShotPro(taskId, inputs, notes);
    } else if (AGENT_PROMPTS[agentName]) {
      deliverables = await handleTextAgent(taskId, inputs, notes, AGENT_PROMPTS[agentName]);
    } else {
      deliverables = JSON.stringify({ error: `No handler for agent: ${agentName}. Task logged for manual processing.` });
    }
  } catch (e: any) {
    console.error(`[Worker] Handler error for ${agentName}:`, e);
    deliverables = JSON.stringify({ error: `Processing failed: ${e.message}` });
  }

  // Update task with deliverables and move to review
  try {
    await db.update(schema.tasks).set({
      deliverables,
      status: "review",
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.tasks.id, taskId));

    console.log(`[Worker] Task ${taskId} delivered, status → review`);
  } catch (e: any) {
    console.error(`[Worker] Failed to update task ${taskId}:`, e);
  }
}

// List of our internal agent names (agents we run ourselves)
export const INTERNAL_AGENTS = new Set([
  "productshot-pro",
  "threadweaver",
  "resumesniper",
  "listingglow",
  "brandvoice-rewriter",
  "competitorradar",
  "roastmylanding",
  "codereviewer",
  "screenshottocode",
  "quicksumm",
  "pixelclaw",
  "deepdig",
  "codereview",
]);

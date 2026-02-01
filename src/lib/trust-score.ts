/**
 * ClawWork Trust Score System
 *
 * Per-wallet trust scores (0-100) based on marketplace history.
 * Separate scores for buyers and agents.
 * New accounts start at 50 (neutral).
 * Score affects escrow requirements, dispute resolution weight, and visibility.
 */

import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

// ============ TYPES ============

export interface TrustScoreData {
  walletAddress: string;
  role: "buyer" | "agent";
  score: number;
  tasksCompleted: number;
  tasksDisputed: number;
  disputesWon: number;
  disputesLost: number;
  totalVolumeUsdc: number;
  flags: string[];
  isBanned: boolean;
  bannedReason?: string;
}

export interface TrustScoreUpdate {
  tasksCompleted?: number;  // increment
  tasksDisputed?: number;   // increment
  disputesWon?: number;     // increment
  disputesLost?: number;    // increment
  volumeUsdc?: number;      // increment
}

// ============ CONSTANTS ============

const DEFAULT_SCORE = 50;
const DISPUTE_RATE_THRESHOLD = 0.25; // 25%
const HIGH_TRUST_THRESHOLD = 60;
const MAX_TASK_BUDGET_NEW_ACCOUNT = 50; // $50 limit for new accounts

// Score weights
const WEIGHTS = {
  taskCompletion: 2,     // +2 per completed task
  disputeWin: 3,         // +3 per dispute won
  disputeLoss: -5,       // -5 per dispute lost
  volumeBonus: 0.01,     // +0.01 per $1 volume (max +10)
  disputeRatePenalty: -15, // -15 if dispute rate > 25%
  minScore: 0,
  maxScore: 100,
};

// ============ GET OR CREATE TRUST SCORE ============

export async function getOrCreateTrustScore(
  walletAddress: string,
  role: "buyer" | "agent"
): Promise<TrustScoreData> {
  const normalized = walletAddress.toLowerCase();
  const now = new Date().toISOString();

  let record = await db.query.trustScores.findFirst({
    where: and(
      eq(schema.trustScores.walletAddress, normalized),
      eq(schema.trustScores.role, role)
    ),
  });

  if (!record) {
    const id = uuid();
    await db.insert(schema.trustScores).values({
      id,
      walletAddress: normalized,
      role,
      score: DEFAULT_SCORE,
      tasksCompleted: 0,
      tasksDisputed: 0,
      disputesWon: 0,
      disputesLost: 0,
      totalVolumeUsdc: 0,
      flags: "[]",
      bannedAt: null,
      bannedReason: null,
      lastDisputeLostAt: null,
      updatedAt: now,
    });

    record = await db.query.trustScores.findFirst({
      where: eq(schema.trustScores.id, id),
    });
  }

  const flags: string[] = record!.flags ? JSON.parse(record!.flags as string) : [];

  return {
    walletAddress: record!.walletAddress,
    role: record!.role as "buyer" | "agent",
    score: record!.score || DEFAULT_SCORE,
    tasksCompleted: record!.tasksCompleted || 0,
    tasksDisputed: record!.tasksDisputed || 0,
    disputesWon: record!.disputesWon || 0,
    disputesLost: record!.disputesLost || 0,
    totalVolumeUsdc: record!.totalVolumeUsdc || 0,
    flags,
    isBanned: !!record!.bannedAt,
    bannedReason: record!.bannedReason || undefined,
  };
}

// ============ UPDATE TRUST SCORE ============

export async function updateTrustScore(
  walletAddress: string,
  role: "buyer" | "agent",
  update: TrustScoreUpdate
): Promise<TrustScoreData> {
  const current = await getOrCreateTrustScore(walletAddress, role);
  const normalized = walletAddress.toLowerCase();
  const now = new Date().toISOString();

  // Apply increments
  const newData = {
    tasksCompleted: current.tasksCompleted + (update.tasksCompleted || 0),
    tasksDisputed: current.tasksDisputed + (update.tasksDisputed || 0),
    disputesWon: current.disputesWon + (update.disputesWon || 0),
    disputesLost: current.disputesLost + (update.disputesLost || 0),
    totalVolumeUsdc: current.totalVolumeUsdc + (update.volumeUsdc || 0),
  };

  // Recalculate score
  const score = calculateScore(newData);

  // Check for flags
  const flags: string[] = [];
  const totalTasks = newData.tasksCompleted + newData.tasksDisputed;
  if (totalTasks > 0 && newData.tasksDisputed / totalTasks > DISPUTE_RATE_THRESHOLD) {
    flags.push("high_dispute_rate");
  }
  if (newData.disputesLost >= 3) {
    flags.push("serial_dispute_loser");
  }

  const updatePayload: Record<string, unknown> = {
    score,
    tasksCompleted: newData.tasksCompleted,
    tasksDisputed: newData.tasksDisputed,
    disputesWon: newData.disputesWon,
    disputesLost: newData.disputesLost,
    totalVolumeUsdc: newData.totalVolumeUsdc,
    flags: JSON.stringify(flags),
    updatedAt: now,
  };

  // Track when disputes are lost for cooldown
  if (update.disputesLost && update.disputesLost > 0) {
    updatePayload.lastDisputeLostAt = now;
  }

  await db.update(schema.trustScores).set(updatePayload).where(
    and(
      eq(schema.trustScores.walletAddress, normalized),
      eq(schema.trustScores.role, role)
    )
  );

  return {
    ...current,
    ...newData,
    score,
    flags,
  };
}

// ============ CALCULATE SCORE ============

function calculateScore(data: {
  tasksCompleted: number;
  tasksDisputed: number;
  disputesWon: number;
  disputesLost: number;
  totalVolumeUsdc: number;
}): number {
  let score = DEFAULT_SCORE;

  // Task completion bonus
  score += data.tasksCompleted * WEIGHTS.taskCompletion;

  // Dispute outcomes
  score += data.disputesWon * WEIGHTS.disputeWin;
  score += data.disputesLost * WEIGHTS.disputeLoss;

  // Volume bonus (capped at +10)
  score += Math.min(10, data.totalVolumeUsdc * WEIGHTS.volumeBonus);

  // Dispute rate penalty
  const totalTasks = data.tasksCompleted + data.tasksDisputed;
  if (totalTasks >= 4 && data.tasksDisputed / totalTasks > DISPUTE_RATE_THRESHOLD) {
    score += WEIGHTS.disputeRatePenalty;
  }

  return Math.max(WEIGHTS.minScore, Math.min(WEIGHTS.maxScore, Math.round(score)));
}

// ============ BAN / UNBAN ============

export async function banWallet(
  walletAddress: string,
  role: "buyer" | "agent",
  reason: string
): Promise<void> {
  const normalized = walletAddress.toLowerCase();
  const now = new Date().toISOString();

  await getOrCreateTrustScore(normalized, role);

  await db.update(schema.trustScores).set({
    bannedAt: now,
    bannedReason: reason,
    score: 0,
    updatedAt: now,
  }).where(
    and(
      eq(schema.trustScores.walletAddress, normalized),
      eq(schema.trustScores.role, role)
    )
  );
}

export async function unbanWallet(
  walletAddress: string,
  role: "buyer" | "agent"
): Promise<void> {
  const normalized = walletAddress.toLowerCase();
  const now = new Date().toISOString();

  await db.update(schema.trustScores).set({
    bannedAt: null,
    bannedReason: null,
    score: DEFAULT_SCORE,
    updatedAt: now,
  }).where(
    and(
      eq(schema.trustScores.walletAddress, normalized),
      eq(schema.trustScores.role, role)
    )
  );
}

// ============ CHECK CONSTRAINTS ============

export async function checkVolumeLimit(
  walletAddress: string,
  role: "buyer" | "agent",
  taskBudget: number
): Promise<{ allowed: boolean; reason?: string }> {
  const trustData = await getOrCreateTrustScore(walletAddress, role);

  if (trustData.isBanned) {
    return { allowed: false, reason: `Wallet is banned: ${trustData.bannedReason}` };
  }

  if (trustData.score < HIGH_TRUST_THRESHOLD && taskBudget > MAX_TASK_BUDGET_NEW_ACCOUNT) {
    return {
      allowed: false,
      reason: `New accounts (trust score < ${HIGH_TRUST_THRESHOLD}) are limited to $${MAX_TASK_BUDGET_NEW_ACCOUNT}/task. Your score: ${trustData.score}`,
    };
  }

  return { allowed: true };
}

export async function isWalletBanned(
  walletAddress: string,
): Promise<boolean> {
  const normalized = walletAddress.toLowerCase();

  const records = await db.query.trustScores.findMany({
    where: eq(schema.trustScores.walletAddress, normalized),
  });

  return records.some((r) => !!r.bannedAt);
}

// ============ GET TRUST SCORE SUMMARY ============

export async function getTrustScoreSummary(walletAddress: string): Promise<{
  buyer: TrustScoreData | null;
  agent: TrustScoreData | null;
}> {
  const normalized = walletAddress.toLowerCase();

  const records = await db.query.trustScores.findMany({
    where: eq(schema.trustScores.walletAddress, normalized),
  });

  let buyer: TrustScoreData | null = null;
  let agent: TrustScoreData | null = null;

  for (const record of records) {
    const data: TrustScoreData = {
      walletAddress: record.walletAddress,
      role: record.role as "buyer" | "agent",
      score: record.score || DEFAULT_SCORE,
      tasksCompleted: record.tasksCompleted || 0,
      tasksDisputed: record.tasksDisputed || 0,
      disputesWon: record.disputesWon || 0,
      disputesLost: record.disputesLost || 0,
      totalVolumeUsdc: record.totalVolumeUsdc || 0,
      flags: record.flags ? JSON.parse(record.flags as string) : [],
      isBanned: !!record.bannedAt,
      bannedReason: record.bannedReason || undefined,
    };

    if (record.role === "buyer") buyer = data;
    if (record.role === "agent") agent = data;
  }

  return { buyer, agent };
}

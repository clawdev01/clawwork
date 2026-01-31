/**
 * ClawWork Anti-Fraud System
 *
 * Prevents reputation manipulation, wash trading, and sybil attacks.
 *
 * Layers:
 * 1. Economic — 8% non-refundable fee makes gaming expensive
 * 2. Wallet Clustering — detect agents sharing wallets or circular payments
 * 3. Weighted Reviews — reviewer reputation affects review weight
 * 4. Unique Reviewer Limits — same poster can't inflate one agent
 * 5. Behavioral Anomaly Detection — flag suspicious patterns
 */

import { db, schema } from "@/db";
import { eq, and, sql, desc } from "drizzle-orm";

// ============ TYPES ============

export interface FraudCheck {
  passed: boolean;
  flags: FraudFlag[];
  riskScore: number; // 0-100 (0 = clean, 100 = definitely fraud)
}

export interface FraudFlag {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  evidence?: Record<string, unknown>;
}

// ============ REVIEW FRAUD CHECKS ============

/**
 * Run all fraud checks before allowing a review to affect reputation
 * Called from the review endpoint
 */
export async function checkReviewFraud(
  reviewerId: string,
  agentId: string,
  taskId: string
): Promise<FraudCheck> {
  const flags: FraudFlag[] = [];

  // Check 1: Self-review prevention (same entity reviewing themselves)
  if (reviewerId === agentId) {
    flags.push({
      type: "self_review",
      severity: "critical",
      message: "Cannot review yourself",
    });
  }

  // Check 2: Wallet clustering — do reviewer and agent share a wallet?
  const walletCluster = await checkWalletClustering(reviewerId, agentId);
  if (walletCluster) {
    flags.push(walletCluster);
  }

  // Check 3: Unique reviewer limit — how many times has this poster reviewed this agent?
  const reviewerLimit = await checkUniqueReviewerLimit(reviewerId, agentId);
  if (reviewerLimit) {
    flags.push(reviewerLimit);
  }

  // Check 4: Review velocity — is this agent getting too many reviews too fast?
  const velocity = await checkReviewVelocity(agentId);
  if (velocity) {
    flags.push(velocity);
  }

  // Check 5: Circular payment detection — does money flow back to reviewer?
  const circular = await checkCircularPayments(reviewerId, agentId);
  if (circular) {
    flags.push(circular);
  }

  // Calculate risk score
  const riskScore = calculateRiskScore(flags);

  return {
    passed: riskScore < 70, // block if risk >= 70
    flags,
    riskScore,
  };
}

// ============ WALLET CLUSTERING ============

/**
 * Detect if two agents share the same wallet address
 * This is the #1 indicator of sybil accounts
 */
async function checkWalletClustering(
  agentAId: string,
  agentBId: string
): Promise<FraudFlag | null> {
  try {
    const agentA = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentAId) });
    const agentB = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentBId) });

    if (!agentA || !agentB) return null;

    // Same wallet address
    if (
      agentA.walletAddress &&
      agentB.walletAddress &&
      agentA.walletAddress.toLowerCase() === agentB.walletAddress.toLowerCase()
    ) {
      return {
        type: "shared_wallet",
        severity: "critical",
        message: "Reviewer and agent share the same wallet address",
        evidence: { wallet: agentA.walletAddress },
      };
    }

    // Check if any OTHER agents share wallets with either party
    if (agentA.walletAddress) {
      const sameWalletAgents = await db.query.agents.findMany({
        where: eq(schema.agents.walletAddress, agentA.walletAddress),
      });
      if (sameWalletAgents.length > 1) {
        const otherNames = sameWalletAgents
          .filter((a) => a.id !== agentAId)
          .map((a) => a.name);
        // Check if agentB is in the cluster
        if (sameWalletAgents.some((a) => a.id === agentBId)) {
          return {
            type: "wallet_cluster",
            severity: "critical",
            message: "Agents are part of the same wallet cluster",
            evidence: { clusterSize: sameWalletAgents.length, agents: otherNames },
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Wallet clustering check error:", error);
    return null;
  }
}

/**
 * Scan all agents for wallet clusters (admin/periodic check)
 * Returns groups of agents sharing wallets
 */
export async function detectWalletClusters(): Promise<
  Array<{ wallet: string; agents: Array<{ id: string; name: string; reputation: number }> }>
> {
  try {
    const allAgents = await db.query.agents.findMany();
    const walletMap = new Map<string, typeof allAgents>();

    for (const agent of allAgents) {
      if (!agent.walletAddress) continue;
      const wallet = agent.walletAddress.toLowerCase();
      if (!walletMap.has(wallet)) walletMap.set(wallet, []);
      walletMap.get(wallet)!.push(agent);
    }

    return Array.from(walletMap.entries())
      .filter(([_, agents]) => agents.length > 1)
      .map(([wallet, agents]) => ({
        wallet,
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          reputation: a.reputationScore || 0,
        })),
      }));
  } catch (error) {
    console.error("Wallet cluster detection error:", error);
    return [];
  }
}

// ============ UNIQUE REVIEWER LIMITS ============

/**
 * Check how many times this reviewer has reviewed this specific agent
 * Limit: 3 reviews max from the same poster to the same agent
 */
async function checkUniqueReviewerLimit(
  reviewerId: string,
  agentId: string
): Promise<FraudFlag | null> {
  try {
    const existingReviews = await db.query.reviews.findMany({
      where: and(
        eq(schema.reviews.reviewerId, reviewerId),
        eq(schema.reviews.agentId, agentId)
      ),
    });

    if (existingReviews.length >= 3) {
      return {
        type: "reviewer_limit_exceeded",
        severity: "high",
        message: `This poster has already reviewed this agent ${existingReviews.length} times (limit: 3)`,
        evidence: { reviewCount: existingReviews.length, limit: 3 },
      };
    }

    if (existingReviews.length >= 2) {
      return {
        type: "reviewer_concentration",
        severity: "medium",
        message: `This poster has reviewed this agent ${existingReviews.length} times — approaching limit`,
        evidence: { reviewCount: existingReviews.length },
      };
    }

    return null;
  } catch (error) {
    console.error("Reviewer limit check error:", error);
    return null;
  }
}

// ============ REVIEW VELOCITY ============

/**
 * Check if an agent is receiving reviews at a suspicious rate
 * Flag: more than 5 reviews in the last 24 hours
 */
async function checkReviewVelocity(agentId: string): Promise<FraudFlag | null> {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const recentReviews = await db.query.reviews.findMany({
      where: eq(schema.reviews.agentId, agentId),
    });

    const last24h = recentReviews.filter((r) => r.createdAt > oneDayAgo);

    if (last24h.length >= 10) {
      return {
        type: "review_velocity_extreme",
        severity: "high",
        message: `Agent received ${last24h.length} reviews in the last 24 hours`,
        evidence: { reviewsLast24h: last24h.length },
      };
    }

    if (last24h.length >= 5) {
      return {
        type: "review_velocity_high",
        severity: "medium",
        message: `Agent received ${last24h.length} reviews in the last 24 hours — unusual velocity`,
        evidence: { reviewsLast24h: last24h.length },
      };
    }

    return null;
  } catch (error) {
    console.error("Review velocity check error:", error);
    return null;
  }
}

// ============ CIRCULAR PAYMENT DETECTION ============

/**
 * Check if payments between two agents form a circular pattern
 * Look at transaction history: if A pays B and B pays A, that's suspicious
 */
async function checkCircularPayments(
  agentAId: string,
  agentBId: string
): Promise<FraudFlag | null> {
  try {
    const agentA = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentAId) });
    const agentB = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentBId) });

    if (!agentA?.walletAddress || !agentB?.walletAddress) return null;

    // Find tasks where A posted and B completed
    const aToBTasks = await db.query.tasks.findMany({
      where: and(
        eq(schema.tasks.postedById, agentAId),
        eq(schema.tasks.assignedAgentId, agentBId),
        eq(schema.tasks.status, "completed")
      ),
    });

    // Find tasks where B posted and A completed
    const bToATasks = await db.query.tasks.findMany({
      where: and(
        eq(schema.tasks.postedById, agentBId),
        eq(schema.tasks.assignedAgentId, agentAId),
        eq(schema.tasks.status, "completed")
      ),
    });

    if (aToBTasks.length > 0 && bToATasks.length > 0) {
      const aToBTotal = aToBTasks.reduce((sum, t) => sum + t.budgetUsdc, 0);
      const bToATotal = bToATasks.reduce((sum, t) => sum + t.budgetUsdc, 0);

      // If the amounts are suspiciously similar (within 20%), flag it
      const ratio = Math.min(aToBTotal, bToATotal) / Math.max(aToBTotal, bToATotal);

      if (ratio > 0.8) {
        return {
          type: "circular_payments",
          severity: "critical",
          message: "Circular payment pattern detected — agents are trading tasks and payments back and forth",
          evidence: {
            aToBTasks: aToBTasks.length,
            bToATasks: bToATasks.length,
            aToBTotal,
            bToATotal,
            similarityRatio: Math.round(ratio * 100) + "%",
          },
        };
      }

      if (aToBTasks.length >= 2 && bToATasks.length >= 2) {
        return {
          type: "mutual_trading",
          severity: "high",
          message: "Agents are frequently trading tasks with each other",
          evidence: {
            aToBTasks: aToBTasks.length,
            bToATasks: bToATasks.length,
          },
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Circular payment check error:", error);
    return null;
  }
}

// ============ WEIGHTED REPUTATION ============

/**
 * Calculate weighted reputation score for an agent
 * Reviews from higher-reputation reviewers count more
 * Reviews from higher-value tasks count more
 * Recent reviews count more than old ones
 */
export async function calculateWeightedReputation(agentId: string): Promise<{
  score: number;
  totalReviews: number;
  weightedAverage: number;
  flaggedReviews: number;
}> {
  try {
    const reviews = await db.query.reviews.findMany({
      where: eq(schema.reviews.agentId, agentId),
    });

    if (reviews.length === 0) {
      return { score: 0, totalReviews: 0, weightedAverage: 0, flaggedReviews: 0 };
    }

    let totalWeight = 0;
    let weightedSum = 0;
    let flaggedReviews = 0;

    for (const review of reviews) {
      // Get reviewer info
      const reviewer = await db.query.agents.findFirst({
        where: eq(schema.agents.id, review.reviewerId),
      });

      // Get task info for budget weighting
      const task = await db.query.tasks.findFirst({
        where: eq(schema.tasks.id, review.taskId),
      });

      // Base weight = 1.0
      let weight = 1.0;

      // Reviewer reputation weight (0.5x - 2.0x)
      if (reviewer) {
        const reviewerRep = reviewer.reputationScore || 0;
        weight *= 0.5 + (reviewerRep / 100) * 1.5; // 0 rep = 0.5x, 100 rep = 2.0x
      } else {
        // External/human reviewer — neutral weight
        weight *= 1.0;
      }

      // Task value weight (higher value tasks = more trustworthy reviews)
      if (task) {
        if (task.budgetUsdc >= 50) weight *= 1.5;
        else if (task.budgetUsdc >= 20) weight *= 1.2;
        else if (task.budgetUsdc < 5) weight *= 0.7;
      }

      // Time decay (reviews older than 90 days get reduced weight)
      const ageMs = Date.now() - new Date(review.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > 180) weight *= 0.5;
      else if (ageDays > 90) weight *= 0.75;

      // Run fraud check on this specific review
      const fraudCheck = await quickReviewFraudCheck(review.reviewerId, agentId);
      if (fraudCheck.riskScore >= 70) {
        weight *= 0.1; // Nearly zero out fraudulent reviews
        flaggedReviews++;
      } else if (fraudCheck.riskScore >= 40) {
        weight *= 0.5; // Reduce suspicious reviews
      }

      totalWeight += weight;
      weightedSum += review.rating * weight;
    }

    const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : 0;
    // Convert 1-5 star average to 0-100 score
    const score = Math.round(((weightedAverage - 1) / 4) * 100);

    return {
      score: Math.max(0, Math.min(100, score)),
      totalReviews: reviews.length,
      weightedAverage: Math.round(weightedAverage * 100) / 100,
      flaggedReviews,
    };
  } catch (error) {
    console.error("Weighted reputation error:", error);
    return { score: 0, totalReviews: 0, weightedAverage: 0, flaggedReviews: 0 };
  }
}

/**
 * Quick fraud check for reputation calculation (lighter than full check)
 */
async function quickReviewFraudCheck(
  reviewerId: string,
  agentId: string
): Promise<{ riskScore: number }> {
  let risk = 0;

  // Shared wallet = instant high risk
  const agentA = await db.query.agents.findFirst({ where: eq(schema.agents.id, reviewerId) });
  const agentB = await db.query.agents.findFirst({ where: eq(schema.agents.id, agentId) });

  if (
    agentA?.walletAddress &&
    agentB?.walletAddress &&
    agentA.walletAddress.toLowerCase() === agentB.walletAddress.toLowerCase()
  ) {
    risk += 80;
  }

  // Check reviewer limit
  const existingReviews = await db.query.reviews.findMany({
    where: and(eq(schema.reviews.reviewerId, reviewerId), eq(schema.reviews.agentId, agentId)),
  });
  if (existingReviews.length >= 3) risk += 40;
  else if (existingReviews.length >= 2) risk += 15;

  return { riskScore: Math.min(100, risk) };
}

// ============ RECALCULATE ALL REPUTATIONS ============

/**
 * Recalculate reputation for all agents using weighted system
 * Should run periodically (e.g., every hour or after flagged events)
 */
export async function recalculateAllReputations(): Promise<{
  updated: number;
  flagged: number;
}> {
  let updated = 0;
  let flagged = 0;

  try {
    const allAgents = await db.query.agents.findMany();

    for (const agent of allAgents) {
      const rep = await calculateWeightedReputation(agent.id);

      await db.update(schema.agents).set({
        reputationScore: rep.score,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.agents.id, agent.id));

      updated++;
      if (rep.flaggedReviews > 0) flagged++;
    }
  } catch (error) {
    console.error("Reputation recalculation error:", error);
  }

  return { updated, flagged };
}

// ============ RISK SCORE CALCULATION ============

function calculateRiskScore(flags: FraudFlag[]): number {
  let score = 0;

  for (const flag of flags) {
    switch (flag.severity) {
      case "critical":
        score += 40;
        break;
      case "high":
        score += 25;
        break;
      case "medium":
        score += 10;
        break;
      case "low":
        score += 5;
        break;
    }
  }

  return Math.min(100, score);
}

// ============ ADMIN: FRAUD REPORT ============

/**
 * Generate a fraud report for the platform
 */
export async function generateFraudReport(): Promise<{
  walletClusters: Awaited<ReturnType<typeof detectWalletClusters>>;
  suspiciousAgents: Array<{ id: string; name: string; flags: string[] }>;
  totalFlaggedReviews: number;
}> {
  const walletClusters = await detectWalletClusters();

  const allAgents = await db.query.agents.findMany();
  const suspiciousAgents: Array<{ id: string; name: string; flags: string[] }> = [];
  let totalFlaggedReviews = 0;

  for (const agent of allAgents) {
    const rep = await calculateWeightedReputation(agent.id);
    totalFlaggedReviews += rep.flaggedReviews;

    const flags: string[] = [];

    // Check if agent is in a wallet cluster
    if (agent.walletAddress) {
      const inCluster = walletClusters.some((c) =>
        c.agents.some((a) => a.id === agent.id)
      );
      if (inCluster) flags.push("wallet_cluster");
    }

    if (rep.flaggedReviews > 0) flags.push(`${rep.flaggedReviews}_flagged_reviews`);

    // Check for suspiciously perfect ratings
    const reviews = await db.query.reviews.findMany({
      where: eq(schema.reviews.agentId, agent.id),
    });
    if (reviews.length >= 5) {
      const avgRating = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      if (avgRating >= 4.9) flags.push("suspiciously_perfect_rating");
    }

    if (flags.length > 0) {
      suspiciousAgents.push({ id: agent.id, name: agent.name, flags });
    }
  }

  return { walletClusters, suspiciousAgents, totalFlaggedReviews };
}

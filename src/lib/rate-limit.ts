/**
 * ClawWork Rate Limiter
 * 
 * Simple in-memory sliding window rate limiter.
 * No external dependencies — works with SQLite MVP.
 * 
 * Limits:
 * - Registration: 5/hour per IP
 * - Task creation: 30/hour per API key
 * - Bid submission: 60/hour per API key
 * - General API: 120/min per IP
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 3600000); // keep last hour
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  windowMs: number;   // time window in ms
  maxRequests: number; // max requests in window
}

export const RATE_LIMITS = {
  register: { windowMs: 3600000, maxRequests: 5 },      // 5/hour
  createTask: { windowMs: 3600000, maxRequests: 30 },    // 30/hour
  submitBid: { windowMs: 3600000, maxRequests: 60 },     // 60/hour
  general: { windowMs: 60000, maxRequests: 120 },        // 120/min
  admin: { windowMs: 60000, maxRequests: 10 },           // 10/min
} as const;

/**
 * Check rate limit. Returns { allowed, remaining, retryAfterMs }
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.maxRequests) {
    // Find when the oldest request in window will expire
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
  };
}

/**
 * Get the client identifier from a request (IP address or API key prefix)
 */
export function getClientId(request: Request): string {
  // Try X-Forwarded-For first (behind proxy/load balancer)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  // Try X-Real-IP
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  // Fallback
  return "unknown";
}

/**
 * Create rate limit error response with proper headers
 */
export function rateLimitError(remaining: number, retryAfterMs?: number) {
  const retryAfterSec = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 60;
  return new Response(
    JSON.stringify({
      success: false,
      error: "Rate limit exceeded. Please try again later.",
      retryAfterSeconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfterSec.toString(),
        "X-RateLimit-Remaining": remaining.toString(),
      },
    }
  );
}

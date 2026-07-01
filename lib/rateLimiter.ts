/**
 * lib/rateLimiter.ts
 *
 * Simple in-memory IP-based rate limiter.
 * Keyed by IP address. Resets after `windowMs` milliseconds.
 * Works across requests in the same long-lived serverless instance.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodically prune expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

/**
 * @param ip       - The client IP address
 * @param limit    - Max requests allowed in the window (default: 10)
 * @param windowMs - Window duration in ms (default: 60 seconds)
 * @returns `true` if the request is allowed, `false` if rate limited
 */
export function rateLimit(ip: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

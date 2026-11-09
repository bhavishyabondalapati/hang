/**
 * Small in-memory sliding-window limiter for mutations.
 * Per serverless instance only: it blunts accidental loops and casual abuse.
 * For strict global limits, swap the Map for Redis/Upstash behind the same API.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit = 30, windowMs = 60_000, now = Date.now()): { ok: boolean; retryAfterMs: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterMs: windowMs - (now - recent[0]!) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return { ok: true, retryAfterMs: 0 };
}

export function resetRateLimits() {
  hits.clear();
}

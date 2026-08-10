/**
 * In-memory sliding-window rate limiter.
 *
 * Distributed Redis-backed limits can be added later behind the same
 * interface (REDIS_URL); the in-memory store is correct for a single
 * Next.js instance and keeps the automation/auth endpoints safe today.
 */

interface WindowEntry {
  timestamps: number[];
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
}) {
  const { windowMs, max, keyPrefix } = options;
  const store = new Map<string, WindowEntry>();

  function prune(key: string, now: number) {
    const entry = store.get(key);
    if (!entry) {
      return;
    }
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const fullKey = `${keyPrefix}:${key}`;
      prune(fullKey, now);

      const entry = store.get(fullKey) ?? { timestamps: [] };

      if (entry.timestamps.length >= max) {
        const oldest = entry.timestamps[0];
        const retryAfterMs = Math.max(1, oldest + windowMs - now);
        return { ok: false, remaining: 0, retryAfterMs };
      }

      entry.timestamps.push(now);
      store.set(fullKey, entry);
      return { ok: true, remaining: max - entry.timestamps.length, retryAfterMs: 0 };
    },
    /** Best-effort cleanup of expired keys; call periodically in prod. */
    cleanup(): number {
      const now = Date.now();
      let removed = 0;
      for (const key of store.keys()) {
        prune(key, now);
        if (!store.has(key)) {
          removed += 1;
        }
      }
      return removed;
    },
  };
}

/** Auth endpoints: 10 attempts per 15 minutes per IP+user-agent. */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: "auth",
});

/** WhatsApp/automation ingest: 60 requests per minute per IP. */
export const ingestRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: "ingest",
});

/** Analysis creation: 20 per minute per user. */
export const analysisRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: "analysis",
});

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitKey(request: Request, extra = ""): string {
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  return `${ip}:${ua}:${extra}`;
}

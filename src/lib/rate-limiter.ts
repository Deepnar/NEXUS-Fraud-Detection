import { getRedis } from "@/lib/redis";

/**
 * Sliding-window in-memory rate limiter + fixed-window Redis backend.
 *
 * The exported limiters prefer Redis (distributed, survives restarts) and
 * transparently fall back to the in-memory store when REDIS_URL is unset or
 * Redis is unreachable — the app must never break because a limiter is down.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
}

class MemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly keyPrefix: string
  ) {}

  private prune(key: string, now: number) {
    const entry = this.store.get(key);
    if (!entry) {
      return;
    }
    const kept = entry.filter((t) => now - t < this.windowMs);
    if (kept.length === 0) {
      this.store.delete(key);
    } else {
      this.store.set(key, kept);
    }
  }

  async check(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const fullKey = `${this.keyPrefix}:${key}`;
    this.prune(fullKey, now);

    const entry = this.store.get(fullKey) ?? [];

    if (entry.length >= this.max) {
      const oldest = entry[0];
      return {
        ok: false,
        remaining: 0,
        retryAfterMs: Math.max(1, oldest + this.windowMs - now),
      };
    }

    entry.push(now);
    this.store.set(fullKey, entry);
    return { ok: true, remaining: this.max - entry.length, retryAfterMs: 0 };
  }
}

class RedisRateLimiter implements RateLimiter {
  private readonly fallback: MemoryRateLimiter;

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly keyPrefix: string
  ) {
    this.fallback = new MemoryRateLimiter(windowMs, max, keyPrefix);
  }

  async check(key: string): Promise<RateLimitResult> {
    const redis = getRedis();
    if (!redis) {
      return this.fallback.check(key);
    }

    const fullKey = `${this.keyPrefix}:${key}`;
    try {
      const results = await redis
        .multi()
        .incr(fullKey)
        .expire(fullKey, Math.max(1, Math.ceil(this.windowMs / 1000)), "NX")
        .exec();

      const count = (results?.[0]?.[1] as number | undefined) ?? 1;

      if (count > this.max) {
        const ttl = await redis.ttl(fullKey);
        return {
          ok: false,
          remaining: 0,
          retryAfterMs: Math.max(1, ttl * 1000),
        };
      }
      return { ok: true, remaining: this.max - count, retryAfterMs: 0 };
    } catch {
      // Redis unavailable → in-memory fallback for this instance.
      return this.fallback.check(key);
    }
  }
}

/** Auth endpoints: 10 attempts per 15 minutes per IP+user-agent. */
export const authRateLimiter: RateLimiter = new RedisRateLimiter(
  15 * 60 * 1000,
  10,
  "auth"
);

/** Transaction/batch ingest: 60 requests per minute per IP. */
export const transactionRateLimiter: RateLimiter = new RedisRateLimiter(
  60 * 1000,
  60,
  "transactions"
);

/** Analysis creation: 20 per minute per user. */
export const analysisRateLimiter: RateLimiter = new RedisRateLimiter(
  60 * 1000,
  20,
  "analysis"
);

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

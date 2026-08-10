import Redis from "ioredis";
import { env } from "@/lib/env";

/**
 * Shared Redis client for rate limits and short-lived locks.
 * Returns null when REDIS_URL is unset; the rate limiter then falls back
 * to its in-memory store so a single-instance deployment keeps working.
 */

let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) {
    return null;
  }
  if (client === undefined) {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    // Never crash the app because Redis hiccuped.
    client.on("error", () => {});
  }
  return client;
}

export async function redisPing(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    return false;
  }
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}

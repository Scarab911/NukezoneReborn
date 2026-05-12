import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Acquires a Redis distributed lock using SET NX PX.
 * Returns a release function, or null if the lock could not be acquired.
 *
 * The Lua release script ensures we only delete our own lock — prevents
 * accidental release of a lock acquired by a different process after TTL expiry.
 */
export async function acquireLock(
  key: string,
  ttlMs: number,
): Promise<(() => Promise<void>) | null> {
  const lockKey = `lock:${key}`;
  const token = `${process.pid}-${Date.now()}-${Math.random()}`;

  // Use call() to bypass ioredis v5 overload mismatch for SET NX PX
  const acquired = (await redis.call("SET", lockKey, token, "NX", "PX", ttlMs)) as "OK" | null;
  if (!acquired) return null;

  const release = async () => {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, 1, lockKey, token);
  };

  return release;
}

/**
 * Convenience wrapper — runs fn only if the lock is acquired.
 * Returns null (and logs a warning) if the lock is already held.
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const release = await acquireLock(key, ttlMs);
  if (!release) {
    logger.warn({ key }, "Could not acquire lock — skipping");
    return null;
  }
  try {
    return await fn();
  } finally {
    await release();
  }
}

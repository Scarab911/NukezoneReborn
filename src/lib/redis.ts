import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Primary connection — used for caching, locks, rate limits
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
  redisSub: Redis | undefined;
};

function createRedis(lazyConnect = false): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect,
  });
}

export const redis: Redis =
  globalForRedis.redis ?? createRedis();

// Dedicated subscriber connection — must not share with the command connection
export const redisSub: Redis =
  globalForRedis.redisSub ?? createRedis();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
  globalForRedis.redisSub = redisSub;
}

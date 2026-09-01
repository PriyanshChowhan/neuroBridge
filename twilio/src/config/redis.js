import "dotenv/config";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redis = new Redis(redisUrl, {
  lazyConnect: true,
  connectTimeout: 10_000,
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    return times <= 3 ? Math.min(times * 200, 1_000) : null;
  }
});

redis.on("error", (error) => {
  console.error(`[Redis] Connection error: ${error.message}`);
});

export async function connectRedis() {
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    await redis.ping();
  } catch (error) {
    console.error(`[Redis] Failed to connect at startup. Check REDIS_URL. ${error.message}`);
    throw error;
  }
}

export function createBlockingRedisConnection() {
  return redis.duplicate({ maxRetriesPerRequest: null });
}

export default redis;

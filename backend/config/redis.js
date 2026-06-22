const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = new Redis(REDIS_URL, {
  lazyConnect: true,
  // Keep offline queue on — commands queued while reconnecting instead of throwing
  enableOfflineQueue: true,
  // Retry connecting up to 3 times with exponential backoff, then give up gracefully
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null; // stop retrying, fail gracefully
    return Math.min(times * 200, 2000); // 200ms, 400ms, 600ms
  },
});

redisClient.on('connect', () => {
  console.log('[Redis] Connected');
});

redisClient.on('error', (err) => {
  // Log but don't crash — Redis is optional, app works without it (no caching/rate-limiting)
  console.warn('[Redis] Error:', err.message);
});

redisClient.on('reconnecting', () => {
  console.warn('[Redis] Reconnecting...');
});

const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('[Redis] Could not connect, continuing without Redis:', err.message);
  }
};

module.exports = { redisClient, connectRedis };

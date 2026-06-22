'use strict';

const { redisClient } = require('../config/redis');

/**
 * Generic sliding-window rate limiter using Redis INCR + EXPIRE.
 *
 * @param {number} maxRequests  - allowed requests per window
 * @param {number} windowSecs   - window duration in seconds
 */
const createLimiter = (maxRequests, windowSecs) => async (req, res, next) => {
  const key = `ratelimit:${req.ip}:${maxRequests}:${windowSecs}`;
  try {
    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, windowSecs);
    }
    if (count > maxRequests) {
      return res.status(429).json({ message: 'Too many requests, please try again later.' });
    }
    next();
  } catch (err) {
    // Redis unavailable — fail open (don't block requests)
    console.warn('[RateLimit] Redis error:', err.message);
    next();
  }
};

// standard: 100 req / 15 min — applied to general API routes
const standard = createLimiter(100, 15 * 60);

// strict: 10 req / 15 min — applied to auth routes (login, register, refresh)
const strict = createLimiter(10, 15 * 60);

// payment: 20 req / 15 min — applied to payment routes
const payment = createLimiter(20, 15 * 60);

module.exports = { standard, strict, payment };

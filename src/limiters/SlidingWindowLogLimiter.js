const redis = require('../redis/client');
const { randomUUID } = require('crypto');

class SlidingWindowLogLimiter {
  constructor({ limit, windowMs }) {
    if (limit <= 0) throw new Error('limit must be > 0');
    if (windowMs <= 0) throw new Error('windowMs must be > 0');
    this.limit = limit;
    this.windowMs = windowMs;
  }

  static LUA_SCRIPT = `
    local key         = KEYS[1]
    local now         = tonumber(ARGV[1])
    local windowStart = tonumber(ARGV[2])
    local limit       = tonumber(ARGV[3])
    local memberId    = ARGV[4]
    local ttl         = tonumber(ARGV[5])

    redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

    local count = redis.call('ZCARD', key)

    if count < limit then
      redis.call('ZADD', key, now, memberId)
      redis.call('EXPIRE', key, ttl)
      return {1, count + 1, limit, 0}
    else
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local oldestScore = tonumber(oldest[2])
      local retryAfterMs = oldestScore + (now - windowStart) - now
      if retryAfterMs < 0 then retryAfterMs = 0 end
      return {0, count, limit, retryAfterMs}
    end
  `;

  async consume(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const redisKey = `swlog:${key}`;
    const memberId = randomUUID();
    const ttlSeconds = Math.ceil(this.windowMs / 1000) + 1;

    try {
      const [allowed, count, limit, retryAfterMs] = await redis.eval(
        SlidingWindowLogLimiter.LUA_SCRIPT,
        1,
        redisKey,
        now,
        windowStart,
        this.limit,
        memberId,
        ttlSeconds,
      );

      return {
        allowed: allowed === 1,
        count: Number(count),
        limit: Number(limit),
        remaining: Math.max(0, this.limit - Number(count)),
        retryAfter: Math.ceil(Number(retryAfterMs) / 1000),
      };
    } catch (err) {
      console.error('[RateLimiter] Redis error:', err.message);
      return {
        allowed: true,
        count: 0,
        limit: this.limit,
        remaining: this.limit,
        retryAfter: 0,
      };
    }
  }
}

module.exports = SlidingWindowLogLimiter;
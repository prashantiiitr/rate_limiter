const redis = require('../redis/client');

class SlidingWindowCounterLimiter {
  constructor({ limit, windowMs }) {
    if (limit <= 0) throw new Error('limit must be > 0');
    if (windowMs <= 0) throw new Error('windowMs must be > 0');
    this.limit = limit;
    this.windowMs = windowMs;
  }

  static LUA_SCRIPT = `
    local currKey  = KEYS[1]
    local prevKey  = KEYS[2]
    local limit    = tonumber(ARGV[1])
    local now      = tonumber(ARGV[2])
    local windowMs = tonumber(ARGV[3])
    local ttl      = tonumber(ARGV[4])

    local elapsed   = (now % windowMs) / windowMs
    local prevCount = tonumber(redis.call('GET', prevKey)) or 0
    local currCount = tonumber(redis.call('GET', currKey)) or 0
    local estimate  = prevCount * (1 - elapsed) + currCount

    if estimate < limit then
      redis.call('INCR', currKey)
      redis.call('EXPIRE', currKey, ttl)
      if prevCount > 0 then
        redis.call('EXPIRE', prevKey, ttl)
      end
      return {1, math.floor(estimate) + 1, limit}
    else
      local retryAfterMs = windowMs
      if prevCount > 0 then
        retryAfterMs = math.ceil((estimate - limit + 1) / prevCount * windowMs)
      end
      if retryAfterMs < 0 then retryAfterMs = windowMs end
      return {0, math.floor(estimate), limit, retryAfterMs}
    end
  `;

  static ROTATE_SCRIPT = `
    local currKey  = KEYS[1]
    local prevKey  = KEYS[2]
    local slotKey  = KEYS[3]
    local currSlot = ARGV[1]
    local ttl      = tonumber(ARGV[2])

    local storedSlot = redis.call('GET', slotKey)

    if storedSlot ~= currSlot then
      local currCount = redis.call('GET', currKey) or '0'
      redis.call('SET', prevKey, currCount, 'EX', ttl)
      redis.call('SET', currKey, '0', 'EX', ttl)
      redis.call('SET', slotKey, currSlot, 'EX', ttl)
    end

    return 1
  `;

  async consume(key) {
    const now = Date.now();
    const currSlot = Math.floor(now / this.windowMs).toString();
    const ttlSeconds = Math.ceil((this.windowMs * 2) / 1000);

    const currKey = `swcnt:${key}:curr`;
    const prevKey = `swcnt:${key}:prev`;
    const slotKey = `swcnt:${key}:slot`;

    try {
      await redis.eval(
        SlidingWindowCounterLimiter.ROTATE_SCRIPT,
        3, currKey, prevKey, slotKey,
        currSlot, ttlSeconds,
      );

      const [allowed, count, limit, retryAfterMs] = await redis.eval(
        SlidingWindowCounterLimiter.LUA_SCRIPT,
        2, currKey, prevKey,
        this.limit, now, this.windowMs, ttlSeconds,
      );

      return {
        allowed: allowed === 1,
        count: Number(count),
        limit: Number(limit),
        remaining: Math.max(0, this.limit - Number(count)),
        retryAfter: retryAfterMs ? Math.ceil(Number(retryAfterMs) / 1000) : 0,
      };
    } catch (err) {
      console.error('[SlidingWindowCounter] Redis error:', err.message);
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

module.exports = SlidingWindowCounterLimiter;
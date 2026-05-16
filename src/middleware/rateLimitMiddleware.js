const TokenBucketLimiter = require('../limiters/TokenBucketLimiter');

function createRateLimiter({
  capacity,
  refillRate,
  keyFn = (req) => req.ip,
  onRejected = null,
}) {
  const limiter = new TokenBucketLimiter({ capacity, refillRate });

  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn(req);
    const result = limiter.consume(key);

    res.set({
      'X-RateLimit-Limit': capacity,
      'X-RateLimit-Remaining': result.tokens,
      'X-RateLimit-Reset': result.retryAfter
        ? Math.ceil(Date.now() / 1000) + result.retryAfter
        : Math.ceil(Date.now() / 1000),
    });

    if (result.allowed) return next();

    res.set('Retry-After', String(result.retryAfter));

    if (onRejected) return onRejected(req, res, result);

    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry after ${result.retryAfter}s`,
      retryAfter: result.retryAfter,
    });
  };
}

module.exports = createRateLimiter;
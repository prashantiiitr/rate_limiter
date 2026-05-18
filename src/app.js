const express = require('express');
const createRateLimiter = require('./middleware/rateLimitMiddleware');
const SlidingWindowLogLimiter = require('./limiters/SlidingWindowLogLimiter');
const SlidingWindowCounterLimiter = require('./limiters/SlidingWindowCounterLimiter');
const { register } = require('./metrics');
const { recordMetrics } = require('./middleware/metricsMiddleware');

const app = express();
app.use(express.json());

app.use(createRateLimiter({
  capacity: 100,
  refillRate: 100 / 60,
}));

const authLimiter = createRateLimiter({
  capacity: 5,
  refillRate: 5 / 60,
  keyFn: (req) => `auth:${req.ip}`,
  onRejected: (req, res, result) => {
    res.status(429).json({
      error: 'Too many login attempts',
      lockoutSeconds: result.retryAfter,
    });
  },
});

const userLimiter = createRateLimiter({
  capacity: 20,
  refillRate: 10,
  keyFn: (req) => `user:${req.headers['x-user-id'] || req.ip}`,
});

const swLogLimiter = new SlidingWindowLogLimiter({
  limit: 10,
  windowMs: 60_000,
});

const swCounterLimiter = new SlidingWindowCounterLimiter({
  limit: 100,
  windowMs: 60_000,
});

const ipLimiter = createRateLimiter({
  capacity: 200,
  refillRate: 50,
  keyFn: (req) => `ip:${req.ip}`,
});

const premiumUserLimiter = createRateLimiter({
  capacity: 50,
  refillRate: 20,
  keyFn: (req) => `premium:${req.headers['x-user-id'] || req.ip}`,
});

app.post('/auth/login', authLimiter, (req, res) => {
  res.json({ message: 'Login successful' });
});

app.get('/api/data', userLimiter, (req, res) => {
  res.json({
    data: 'Here is your data',
    timestamp: new Date(),
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
  });
});

app.get('/api/search', async (req, res) => {
  const key = req.headers['x-user-id'] || req.ip;
  const start = Date.now();

  const result = await swLogLimiter.consume(key);

  recordMetrics(
    '/api/search',
    'GET',
    result,
    'swLog',
    Date.now() - start
  );

  res.set({
    'X-RateLimit-Limit': result.limit,
    'X-RateLimit-Remaining': result.remaining,
  });

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Too Many Requests',
      retryAfter: result.retryAfter,
    });
  }

  res.json({
    results: [],
    query: req.query.q,
  });
});

app.get('/api/feed', async (req, res) => {
  const key = req.headers['x-user-id'] || req.ip;
  const start = Date.now();

  const result = await swCounterLimiter.consume(key);

  recordMetrics(
    '/api/feed',
    'GET',
    result,
    'swCounter',
    Date.now() - start
  );

  res.set({
    'X-RateLimit-Limit': result.limit,
    'X-RateLimit-Remaining': result.remaining,
  });

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Too Many Requests',
      retryAfter: result.retryAfter,
    });
  }

  res.json({ feed: [] });
});

app.get(
  '/api/premium',
  ipLimiter,
  premiumUserLimiter,
  async (req, res) => {
    const userId = req.headers['x-user-id'] || 'anonymous';

    res.json({
      data: 'Premium content',
      userId,
      timestamp: new Date(),
      tier: 'premium',
    });
  }
);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Server running on :${PORT}`);
  });
}

module.exports = app;
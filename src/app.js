const express = require('express');
const createRateLimiter = require('./middleware/rateLimitMiddleware');

const app = express();

app.use(express.json());

app.use(
  createRateLimiter({
    capacity: 100,
    refillRate: 100 / 60,
  })
);

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

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Server running on :${PORT}`);
  });
}

module.exports = app;
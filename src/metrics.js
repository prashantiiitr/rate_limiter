const client = require('prom-client');


const register = new client.Registry();


client.collectDefaultMetrics({ register });

const requestsTotal = new client.Counter({
  name: 'rate_limiter_requests_total',
  help: 'Total number of requests processed by rate limiter',
  labelNames: ['route', 'method', 'result'], // result: allowed | rejected
  registers: [register],
});

const consumeDuration = new client.Histogram({
  name: 'rate_limiter_consume_duration_ms',
  help: 'Time taken to execute rate limit consume() in ms',
  labelNames: ['limiter'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500],
  registers: [register],
});


const tokensRemaining = new client.Gauge({
  name: 'rate_limiter_tokens_remaining',
  help: 'Tokens remaining in bucket for a sampled key',
  labelNames: ['limiter', 'key'],
  registers: [register],
});


const redisErrors = new client.Counter({
  name: 'rate_limiter_redis_errors_total',
  help: 'Total Redis errors encountered by rate limiters',
  labelNames: ['limiter'],
  registers: [register],
});

module.exports = {
  register,
  requestsTotal,
  consumeDuration,
  tokensRemaining,
  redisErrors,
};
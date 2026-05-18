const { requestsTotal, consumeDuration } = require('../metrics');

function recordMetrics(route, method, result, limiterName, durationMs) {
  requestsTotal.inc({
    route,
    method,
    result: result.allowed ? 'allowed' : 'rejected',
  });

  consumeDuration.observe({ limiter: limiterName }, durationMs);
}

module.exports = { recordMetrics };
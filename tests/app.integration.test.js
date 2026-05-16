const request = require('supertest');
const app = require('../src/app');

describe('Rate limiter integration', () => {

  it('sets rate limit headers on responses', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('returns 429 when auth limit is exceeded', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/auth/login').send({});
    }
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many login attempts');
    expect(res.body.lockoutSeconds).toBeGreaterThan(0);
  });

  it('allows requests within user limit', async () => {
    const res = await request(app)
      .get('/api/data')
      .set('x-user-id', 'user-test-integration');
    expect(res.status).toBe(200);
  });

  it('includes Retry-After header on rate limit response', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
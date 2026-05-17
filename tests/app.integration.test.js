const request = require('supertest');
const app = require('../src/app');
const redis = require('../src/redis/client');

afterEach(async () => {
  try {
    const keys = await redis.keys('sw*');
    if (keys.length) await redis.del(...keys);
  } catch (_) {}
});

afterAll(async () => {
  await redis.quit();
});

describe('Day 1 — Token Bucket middleware', () => {
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

describe('Day 2 — Sliding Window Log (/api/search)', () => {
  it('allows requests within the limit', async () => {
    const res = await request(app)
      .get('/api/search')
      .set('x-user-id', 'search-user-1');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('rejects after exceeding the limit', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).get('/api/search').set('x-user-id', 'search-user-2');
    }
    const res = await request(app)
      .get('/api/search')
      .set('x-user-id', 'search-user-2');
    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBeGreaterThan(0);
  });

  it('decrements remaining on each request', async () => {
    const first = await request(app)
      .get('/api/search')
      .set('x-user-id', 'search-user-3');
    const second = await request(app)
      .get('/api/search')
      .set('x-user-id', 'search-user-3');
    expect(Number(second.headers['x-ratelimit-remaining']))
      .toBeLessThan(Number(first.headers['x-ratelimit-remaining']));
  });

  it('isolates different users', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).get('/api/search').set('x-user-id', 'search-hog');
    }
    const res = await request(app)
      .get('/api/search')
      .set('x-user-id', 'search-other');
    expect(res.status).toBe(200);
  });
});

describe('Day 2 — Sliding Window Counter (/api/feed)', () => {
  it('allows requests within the limit', async () => {
    const res = await request(app)
      .get('/api/feed')
      .set('x-user-id', 'feed-user-1');
    expect(res.status).toBe(200);
    expect(res.body.feed).toBeDefined();
  });

  it('sets correct rate limit headers', async () => {
    const res = await request(app)
      .get('/api/feed')
      .set('x-user-id', 'feed-user-2');
    expect(res.headers['x-ratelimit-limit']).toBe('100');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('isolates different users', async () => {
    const a = await request(app).get('/api/feed').set('x-user-id', 'feed-A');
    const b = await request(app).get('/api/feed').set('x-user-id', 'feed-B');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });
});
const SlidingWindowLogLimiter = require('../src/limiters/SlidingWindowLogLimiter');
const SlidingWindowCounterLimiter = require('../src/limiters/SlidingWindowCounterLimiter');
const redis = require('../src/redis/client');

afterEach(async () => {
  const keys = await redis.keys('sw*');
  if (keys.length) await redis.del(...keys);
});

// No redis.quit() here — app.integration.test.js owns the teardown

describe('SlidingWindowLogLimiter', () => {
  it('allows requests up to the limit', async () => {
    const limiter = new SlidingWindowLogLimiter({ limit: 5, windowMs: 10_000 });
    for (let i = 0; i < 5; i++) {
      const result = await limiter.consume('user-1');
      expect(result.allowed).toBe(true);
    }
  });

  it('rejects the request beyond the limit', async () => {
    const limiter = new SlidingWindowLogLimiter({ limit: 3, windowMs: 10_000 });
    await limiter.consume('user-2');
    await limiter.consume('user-2');
    await limiter.consume('user-2');
    const result = await limiter.consume('user-2');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('isolates different clients', async () => {
    const limiter = new SlidingWindowLogLimiter({ limit: 2, windowMs: 10_000 });
    await limiter.consume('user-A');
    await limiter.consume('user-A');
    expect((await limiter.consume('user-A')).allowed).toBe(false);
    expect((await limiter.consume('user-B')).allowed).toBe(true);
  });

  it('allows again after the window expires', async () => {
    const limiter = new SlidingWindowLogLimiter({ limit: 2, windowMs: 300 });
    await limiter.consume('user-3');
    await limiter.consume('user-3');
    expect((await limiter.consume('user-3')).allowed).toBe(false);
    await new Promise(r => setTimeout(r, 400));
    expect((await limiter.consume('user-3')).allowed).toBe(true);
  });

  it('returns correct remaining count', async () => {
    const limiter = new SlidingWindowLogLimiter({ limit: 5, windowMs: 10_000 });
    const first = await limiter.consume('user-4');
    expect(first.remaining).toBe(4);
    const second = await limiter.consume('user-4');
    expect(second.remaining).toBe(3);
  });

  it('throws on invalid config', () => {
    expect(() => new SlidingWindowLogLimiter({ limit: 0, windowMs: 1000 }))
      .toThrow('limit must be > 0');
    expect(() => new SlidingWindowLogLimiter({ limit: 5, windowMs: 0 }))
      .toThrow('windowMs must be > 0');
  });
});

describe('SlidingWindowCounterLimiter', () => {
  it('allows requests up to the limit', async () => {
    const limiter = new SlidingWindowCounterLimiter({ limit: 5, windowMs: 10_000 });
    for (let i = 0; i < 5; i++) {
      const result = await limiter.consume('cnt-user-1');
      expect(result.allowed).toBe(true);
    }
  });

  it('rejects beyond the limit', async () => {
    const limiter = new SlidingWindowCounterLimiter({ limit: 3, windowMs: 10_000 });
    await limiter.consume('cnt-user-2');
    await limiter.consume('cnt-user-2');
    await limiter.consume('cnt-user-2');
    const result = await limiter.consume('cnt-user-2');
    expect(result.allowed).toBe(false);
  });

  it('isolates clients', async () => {
    const limiter = new SlidingWindowCounterLimiter({ limit: 2, windowMs: 10_000 });
    await limiter.consume('cnt-A');
    await limiter.consume('cnt-A');
    expect((await limiter.consume('cnt-A')).allowed).toBe(false);
    expect((await limiter.consume('cnt-B')).allowed).toBe(true);
  });

  it('resets after the window expires', async () => {
    const limiter = new SlidingWindowCounterLimiter({ limit: 2, windowMs: 300 });
    await limiter.consume('cnt-user-3');
    await limiter.consume('cnt-user-3');
    expect((await limiter.consume('cnt-user-3')).allowed).toBe(false);
    await new Promise(r => setTimeout(r, 400));
    expect((await limiter.consume('cnt-user-3')).allowed).toBe(true);
  });
});
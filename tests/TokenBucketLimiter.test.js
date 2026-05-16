const TokenBucketLimiter = require('../src/limiters/TokenBucketLimiter');

describe('TokenBucketLimiter', () => {
  describe('basic consumption', () => {
    it('allows requests up to capacity', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 5,
        refillRate: 1,
      });

      for (let i = 0; i < 5; i++) {
        expect(limiter.consume('client-1').allowed).toBe(true);
      }
    });

    it('rejects requests after capacity is exhausted', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 3,
        refillRate: 1,
      });

      limiter.consume('client-1');
      limiter.consume('client-1');
      limiter.consume('client-1');

      const result = limiter.consume('client-1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('isolates clients independently', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 2,
        refillRate: 1,
      });

      limiter.consume('client-A');
      limiter.consume('client-A');

      expect(limiter.consume('client-A').allowed).toBe(false);
      expect(limiter.consume('client-B').allowed).toBe(true);
    });
  });

  describe('refill behavior', () => {
    it('refills tokens over time', async () => {
      const limiter = new TokenBucketLimiter({
        capacity: 2,
        refillRate: 10,
      });

      limiter.consume('client-1');
      limiter.consume('client-1');

      expect(limiter.consume('client-1').allowed).toBe(false);

      await new Promise((r) => setTimeout(r, 200));

      expect(limiter.consume('client-1').allowed).toBe(true);
    });

    it('never exceeds capacity when refilling', async () => {
      const limiter = new TokenBucketLimiter({
        capacity: 3,
        refillRate: 100,
      });

      limiter.consume('client-1');

      await new Promise((r) => setTimeout(r, 100));

      const { tokens } = limiter.peek('client-1');

      expect(tokens).toBeLessThanOrEqual(3);
    });
  });

  describe('retryAfter calculation', () => {
    it('returns retryAfter on rejection', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 1,
        refillRate: 1,
      });

      limiter.consume('client-1');

      const result = limiter.consume('client-1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(1);
    });
  });

  describe('constructor validation', () => {
    it('throws on invalid capacity', () => {
      expect(
        () =>
          new TokenBucketLimiter({
            capacity: 0,
            refillRate: 1,
          })
      ).toThrow('capacity must be > 0');
    });

    it('throws on invalid refillRate', () => {
      expect(
        () =>
          new TokenBucketLimiter({
            capacity: 5,
            refillRate: -1,
          })
      ).toThrow('refillRate must be > 0');
    });
  });
});
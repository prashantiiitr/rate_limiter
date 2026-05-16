
class TokenBucketLimiter {
  constructor({ capacity, refillRate, store = new Map() }) {
    if (capacity <= 0 || refillRate <= 0) {
      throw new Error('capacity and refillRate must be greater than 0');
    }

    this.capacity = capacity;
    this.refillRate = refillRate;
    this.store = store;
  }

  consume(key) {
    const now = Date.now();
    let bucket = this.store.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefill: now,
      };
    }

    const elapsed = (now - bucket.lastRefill) / 1000;

    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + elapsed * this.refillRate
    );

    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.store.set(key, bucket);

      return {
        allowed: true,
        tokens: Math.floor(bucket.tokens),
      };
    }

    this.store.set(key, bucket);

    return {
      allowed: false,
      retryAfter: Math.ceil((1 - bucket.tokens) / this.refillRate),
    };
  }

  reset() {
    this.store.clear();
  }
}


module.exports = TokenBucketLimiter;
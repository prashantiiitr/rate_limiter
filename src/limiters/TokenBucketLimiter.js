class TokenBucketLimiter {
  constructor({ capacity, refillRate, store = new Map() }) {
    if (capacity <= 0) throw new Error('capacity must be > 0');
    if (refillRate <= 0) throw new Error('refillRate must be > 0');

    this.capacity = capacity;
    this.refillRate = refillRate;
    this.store = store;
  }

  consume(key) {
    const now = Date.now();
    let bucket = this.store.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity - 1, lastRefill: now };
      this.store.set(key, bucket);
      return { allowed: true, tokens: bucket.tokens, retryAfter: 0 };
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillRate);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.store.set(key, bucket);
      return { allowed: true, tokens: Math.floor(bucket.tokens), retryAfter: 0 };
    }

    const retryAfter = Math.ceil((1 - bucket.tokens) / this.refillRate);
    this.store.set(key, bucket);
    return { allowed: false, tokens: 0, retryAfter };
  }
  peek(key) {
    const bucket = this.store.get(key);
    if (!bucket) return { tokens: this.capacity };
    const elapsed = (Date.now() - bucket.lastRefill) / 1000;
    return {
      tokens: Math.min(this.capacity, bucket.tokens + elapsed * this.refillRate),
    };
  }

  reset() {
    this.store.clear();
  }
}

module.exports = TokenBucketLimiter;
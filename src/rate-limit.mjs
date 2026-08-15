export function createRateLimiter({ limit, windowMs }) {
  const buckets = new Map();
  let lastCleanup = Date.now();
  return function consume(key) {
    const now = Date.now();
    if (now - lastCleanup > windowMs) {
      lastCleanup = now;
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
    }
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  };
}

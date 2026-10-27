// Small in-memory limiter for failed logins. Enough for one instance;
// several instances would move this to Redis.
export function createLoginLimiter({ maxAttempts, windowMs, now = () => Date.now() }) {
  const failures = new Map();

  const active = (key) => {
    const entry = failures.get(key);
    if (entry && now() - entry.first > windowMs) {
      failures.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    isBlocked: (key) => (active(key)?.count ?? 0) >= maxAttempts,
    recordFailure(key) {
      const entry = active(key);
      if (entry) entry.count += 1;
      else failures.set(key, { count: 1, first: now() });
    },
    reset: (key) => failures.delete(key),
  };
}

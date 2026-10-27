// Tiny TTL cache. In-memory is enough for one instance; swap for Redis when running several.
export function createCache({ ttlMs, now = () => Date.now() }) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() >= entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      if (ttlMs > 0) entries.set(key, { value, expiresAt: now() + ttlMs });
    },
    delete: (key) => entries.delete(key),
    clear: () => entries.clear(),
  };
}

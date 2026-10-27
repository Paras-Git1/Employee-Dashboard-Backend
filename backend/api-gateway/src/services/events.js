// In-process publish/subscribe for task changes, used by the /api/events stream.
// One gateway instance is enough here; with several instances this becomes Redis pub/sub.
export function createEventBus() {
  const listeners = new Set();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error('[events] listener failed:', err);
        }
      }
    },
    size: () => listeners.size,
  };
}

/**
 * Tiny TTL cache for a single value with in-flight de-duplication: concurrent callers
 * share one upstream request. Rejections are not cached.
 */
export function cachedValue<T>(load: () => Promise<{ value: T; ttlMs: number }>, now: () => number = Date.now) {
  let entry: { value: T; expiresAt: number } | undefined
  let inFlight: Promise<T> | undefined

  return {
    async get(): Promise<T> {
      if (entry && entry.expiresAt > now()) return entry.value
      if (!inFlight) {
        inFlight = load()
          .then(({ value, ttlMs }) => {
            entry = { value, expiresAt: now() + ttlMs }
            return value
          })
          .finally(() => {
            inFlight = undefined
          })
      }
      return inFlight
    },
    clear(): void {
      entry = undefined
    },
  }
}

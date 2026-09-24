/**
 * Tiny in-memory cache for GET responses shared across pages (lives until reload).
 * Dedupes concurrent requests for the same key and serves fresh-enough data without a new call.
 */

type Entry = { value: unknown; at: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export function fetchCached<T>(key: string, fetcher: () => Promise<T>, maxAgeMs: number): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at <= maxAgeMs) return Promise.resolve(hit.value as T);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = fetcher()
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

export function clearCache() {
  store.clear();
}

export const leaderboardCacheKey = (seasonType?: number, week?: number) =>
  seasonType == null || week == null ? "leaderboard:overall" : `leaderboard:${seasonType}-${week}`;

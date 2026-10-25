// Shared process-local cache for public menu payloads. Never cache analytics writes.
const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 200;
type Entry = { expires: number; value: unknown };
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
let generation = 0;
export const publicMenuCacheStats = { hits: 0, misses: 0 };
export function invalidatePublicMenuCache() {
  generation++;
  entries.clear();
  pending.clear();
}
export async function cachedPublicMenu<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = entries.get(key);
  if (existing && existing.expires > now) {
    publicMenuCacheStats.hits++;
    return existing.value as T;
  }
  const inFlight = pending.get(key);
  if (inFlight) {
    publicMenuCacheStats.hits++;
    return inFlight as Promise<T>;
  }
  publicMenuCacheStats.misses++;
  const version = generation;
  const task = loader().then(value => {
    if (generation === version) {
      entries.delete(key);
      entries.set(key, { value, expires: Date.now() + TTL_MS });
      if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    }
    return value;
  }).finally(() => {
    if (pending.get(key) === task) pending.delete(key);
  });
  pending.set(key, task);
  return task;
}

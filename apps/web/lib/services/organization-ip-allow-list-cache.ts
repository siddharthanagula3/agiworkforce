import 'server-only';

const CACHE_TTL_MS = 30_000;
const LAST_KNOWN_TTL_MS = 300_000;

interface CacheEntry {
  cidrs: readonly string[];
  storedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedIpAllowList(organizationId: string): readonly string[] | undefined {
  const entry = cache.get(organizationId);
  if (!entry || entry.storedAt + CACHE_TTL_MS <= Date.now()) return undefined;
  return entry.cidrs;
}

export function getLastKnownIpAllowList(organizationId: string): readonly string[] | undefined {
  const entry = cache.get(organizationId);
  if (!entry) return undefined;
  if (entry.storedAt + LAST_KNOWN_TTL_MS <= Date.now()) {
    cache.delete(organizationId);
    return undefined;
  }
  return entry.cidrs;
}

export function setCachedIpAllowList(organizationId: string, cidrs: readonly string[]): void {
  cache.set(organizationId, { cidrs, storedAt: Date.now() });
}

export function invalidateIpAllowListCache(organizationId: string): void {
  cache.delete(organizationId);
}

export function clearIpAllowListCacheForTests(): void {
  cache.clear();
}

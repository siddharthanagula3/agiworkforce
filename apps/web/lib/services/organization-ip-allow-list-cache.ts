import 'server-only';

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  cidrs: readonly string[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedIpAllowList(organizationId: string): readonly string[] | undefined {
  const entry = cache.get(organizationId);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(organizationId);
    return undefined;
  }
  return entry.cidrs;
}

export function setCachedIpAllowList(organizationId: string, cidrs: readonly string[]): void {
  cache.set(organizationId, { cidrs, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateIpAllowListCache(organizationId: string): void {
  cache.delete(organizationId);
}

export function clearIpAllowListCacheForTests(): void {
  cache.clear();
}

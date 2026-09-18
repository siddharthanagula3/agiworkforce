/**
 * Cache scope: which account and which workspace a locally cached value belongs
 * to. Personal is a workspace of its own, not the absence of one, so cached
 * personal content cannot surface inside an organization.
 */
export interface CacheScope {
  accountId: string | null;
  workspaceId: string | null;
}

export const PERSONAL_WORKSPACE_SEGMENT = 'personal';
export const ANONYMOUS_ACCOUNT_SEGMENT = 'anonymous';

const SCOPE_MARKER = '::@';

function segment(value: string | null, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/::@/g, '-') : fallback;
}

export function cacheScopeId(scope: CacheScope): string {
  return `${segment(scope.accountId, ANONYMOUS_ACCOUNT_SEGMENT)}/${segment(
    scope.workspaceId,
    PERSONAL_WORKSPACE_SEGMENT,
  )}`;
}

export function sameCacheScope(a: CacheScope, b: CacheScope): boolean {
  return cacheScopeId(a) === cacheScopeId(b);
}

export function namespacedCacheKey(baseKey: string, scope: CacheScope): string {
  return `${baseKey}${SCOPE_MARKER}${cacheScopeId(scope)}`;
}

export interface ParsedCacheKey {
  baseKey: string;
  scopeId: string;
}

export function parseNamespacedCacheKey(key: string): ParsedCacheKey | null {
  const marker = key.lastIndexOf(SCOPE_MARKER);
  if (marker <= 0) return null;
  const scopeId = key.slice(marker + SCOPE_MARKER.length);
  if (!scopeId.includes('/')) return null;
  return { baseKey: key.slice(0, marker), scopeId };
}

export function isCacheKeyInScope(key: string, scope: CacheScope): boolean {
  const parsed = parseNamespacedCacheKey(key);
  return parsed === null || parsed.scopeId === cacheScopeId(scope);
}

/**
 * Keys written for a different account or workspace. An unnamespaced key is not
 * foreign: it predates namespacing and is the caller's to migrate or purge.
 */
export function foreignScopeKeys(keys: Iterable<string>, scope: CacheScope): string[] {
  const current = cacheScopeId(scope);
  const foreign: string[] = [];
  for (const key of keys) {
    const parsed = parseNamespacedCacheKey(key);
    if (parsed && parsed.scopeId !== current) foreign.push(key);
  }
  return foreign;
}

export interface CacheStorageLike {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

export function evictForeignScopeEntries(
  storage: CacheStorageLike | undefined,
  scope: CacheScope,
): string[] {
  if (!storage) return [];
  const present: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) present.push(key);
    }
  } catch {
    return [];
  }

  const evicted: string[] = [];
  for (const key of foreignScopeKeys(present, scope)) {
    try {
      storage.removeItem(key);
      evicted.push(key);
    } catch {
      // A single unreadable key must not abort the sweep.
    }
  }
  return evicted;
}

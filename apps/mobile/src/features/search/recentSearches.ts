import { storage } from '@/lib/mmkv';

export const RECENT_SEARCH_LIMIT = 5;

const KEY_PREFIX = 'recent-searches:v1:';

export type RecentSearchScope = { mode: 'local' } | { mode: 'cloud'; ownerId: string };

function storageKey(scope: RecentSearchScope): string {
  return scope.mode === 'local'
    ? `${KEY_PREFIX}local`
    : `${KEY_PREFIX}cloud:${encodeURIComponent(scope.ownerId)}`;
}

function normalized(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

function sameQuery(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

export function readRecentSearches(scope: RecentSearchScope | null): string[] {
  if (!scope) return [];
  try {
    const raw = storage.getString(storageKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .slice(0, RECENT_SEARCH_LIMIT);
  } catch {
    return [];
  }
}

export function recordRecentSearch(scope: RecentSearchScope | null, query: string): string[] {
  const entry = normalized(query);
  if (!scope || entry.length === 0) return readRecentSearches(scope);
  const next = [
    entry,
    ...readRecentSearches(scope).filter((existing) => !sameQuery(existing, entry)),
  ].slice(0, RECENT_SEARCH_LIMIT);
  try {
    storage.set(storageKey(scope), JSON.stringify(next));
  } catch {
    return readRecentSearches(scope);
  }
  return next;
}

export function clearRecentSearches(scope: RecentSearchScope | null): void {
  if (!scope) return;
  try {
    storage.delete(storageKey(scope));
  } catch {
    // A failed delete leaves the list as it was, and the next read shows it.
  }
}

export function clearCloudRecentSearches(): void {
  try {
    const cloudPrefix = `${KEY_PREFIX}cloud:`;
    for (const key of storage.getAllKeys?.() ?? []) {
      if (key.startsWith(cloudPrefix)) storage.delete(key);
    }
  } catch {
    // A failed delete leaves the lists as they were, and the next read shows them.
  }
}

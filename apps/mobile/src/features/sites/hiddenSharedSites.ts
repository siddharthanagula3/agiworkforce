import { storage } from '@/lib/mmkv';

const keyFor = (accountId: string) => `sites:hidden-shared-sites:v1:${accountId}`;

export function hiddenSharedSiteTokens(accountId: string | null): ReadonlySet<string> {
  if (!accountId) return new Set();
  try {
    const parsed: unknown = JSON.parse(storage.getString(keyFor(accountId)) ?? '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

export function hideSharedSite(accountId: string, token: string): void {
  const tokens = new Set(hiddenSharedSiteTokens(accountId));
  tokens.add(token);
  storage.set(keyFor(accountId), JSON.stringify([...tokens]));
}

import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_ACCOUNT_SEGMENT,
  PERSONAL_WORKSPACE_SEGMENT,
  cacheScopeId,
  evictForeignScopeEntries,
  foreignScopeKeys,
  isCacheKeyInScope,
  namespacedCacheKey,
  parseNamespacedCacheKey,
  sameCacheScope,
  type CacheStorageLike,
} from '../cache-namespace';

const PERSONAL = { accountId: 'user_1', workspaceId: null };
const WORK = { accountId: 'user_1', workspaceId: 'org_a' };
const OTHER_ACCOUNT = { accountId: 'user_2', workspaceId: 'org_a' };

class FakeStorage implements CacheStorageLike {
  private entries: string[];

  constructor(keys: string[]) {
    this.entries = [...keys];
  }

  get length(): number {
    return this.entries.length;
  }

  key(index: number): string | null {
    return this.entries[index] ?? null;
  }

  removeItem(key: string): void {
    this.entries = this.entries.filter((entry) => entry !== key);
  }

  get keys(): string[] {
    return [...this.entries];
  }
}

describe('cache scope', () => {
  it('treats the personal workspace as a workspace, not as the absence of one', () => {
    expect(cacheScopeId(PERSONAL)).toBe(`user_1/${PERSONAL_WORKSPACE_SEGMENT}`);
    expect(cacheScopeId(WORK)).toBe('user_1/org_a');
    expect(sameCacheScope(PERSONAL, WORK)).toBe(false);
  });

  it('names a signed-out scope rather than colliding with an account', () => {
    expect(cacheScopeId({ accountId: null, workspaceId: null })).toBe(
      `${ANONYMOUS_ACCOUNT_SEGMENT}/${PERSONAL_WORKSPACE_SEGMENT}`,
    );
  });

  it('round-trips a namespaced key', () => {
    const key = namespacedCacheKey('chat-drafts', WORK);
    expect(parseNamespacedCacheKey(key)).toEqual({
      baseKey: 'chat-drafts',
      scopeId: 'user_1/org_a',
    });
    expect(isCacheKeyInScope(key, WORK)).toBe(true);
    expect(isCacheKeyInScope(key, PERSONAL)).toBe(false);
    expect(isCacheKeyInScope(key, OTHER_ACCOUNT)).toBe(false);
  });

  it('leaves an unnamespaced key alone instead of claiming it', () => {
    expect(parseNamespacedCacheKey('tool-storage')).toBeNull();
    expect(isCacheKeyInScope('tool-storage', WORK)).toBe(true);
    expect(foreignScopeKeys(['tool-storage'], WORK)).toEqual([]);
  });

  it('cannot be confused by a workspace id that contains the marker', () => {
    const key = namespacedCacheKey('chat', { accountId: 'user_1', workspaceId: 'org::@evil/x' });
    expect(parseNamespacedCacheKey(key)?.scopeId).toBe('user_1/org-evil/x');
    expect(isCacheKeyInScope(key, WORK)).toBe(false);
  });

  it('evicts only what another account or workspace wrote', () => {
    const storage = new FakeStorage([
      namespacedCacheKey('chat-drafts', WORK),
      namespacedCacheKey('chat-drafts', PERSONAL),
      namespacedCacheKey('chat-drafts', OTHER_ACCOUNT),
      'tool-storage',
    ]);

    const evicted = evictForeignScopeEntries(storage, WORK);

    expect(evicted).toEqual([
      namespacedCacheKey('chat-drafts', PERSONAL),
      namespacedCacheKey('chat-drafts', OTHER_ACCOUNT),
    ]);
    expect(storage.keys).toEqual([namespacedCacheKey('chat-drafts', WORK), 'tool-storage']);
  });

  it('survives a storage area that throws while being read', () => {
    const hostile: CacheStorageLike = {
      get length(): number {
        throw new Error('blocked');
      },
      key: () => null,
      removeItem: () => undefined,
    };
    expect(evictForeignScopeEntries(hostile, WORK)).toEqual([]);
    expect(evictForeignScopeEntries(undefined, WORK)).toEqual([]);
  });
});

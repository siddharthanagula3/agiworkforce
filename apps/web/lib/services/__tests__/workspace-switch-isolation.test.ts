import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ getKeyValueStore: vi.fn() }));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));

import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  assertWorkspaceBindingCurrent,
  getWorkspaceScopedCache,
  invalidateWorkspaceScopedCaches,
  persistProvenActiveWorkspaceSelection,
  workspaceCacheScope,
  WORKSPACE_CACHE_REGISTRY,
  type WorkspaceCacheId,
} from '../active-workspace-service';

const WORKSPACE_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_B = '22222222-2222-4222-8222-222222222222';
const USER = 'user-1';
const OTHER_USER = 'user-2';

const SCOPED_CACHES: readonly WorkspaceCacheId[] = [
  'personalization',
  'search-index',
  'notifications',
  'schedules',
];

function harness() {
  const query = vi.fn();
  const execute = vi.fn();
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function seedEveryCache(
  userId: string,
  organizationId: string | null,
  value: string,
): Promise<void> {
  for (const cacheId of SCOPED_CACHES) {
    const cache = getWorkspaceScopedCache(cacheId, userId, organizationId);
    expect(cache).not.toBeNull();
    await cache?.set('entry', value);
  }
}

async function readEveryCache(
  userId: string,
  organizationId: string | null,
): Promise<(string | null)[]> {
  const values: (string | null)[] = [];
  for (const cacheId of SCOPED_CACHES) {
    const cache = getWorkspaceScopedCache(cacheId, userId, organizationId);
    values.push((await cache?.get<string>('entry')) ?? null);
  }
  return values;
}

let backing: KeyValueStore;

beforeEach(() => {
  vi.clearAllMocks();
  backing = createMemoryKeyValueStore();
  mocks.getKeyValueStore.mockReturnValue(backing);
});

describe('workspace-scoped cache registry', () => {
  it('registers every workspace-scoped cache with a source of truth and a switch trigger', () => {
    const scoped = WORKSPACE_CACHE_REGISTRY.workspaceScoped();
    expect(scoped.map((cache) => cache.id).sort()).toEqual([...SCOPED_CACHES].sort());
    for (const cache of scoped) {
      expect(cache.sourceOfTruth).toBe('postgres');
      expect(cache.invalidatedBy).toContain('workspace-switch');
    }
  });

  it('refuses a cache that was never registered', () => {
    expect(() =>
      getWorkspaceScopedCache('conversations' as WorkspaceCacheId, USER, WORKSPACE_A),
    ).toThrow(/Unregistered workspace cache/u);
  });
});

describe('workspace scoping of personalization, search, notifications and schedules', () => {
  it('keeps each cache in its own workspace namespace', async () => {
    await seedEveryCache(USER, WORKSPACE_A, 'from-a');
    await seedEveryCache(USER, WORKSPACE_B, 'from-b');

    await expect(readEveryCache(USER, WORKSPACE_A)).resolves.toEqual([
      'from-a',
      'from-a',
      'from-a',
      'from-a',
    ]);
    await expect(readEveryCache(USER, WORKSPACE_B)).resolves.toEqual([
      'from-b',
      'from-b',
      'from-b',
      'from-b',
    ]);
  });

  it('gives the personal workspace a namespace of its own rather than the absence of one', async () => {
    await seedEveryCache(USER, null, 'personal');
    await seedEveryCache(USER, WORKSPACE_A, 'from-a');

    await expect(readEveryCache(USER, null)).resolves.toEqual([
      'personal',
      'personal',
      'personal',
      'personal',
    ]);
  });

  it('never lets one cache read another cache of the same workspace', async () => {
    const personalization = getWorkspaceScopedCache('personalization', USER, WORKSPACE_A);
    await personalization?.set('entry', 'profile');

    const notifications = getWorkspaceScopedCache('notifications', USER, WORKSPACE_A);
    await expect(notifications?.get('entry')).resolves.toBeNull();
  });

  it('scopes a workspace cache to one member, not to the whole workspace', async () => {
    await seedEveryCache(USER, WORKSPACE_A, 'mine');
    await expect(readEveryCache(OTHER_USER, WORKSPACE_A)).resolves.toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('cache invalidation on workspace switch', () => {
  it('purges the previous workspace and leaves every other scope intact', async () => {
    const h = harness();
    await persistProvenActiveWorkspaceSelection(h.db, USER, WORKSPACE_A);
    await flush();

    await seedEveryCache(USER, WORKSPACE_A, 'from-a');
    await seedEveryCache(USER, WORKSPACE_B, 'from-b');
    await seedEveryCache(OTHER_USER, WORKSPACE_A, 'theirs');

    await persistProvenActiveWorkspaceSelection(h.db, USER, WORKSPACE_B);
    await flush();

    await expect(readEveryCache(USER, WORKSPACE_A)).resolves.toEqual([null, null, null, null]);
    await expect(readEveryCache(USER, WORKSPACE_B)).resolves.toEqual([
      'from-b',
      'from-b',
      'from-b',
      'from-b',
    ]);
    await expect(readEveryCache(OTHER_USER, WORKSPACE_A)).resolves.toEqual([
      'theirs',
      'theirs',
      'theirs',
      'theirs',
    ]);
  });

  it('does not purge when the selection is rewritten to the same workspace', async () => {
    const h = harness();
    await persistProvenActiveWorkspaceSelection(h.db, USER, WORKSPACE_A);
    await flush();
    await seedEveryCache(USER, WORKSPACE_A, 'from-a');

    await persistProvenActiveWorkspaceSelection(h.db, USER, WORKSPACE_A);
    await flush();

    await expect(readEveryCache(USER, WORKSPACE_A)).resolves.toEqual([
      'from-a',
      'from-a',
      'from-a',
      'from-a',
    ]);
  });

  it('purges every cache of the scope in one call', async () => {
    await seedEveryCache(USER, WORKSPACE_A, 'from-a');
    await expect(invalidateWorkspaceScopedCaches(USER, WORKSPACE_A)).resolves.toBe(
      SCOPED_CACHES.length,
    );
    await expect(readEveryCache(USER, WORKSPACE_A)).resolves.toEqual([null, null, null, null]);
  });

  it('stays quiet when the key-value backend is unavailable', async () => {
    mocks.getKeyValueStore.mockImplementation(() => {
      throw new Error('no redis');
    });
    await expect(invalidateWorkspaceScopedCaches(USER, WORKSPACE_A)).resolves.toBe(0);
    expect(getWorkspaceScopedCache('notifications', USER, WORKSPACE_A)).toBeNull();
  });
});

describe('in-flight requests across a workspace switch', () => {
  it('refuses to continue a request bound to a workspace the member has left', async () => {
    const h = harness();
    h.query.mockResolvedValue([{ organization_id: WORKSPACE_B }]);

    await expect(assertWorkspaceBindingCurrent(h.db, USER, WORKSPACE_A)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('continues a request whose binding still matches the active workspace', async () => {
    const h = harness();
    h.query.mockResolvedValue([{ organization_id: WORKSPACE_A }]);

    await expect(assertWorkspaceBindingCurrent(h.db, USER, WORKSPACE_A)).resolves.toBeUndefined();
  });
});

describe('workspaceCacheScope', () => {
  it('carries the member and the cache so two scopes never collide', () => {
    expect(workspaceCacheScope(USER, WORKSPACE_A, 'notifications')).toEqual({
      workspaceId: WORKSPACE_A,
      userId: USER,
      cacheId: 'notifications',
    });
    expect(workspaceCacheScope(USER, null)).toEqual({
      workspaceId: null,
      userId: USER,
      cacheId: undefined,
    });
  });
});

import { describe, expect, it } from 'vitest';

import { createMemoryKeyValueStore } from '../adapters/memory';
import { defineCacheRegistry } from '../cache-registry';
import { KeyValueConfigError } from '../types';
import {
  createWorkspaceKeyValueStore,
  isWorkspaceScopedKey,
  purgeWorkspaceCache,
  workspaceCacheKey,
  workspaceCacheMatch,
  workspaceCacheNamespace,
} from '../workspace-namespace';

const WORKSPACE_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_B = '22222222-2222-4222-8222-222222222222';

describe('workspace cache namespace', () => {
  it('gives the personal workspace its own namespace rather than no namespace', () => {
    expect(workspaceCacheNamespace({ workspaceId: null })).toBe('ws:personal');
    expect(workspaceCacheNamespace({ workspaceId: WORKSPACE_A })).toBe(`ws:${WORKSPACE_A}`);
    expect(workspaceCacheNamespace({ workspaceId: null, userId: 'user-1' })).toBe(
      'ws:personal:u:user-1',
    );
  });

  it('refuses a scope segment that could escape its own namespace', () => {
    expect(() => workspaceCacheNamespace({ workspaceId: `${WORKSPACE_A}:u:victim` })).toThrow(
      KeyValueConfigError,
    );
    expect(() => workspaceCacheNamespace({ workspaceId: WORKSPACE_A, userId: '*' })).toThrow(
      KeyValueConfigError,
    );
    expect(() => workspaceCacheKey({ workspaceId: WORKSPACE_A }, '')).toThrow(KeyValueConfigError);
  });

  it('keeps two workspaces from reading each other through the same store', async () => {
    const backing = createMemoryKeyValueStore();
    const a = createWorkspaceKeyValueStore(backing, { workspaceId: WORKSPACE_A, userId: 'user-1' });
    const b = createWorkspaceKeyValueStore(backing, { workspaceId: WORKSPACE_B, userId: 'user-1' });

    await a.set('personalization:profile', { tone: 'terse' });
    await b.set('personalization:profile', { tone: 'formal' });

    await expect(a.get('personalization:profile')).resolves.toEqual({ tone: 'terse' });
    await expect(b.get('personalization:profile')).resolves.toEqual({ tone: 'formal' });
  });

  it('cannot be made to name another workspace by a crafted key', async () => {
    const backing = createMemoryKeyValueStore();
    const victim = createWorkspaceKeyValueStore(backing, { workspaceId: WORKSPACE_B });
    await victim.set('notifications:unread', 7);

    const attacker = createWorkspaceKeyValueStore(backing, { workspaceId: WORKSPACE_A });
    await expect(attacker.get(`../ws:${WORKSPACE_B}:notifications:unread`)).resolves.toBeNull();
    await expect(victim.get('notifications:unread')).resolves.toBe(7);
  });

  it('scopes scan matches and returns keys relative to the namespace', async () => {
    const backing = createMemoryKeyValueStore();
    const a = createWorkspaceKeyValueStore(backing, { workspaceId: WORKSPACE_A });
    const b = createWorkspaceKeyValueStore(backing, { workspaceId: WORKSPACE_B });
    await a.set('search-index:recent', 1);
    await b.set('search-index:recent', 2);

    const page = await a.scan('0', { match: 'search-index:*', count: 10 });
    expect(page.keys).toEqual(['search-index:recent']);
  });

  it('scopes batched commands to the namespace', async () => {
    const backing = createMemoryKeyValueStore();
    const a = createWorkspaceKeyValueStore(backing, { workspaceId: WORKSPACE_A });
    await a.batch().set('schedules:next', 'run-1').increment('schedules:count').exec();

    await expect(backing.get(`ws:${WORKSPACE_A}:schedules:next`)).resolves.toBe('run-1');
    await expect(backing.get(`ws:${WORKSPACE_B}:schedules:next`)).resolves.toBeNull();
  });

  it('purges only the switched-away workspace', async () => {
    const backing = createMemoryKeyValueStore();
    const scopeA = { workspaceId: WORKSPACE_A, userId: 'user-1' };
    const a = createWorkspaceKeyValueStore(backing, scopeA);
    const b = createWorkspaceKeyValueStore(backing, { workspaceId: WORKSPACE_B, userId: 'user-1' });
    const other = createWorkspaceKeyValueStore(backing, {
      workspaceId: WORKSPACE_A,
      userId: 'user-2',
    });

    await a.set('personalization:profile', { tone: 'terse' });
    await a.set('notifications:unread', 3);
    await b.set('notifications:unread', 9);
    await other.set('notifications:unread', 4);

    await expect(purgeWorkspaceCache(backing, scopeA)).resolves.toBe(2);
    await expect(a.get('personalization:profile')).resolves.toBeNull();
    await expect(a.get('notifications:unread')).resolves.toBeNull();
    await expect(b.get('notifications:unread')).resolves.toBe(9);
    await expect(other.get('notifications:unread')).resolves.toBe(4);
  });

  it('recognises its own keys', () => {
    const scope = { workspaceId: WORKSPACE_A, userId: 'user-1' };
    expect(isWorkspaceScopedKey(workspaceCacheKey(scope, 'a'), scope)).toBe(true);
    expect(isWorkspaceScopedKey('ws:personal:u:user-1:a', scope)).toBe(false);
    expect(workspaceCacheMatch(scope)).toBe(`ws:${WORKSPACE_A}:u:user-1:*`);
  });
});

describe('cache registry', () => {
  it('rejects a duplicate namespace and a cache with no invalidation trigger', () => {
    expect(() =>
      defineCacheRegistry([
        {
          id: 'a',
          namespace: 'shared',
          sourceOfTruth: 'postgres',
          workspaceScoped: true,
          invalidatedBy: ['ttl'],
        },
        {
          id: 'b',
          namespace: 'shared',
          sourceOfTruth: 'postgres',
          workspaceScoped: true,
          invalidatedBy: ['ttl'],
        },
      ]),
    ).toThrow(KeyValueConfigError);

    expect(() =>
      defineCacheRegistry([
        {
          id: 'a',
          namespace: 'a',
          sourceOfTruth: 'postgres',
          workspaceScoped: false,
          invalidatedBy: [],
        },
      ]),
    ).toThrow(KeyValueConfigError);
  });

  it('lists the workspace-scoped caches a switch must purge', () => {
    const registry = defineCacheRegistry([
      {
        id: 'personalization',
        namespace: 'personalization',
        sourceOfTruth: 'postgres',
        workspaceScoped: true,
        invalidatedBy: ['workspace-switch', 'record-write'],
      },
      {
        id: 'model-catalog',
        namespace: 'catalog',
        sourceOfTruth: 'provider',
        workspaceScoped: false,
        invalidatedBy: ['ttl'],
      },
    ]);

    expect(registry.workspaceScoped().map((cache) => cache.id)).toEqual(['personalization']);
    expect(registry.get('model-catalog')?.sourceOfTruth).toBe('provider');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ getKeyValueStore: vi.fn() }));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));

import {
  createUpstashKeyValueStore,
  type KeyValueStore,
  type UpstashRedisLike,
} from '@agiworkforce/key-value';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  persistActiveWorkspaceSelection,
  persistProvenActiveWorkspaceSelection,
  resolveActiveOrganizationId,
  resolveOrganizationMembershipId,
  touchesActiveOrganizationNamespace,
} from '../active-workspace-service';

function asKeyValueStore(client: unknown): KeyValueStore {
  return createUpstashKeyValueStore(client as UpstashRedisLike);
}

function fakeCacheRedis() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  };
}

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function harness() {
  const query = vi.fn();
  const execute = vi.fn();
  return {
    db: { query, execute } as unknown as DatabaseAdapter,
    query,
    execute,
  };
}

describe('active workspace persistence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only a durable selection backed by a current membership', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]);

    await expect(resolveActiveOrganizationId(h.db, 'user-1')).resolves.toBe(ORGANIZATION_ID);
    expect(String(h.query.mock.calls[0]?.[0])).toContain('join public.organization_members');
  });

  it('uses an explicit Personal selector instead of following a later active workspace', async () => {
    const h = harness();
    const request = { headers: new Headers({ 'x-agi-organization-id': 'personal' }) };

    await expect(resolveActiveOrganizationId(h.db, 'user-1', request)).resolves.toBeNull();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('re-proves an explicit organization selector and fails closed when membership is absent', async () => {
    const h = harness();
    const request = {
      headers: new Headers({ 'x-agi-organization-id': ORGANIZATION_ID }),
    };
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]);

    await expect(resolveActiveOrganizationId(h.db, 'user-1', request)).resolves.toBe(
      ORGANIZATION_ID,
    );
    expect(h.query).toHaveBeenCalledWith(expect.stringContaining('organization_members'), [
      ORGANIZATION_ID,
      'user-1',
    ]);

    h.query.mockResolvedValueOnce([]);
    await expect(resolveActiveOrganizationId(h.db, 'user-1', request)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('rejects a malformed explicit selector instead of falling back to Personal', async () => {
    const h = harness();
    const request = { headers: new Headers({ 'x-agi-organization-id': 'not-a-workspace' }) };

    await expect(resolveActiveOrganizationId(h.db, 'user-1', request)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(h.query).not.toHaveBeenCalled();
  });

  it('revalidates an explicit workspace selector and rejects malformed ids before SQL', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]);

    await expect(resolveOrganizationMembershipId(h.db, 'user-1', ORGANIZATION_ID)).resolves.toBe(
      ORGANIZATION_ID,
    );
    expect(h.query).toHaveBeenCalledWith(expect.stringContaining('organization_members'), [
      ORGANIZATION_ID,
      'user-1',
    ]);

    h.query.mockClear();
    await expect(resolveOrganizationMembershipId(h.db, 'user-1', 'not-an-id')).resolves.toBeNull();
    expect(h.query).not.toHaveBeenCalled();
  });

  it('rejects an organization that the account does not belong to', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([]);

    await expect(
      persistActiveWorkspaceSelection(h.db, 'user-1', ORGANIZATION_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('creates a missing workspace object while preserving existing settings and workspace keys', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]);

    await persistActiveWorkspaceSelection(h.db, 'user-1', ORGANIZATION_ID);

    const [sql, params] = h.execute.mock.calls[0] ?? [];
    expect(String(sql)).toContain("settings -> 'workspace'");
    expect(String(sql)).toContain("|| jsonb_build_object('activeOrganizationId'");
    expect(String(sql)).not.toContain('jsonb_set(');
    expect(params).toEqual(['user-1', ORGANIZATION_ID]);
  });

  it('writes Personal without a membership lookup', async () => {
    const h = harness();

    await persistActiveWorkspaceSelection(h.db, 'user-1', null);

    expect(h.query).not.toHaveBeenCalled();
    expect(h.execute).toHaveBeenCalledWith(expect.any(String), ['user-1', 'personal']);
  });

  it('supports an exact membership already proven in the same transaction', async () => {
    const h = harness();

    await persistProvenActiveWorkspaceSelection(h.db, 'user-1', ORGANIZATION_ID);

    expect(h.query).not.toHaveBeenCalled();
    expect(h.execute).toHaveBeenCalledWith(expect.any(String), ['user-1', ORGANIZATION_ID]);
  });
});

describe('active workspace persistence, warm Redis cache', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves the active organization from Postgres once across two consecutive calls', async () => {
    const h = harness();
    h.query.mockResolvedValue([{ organization_id: ORGANIZATION_ID }]);
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeCacheRedis()));

    await expect(resolveActiveOrganizationId(h.db, 'user-1')).resolves.toBe(ORGANIZATION_ID);
    await expect(resolveActiveOrganizationId(h.db, 'user-1')).resolves.toBe(ORGANIZATION_ID);

    expect(h.query).toHaveBeenCalledTimes(1);
  });

  it('refreshes the cache immediately when the selection is written', async () => {
    const h = harness();
    h.query.mockResolvedValueOnce([{ organization_id: ORGANIZATION_ID }]);
    mocks.getKeyValueStore.mockReturnValue(asKeyValueStore(fakeCacheRedis()));

    await persistActiveWorkspaceSelection(h.db, 'user-1', ORGANIZATION_ID);
    h.query.mockClear();

    await expect(resolveActiveOrganizationId(h.db, 'user-1')).resolves.toBe(ORGANIZATION_ID);
    expect(h.query).not.toHaveBeenCalled();
  });
});

describe('touchesActiveOrganizationNamespace', () => {
  it('is true for a delta carrying the workspace namespace', () => {
    expect(touchesActiveOrganizationNamespace({ workspace: { activeOrganizationId: 'x' } })).toBe(
      true,
    );
  });

  it('is false for a delta with unrelated namespaces', () => {
    expect(touchesActiveOrganizationNamespace({ appearance: { theme: 'dark' } })).toBe(false);
  });

  it('is false for an empty or missing delta', () => {
    expect(touchesActiveOrganizationNamespace({})).toBe(false);
    expect(touchesActiveOrganizationNamespace(null)).toBe(false);
    expect(touchesActiveOrganizationNamespace(undefined)).toBe(false);
  });
});

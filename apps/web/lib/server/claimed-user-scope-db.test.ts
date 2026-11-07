import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

import { createClaimedUserScopedDb } from './claimed-user-scope-db';

function harness() {
  const query = vi.fn(async (sql: string) =>
    sql.includes("set_config('request.jwt.claim.sub'") ? [] : [{ id: 'owned-row' }],
  );
  const execute = vi.fn(async () => 0);
  const tx = { query, execute } as unknown as DatabaseAdapter;
  const serviceDb = {
    transaction: vi.fn(async (callback: (db: DatabaseAdapter) => Promise<unknown>) => callback(tx)),
  } as unknown as DatabaseAdapter;
  return { serviceDb, query, execute };
}

describe('claimed background user scope', () => {
  it('runs each operation as app_rls with the claimed user and organization', async () => {
    const { serviceDb, query, execute } = harness();
    const scoped = createClaimedUserScopedDb(serviceDb, {
      userId: 'user-1',
      organizationId: '11111111-1111-4111-8111-111111111111',
    });

    await expect(scoped.query('select id from managed_usage_requests')).resolves.toEqual([
      { id: 'owned-row' },
    ]);

    expect(execute).toHaveBeenNthCalledWith(1, 'set local role app_rls');
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user-1', '11111111-1111-4111-8111-111111111111'],
    );
    expect(query).toHaveBeenNthCalledWith(2, 'select id from managed_usage_requests', []);
  });

  it('binds Personal scope explicitly as an empty organization GUC', async () => {
    const { serviceDb, query } = harness();
    const scoped = createClaimedUserScopedDb(serviceDb, {
      userId: 'user-1',
      organizationId: null,
    });

    await scoped.execute('update managed_usage_requests set status = status');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('request.jwt.claim.org_id'), [
      'user-1',
      '',
    ]);
  });

  it('rejects a malformed claimed organization before opening a transaction', () => {
    const { serviceDb } = harness();

    expect(() =>
      createClaimedUserScopedDb(serviceDb, {
        userId: 'user-1',
        organizationId: 'not-an-organization-id',
      }),
    ).toThrow(/organization scope is invalid/i);
    expect(serviceDb.transaction).not.toHaveBeenCalled();
  });
});

describe('claimed scope cancellation before dispatch', () => {
  const scope = { userId: 'user-1', organizationId: null };

  it.each(['query', 'execute', 'transaction'] as const)(
    'does not dispatch %s when cancellation arrives during claim binding',
    async (operation) => {
      const { serviceDb, query, execute } = harness();
      const controller = new AbortController();
      const reason = new Error('Stopped during claim binding');
      query.mockImplementationOnce(async () => {
        controller.abort(reason);
        return [];
      });
      const callback = vi.fn(async () => 'receipt');
      const scoped = createClaimedUserScopedDb(serviceDb, scope, { signal: controller.signal });
      const result =
        operation === 'transaction'
          ? scoped.transaction(callback)
          : scoped[operation]('update user_memories set pinned = true');

      await expect(result).rejects.toBe(reason);
      expect(query).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(callback).not.toHaveBeenCalled();
    },
  );

  it('rejects an already stopped operation before acquiring a transaction', async () => {
    const { serviceDb } = harness();
    const controller = new AbortController();
    controller.abort();
    const scoped = createClaimedUserScopedDb(serviceDb, scope, { signal: controller.signal });
    await expect(scoped.query('select 1')).rejects.toBe(controller.signal.reason);
    expect(serviceDb.transaction).not.toHaveBeenCalled();
  });

  it('keeps a successful receipt when cancellation arrives after query dispatch', async () => {
    const { serviceDb, query } = harness();
    const controller = new AbortController();
    query.mockImplementation(async (sql) => {
      if (sql.includes('set_config')) return [];
      controller.abort();
      return [{ id: 'written-row' }];
    });
    const scoped = createClaimedUserScopedDb(serviceDb, scope, { signal: controller.signal });
    await expect(
      scoped.query('update user_memories set pinned = true returning id'),
    ).resolves.toEqual([{ id: 'written-row' }]);
  });

  it('retains cancellation when rebinding the organization', async () => {
    const { serviceDb } = harness();
    const controller = new AbortController();
    const scoped = createClaimedUserScopedDb(serviceDb, scope, { signal: controller.signal });
    const rebound = scoped.withOrg!(null);
    controller.abort();
    await expect(rebound.query('select 1')).rejects.toBe(controller.signal.reason);
    expect(serviceDb.transaction).not.toHaveBeenCalled();
  });
});

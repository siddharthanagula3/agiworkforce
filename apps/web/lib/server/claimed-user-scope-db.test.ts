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

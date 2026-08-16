import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ClaimedUserScope {
  userId: string;
  organizationId: string | null;
}

function assertClaimedScope(scope: ClaimedUserScope): void {
  if (!scope.userId.trim() || scope.userId.length > 255) {
    throw new Error('Claimed user scope is invalid');
  }
  if (scope.organizationId !== null && !UUID_RE.test(scope.organizationId)) {
    throw new Error('Claimed organization scope is invalid');
  }
}

async function bindClaimedScope(db: DatabaseAdapter, scope: ClaimedUserScope): Promise<void> {
  await db.execute('set local role app_rls');
  await db.query(
    `select set_config('request.jwt.claim.sub', $1, true),
            set_config('request.jwt.claim.org_id', $2, true)`,
    [scope.userId, scope.organizationId ?? ''],
  );
}

export function createClaimedUserScopedDb(
  serviceDb: DatabaseAdapter,
  scope: ClaimedUserScope,
): DatabaseAdapter {
  assertClaimedScope(scope);

  return {
    query: <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
      serviceDb.transaction(async (tx) => {
        await bindClaimedScope(tx, scope);
        return tx.query<T>(sql, params);
      }),
    execute: (sql: string, params: unknown[] = []) =>
      serviceDb.transaction(async (tx) => {
        await bindClaimedScope(tx, scope);
        return tx.execute(sql, params);
      }),
    transaction: <T>(callback: (tx: DatabaseAdapter) => Promise<T>) =>
      serviceDb.transaction(async (tx) => {
        await bindClaimedScope(tx, scope);
        return callback(tx);
      }),
    withUser: () => {
      throw new Error('Claimed background scope cannot be rebound to another user');
    },
    withOrg: (organizationId: string | null) =>
      createClaimedUserScopedDb(serviceDb, { ...scope, organizationId }),
    dispose: async () => {},
  };
}

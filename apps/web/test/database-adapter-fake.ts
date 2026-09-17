import type { DatabaseAdapter } from '@agiworkforce/data-layer';

/**
 * A complete `DatabaseAdapter` for tests that only care about one or two of its
 * members. The scoping members return the same handle, so a caller that binds a
 * user or an organization still reaches the overrides the test supplied, and
 * `transaction` runs its callback against that same handle rather than a bare
 * stub the overrides never reached.
 */
export function createDatabaseAdapterFake(
  overrides: Partial<DatabaseAdapter> = {},
): DatabaseAdapter {
  const adapter: DatabaseAdapter = {
    query: async () => [],
    execute: async () => 0,
    transaction: async <T>(run: (tx: DatabaseAdapter) => Promise<T>): Promise<T> => run(adapter),
    withUser: () => adapter,
    withOrg: () => adapter,
    dispose: async () => {},
    ...overrides,
  };
  return adapter;
}

/**
 * A caller who holds a seat in `organizationId` and nothing else: membership
 * reads name that organization, and every other read (settings, policy, billing
 * contract, spend limit) finds no row. Workspace policy gates fail closed on a
 * read they cannot parse, so a test that scopes a request to an organization
 * needs the membership answer rather than a stub that returns undefined.
 */
export function createWorkspaceMemberDatabaseFake(
  organizationId: string,
  overrides: Partial<DatabaseAdapter> = {},
): DatabaseAdapter {
  return createDatabaseAdapterFake({
    query: (async (sql: string) =>
      /from public\.organization_members\b/.test(sql)
        ? [{ organization_id: organizationId }]
        : []) as DatabaseAdapter['query'],
    ...overrides,
  });
}

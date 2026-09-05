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

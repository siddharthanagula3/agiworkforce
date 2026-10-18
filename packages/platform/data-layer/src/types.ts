/**
 * @file types.ts
 * @module @agiworkforce/data-layer/types
 *
 * The persistence contract feature code relies on. Object storage has its own
 * port in `@agiworkforce/object-storage` and identity has its own in
 * `@agiworkforce/identity`. No provider SDK types leak through these
 * interfaces; adapter methods reject on failure, and every adapter is created
 * through `createDatabaseClient()` so per-request scoping needs no globals.
 */

export type DatabaseConnectionErrorScope = 'pool' | 'client';

export interface DatabaseConnectionErrorEvent {
  scope: DatabaseConnectionErrorScope;
  applicationName?: string;
  error: unknown;
}

export type DatabaseConnectionErrorListener = (event: DatabaseConnectionErrorEvent) => void;

export interface DatabaseConnectionConfig {
  connectionString: string;
  poolSize?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
  queryTimeoutMs?: number;
  applicationName?: string;
  onConnectionError?: DatabaseConnectionErrorListener;
}

/**
 * Generic relational database adapter. RLS-aware via `withUser()`.
 *
 * All methods are parameterized, never concatenate user input into SQL.
 *
 * @example
 *   const db = createDatabaseClient({ provider: 'neon' });
 *   const userDb = db.withUser(jwt);
 *   const rows = await userDb.query<{ id: string }>(
 *     'select id from conversations where user_id = $1',
 *     [userId],
 *   );
 */
export interface DatabaseAdapter {
  /**
   * Run a parameterized SELECT. Returns typed rows.
   *
   * @param sql - SQL with `$1, $2, ...` placeholders.
   * @param params - Values bound to the placeholders.
   * @throws if the query fails or the connection is dropped.
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  execute(sql: string, params?: unknown[]): Promise<number>;

  transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;

  withUser(jwt: string): DatabaseAdapter;

  /**
   * Bind the ACTIVE organization for tenancy-scoped policies. Returns a NEW
   * adapter; does not mutate the receiver. Pass `null` for a purely personal
   * scope.
   *
   * Composes with {@link withUser} in either order. The organization is a
   * SCOPE SELECTOR, not a grant: authorization is resolved in the database
   * from the membership table, so binding an organization the subject does not
   * belong to yields no additional visibility.
   */
  withOrg(organizationId: string | null): DatabaseAdapter;

  dispose(): Promise<void>;
}

/**
 * Database providers selectable by the runtime factory. `neon` speaks the Neon
 * serverless WebSocket protocol and runs on edge runtimes; `postgres` speaks
 * plain TCP through `pg` and reaches any Postgres host. Both implement the same
 * contract, so the host swap is provider selection plus credentials.
 */
export type DatabaseProvider = 'neon' | 'postgres';

export class DataLayerConfigError extends Error {
  constructor(message: string) {
    super(`@agiworkforce/data-layer config error: ${message}`);
    this.name = 'DataLayerConfigError';
  }
}

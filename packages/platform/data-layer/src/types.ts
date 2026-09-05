/**
 * @file types.ts
 * @module @agiworkforce/data-layer/types
 *
 * # Cloud-provider-portable data layer interfaces
 *
 * These interfaces are the **only** contract feature code should rely on for
 * persistence, auth, and pub/sub. Object storage has its own port in
 * `@agiworkforce/object-storage`. Hosted account data is wired
 * to Neon for Postgres and Clerk for identity; future providers must be added
 * through adapters, not direct SDK calls in app features.
 *
 * ## Design rules
 *
 * 1. **Vendor-neutral.** No provider SDK types leak through
 *    these interfaces.
 * 2. **Minimal surface.** Add a method only when at least one concrete adapter
 *    can implement it cheaply. Don't pre-design for hypothetical providers.
 * 3. **Async everywhere.** Even local-mode adapters (SQLite-backed) return
 *    promises so cloud adapters drop in without callsite changes.
 * 4. **Errors are throwable.** Adapter methods reject on failure; no
 *    `Result<T, E>` plumbing. Callers wrap in their own error envelopes
 *    (e.g. Next.js `withErrorHandler`).
 * 5. **No globals.** Every adapter is created via `createDatabaseClient()` /
 *    `createAuthClient()` / etc. so multi-tenant or per-request scoping is
 *    trivial.
 *
 * ## When you add a new method
 *
 * - Add it to the interface here with a JSDoc explaining the contract.
 * - Implement it in the active adapter (`adapters/neon.ts` for hosted DB,
 *   `adapters/clerk.ts` for hosted auth).
 * - Stub future adapters with `throw new NotImplementedError(...)`.
 * - Add a unit test in `src/__tests__/`.
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

export interface VerifiedJwt {
  userId: string;
  email?: string;
  raw?: Record<string, unknown>;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

export interface AuthAdapter {
  verifyJwt(token: string): Promise<VerifiedJwt | null>;

  refreshToken?(refreshToken: string): Promise<RefreshedTokens | null>;
}

/**
 * Realtime adapter for low-latency pub/sub. Not durable, for durable queues
 * use a separate adapter (TODO: add `QueueAdapter` when we ship background jobs).
 *
 * Implementations:
 * - Pusher: `channel.bind(event, ...)`.
 * - Ably: `channel.subscribe(name, ...)`.
 * - Self-hosted ws: thin wrapper over a single websocket connection.
 */
export interface RealtimeAdapter {
  subscribe(channel: string, onMessage: (payload: unknown) => void): () => void;

  publish(channel: string, payload: unknown): Promise<void>;
}

/**
 * Database providers selectable by the runtime factory. Raw Postgres has a
 * skeleton adapter exported for migration work, but it is not production
 * selectable until implemented.
 */
export type DatabaseProvider = 'neon';

export type AuthProvider = 'auth0' | 'clerk' | 'cognito';

export type RealtimeProvider = 'pusher' | 'ably' | 'self-hosted';

export interface DataLayerConfig {
  database: { provider: DatabaseProvider } & Partial<DatabaseConnectionConfig>;
  auth: { provider: AuthProvider } & Record<string, unknown>;
  realtime: { provider: RealtimeProvider } & Record<string, unknown>;
}

export class NotImplementedError extends Error {
  constructor(adapterName: string, methodName: string, migrationGuide?: string) {
    const guide = migrationGuide ? `\n\nMigration guide:\n${migrationGuide}` : '';
    super(
      `${adapterName} adapter does not implement ${methodName}() yet. ` +
        `See packages/platform/data-layer/src/adapters/${adapterName.toLowerCase()}.ts ` +
        `for the implementation checklist.${guide}`,
    );
    this.name = 'NotImplementedError';
  }
}

export class DataLayerConfigError extends Error {
  constructor(message: string) {
    super(`@agiworkforce/data-layer config error: ${message}`);
    this.name = 'DataLayerConfigError';
  }
}

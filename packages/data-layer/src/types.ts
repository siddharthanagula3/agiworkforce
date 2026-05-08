/**
 * @file types.ts
 * @module @agiworkforce/data-layer/types
 *
 * # Cloud-provider-portable data layer interfaces
 *
 * These interfaces are the **only** contract feature code should rely on for
 * persistence, auth, blob storage, and pub/sub. The codebase is wired to
 * Supabase today; tomorrow we should be able to swap to Neon, RDS, S3,
 * Auth0, Pusher, etc. by swapping adapter implementations — NOT by rewriting
 * feature code.
 *
 * ## Design rules
 *
 * 1. **Vendor-neutral.** No Supabase, Postgres, S3, or Auth0 types leak through
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
 * - Implement it in `adapters/supabase.ts` (today's default).
 * - Stub it in `adapters/neon.ts` and `adapters/postgres.ts` with
 *   `throw new NotImplementedError(...)`.
 * - Add a unit test in `src/__tests__/`.
 */

// ============================================================================
// Database (relational, RLS-aware)
// ============================================================================

/**
 * Connection string + options for any Postgres-compatible backend.
 *
 * - Supabase: `postgresql://postgres:[pwd]@db.[ref].supabase.co:5432/postgres`
 * - Neon: `postgresql://[user]:[pwd]@[project].neon.tech/[db]?sslmode=require`
 * - RDS: `postgresql://[user]:[pwd]@[host]:5432/[db]`
 * - PlanetScale: not Postgres-compatible (MySQL); needs separate adapter.
 */
export interface DatabaseConnectionConfig {
  /** Postgres-compatible connection string. */
  connectionString: string;
  /** Pool size (defaults to provider sensible default). */
  poolSize?: number;
  /** Statement timeout in ms (defaults to 30s). */
  statementTimeoutMs?: number;
  /** Per-call query timeout in ms. */
  queryTimeoutMs?: number;
  /** Application name for connection logs. */
  applicationName?: string;
}

/**
 * Generic relational database adapter. RLS-aware via `withUser()`.
 *
 * All methods are parameterized — never concatenate user input into SQL.
 *
 * @example
 *   const db = createDatabaseClient({ provider: 'supabase' });
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

  /**
   * Run a parameterized INSERT / UPDATE / DELETE. Returns affected row count.
   *
   * For RETURNING queries, use `query<T>()` instead — `execute()` is for
   * mutation calls where the caller only needs the count.
   */
  execute(sql: string, params?: unknown[]): Promise<number>;

  /**
   * Run a callback inside a transaction. Commits on resolve, rolls back on
   * throw. The `tx` adapter passed to `fn` must be used for all queries
   * inside the transaction — DO NOT mix in the outer adapter, or you'll
   * leave the transaction.
   *
   * Note: not every backend supports nested transactions. Adapters MAY use
   * SAVEPOINTS internally; assume one level of nesting is safe.
   */
  transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;

  /**
   * Bind a user JWT for the lifetime of the returned adapter. RLS policies
   * see `auth.uid()` / equivalent. Returns a NEW adapter — does not mutate
   * the receiver.
   *
   * The original (unscoped) adapter remains usable for service-context
   * operations (Stripe webhooks, cron jobs).
   */
  withUser(jwt: string): DatabaseAdapter;

  /**
   * Release any pooled connections / open handles. Safe to call multiple
   * times. After dispose, all methods reject.
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Auth
// ============================================================================

/**
 * Verified token claims. Adapters that bring extra claims (org id, custom
 * scopes) MAY return additional fields, but `userId` is always present.
 */
export interface VerifiedJwt {
  userId: string;
  email?: string;
  /** Provider-specific claims. Inspect with care; not normalized. */
  raw?: Record<string, unknown>;
}

/**
 * Refreshed access + refresh token pair. Returned by `refreshToken()`.
 */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix epoch seconds when the access token expires. */
  expiresAt?: number;
}

/**
 * Auth adapter. Verifies JWTs minted by the upstream identity provider
 * and refreshes expired access tokens.
 *
 * Implementations:
 * - Supabase: calls `auth.getUser(token)` on the auth schema.
 * - Auth0 / Clerk: verifies signature against published JWKS.
 * - Cognito: verifies against AWS-published JWKS for the user pool.
 *
 * Sign-up, password reset, OAuth callback flows live OUTSIDE this interface
 * — they are surface-specific (web cookie flow, mobile PKCE flow). This
 * interface is the **server-side verify** layer that protects API routes.
 */
export interface AuthAdapter {
  /**
   * Verify a JWT issued by the identity provider. Returns null on bad
   * signature / expired / revoked. Throws on transient infra failure.
   */
  verifyJwt(token: string): Promise<VerifiedJwt | null>;

  /**
   * Trade a refresh token for a new access + refresh pair. Returns null on
   * invalid / revoked refresh token. Throws on transient infra failure.
   */
  refreshToken(refreshToken: string): Promise<RefreshedTokens | null>;
}

// ============================================================================
// Storage (blobs)
// ============================================================================

/** Result of a successful blob upload. */
export interface StoragePutResult {
  /** Canonical URL (may be unsigned/public or require signed-url to access). */
  url: string;
  /** Provider's content key (echoes back the input for chaining). */
  key: string;
}

/**
 * Storage adapter for blobs (file uploads, exports, attachment payloads).
 *
 * Bucket semantics are vendor-portable: if your Supabase setup has a
 * `user-uploads` bucket, the S3 / R2 adapter just maps it to a prefix or
 * a separate bucket. Bucket names should be short kebab-case strings.
 *
 * Implementations:
 * - Supabase: storage.from(bucket).upload(key, ...).
 * - S3: PutObjectCommand({ Bucket, Key, Body }).
 * - R2: same SDK as S3 with R2 endpoint.
 * - B2: native B2 SDK.
 */
export interface StorageAdapter {
  /**
   * Upload bytes. Overwrites if key exists. Returns the canonical URL — caller
   * must NOT assume the URL is publicly accessible; use `signedUrl()` for
   * private downloads.
   */
  put(bucket: string, key: string, data: Uint8Array): Promise<StoragePutResult>;

  /**
   * Download bytes. Returns null if the object doesn't exist. Throws on
   * permission / infra errors.
   */
  get(bucket: string, key: string): Promise<Uint8Array | null>;

  /** Delete the object. No-op if it doesn't exist. */
  delete(bucket: string, key: string): Promise<void>;

  /**
   * Mint a short-lived signed URL for downloading. TTL must be > 0.
   *
   * Adapters MAY clamp the TTL (S3 caps at 7 days for SigV4; Supabase at
   * 1 year). If the requested TTL is unsupportable, throw rather than
   * silently extending or shortening.
   */
  signedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string>;
}

// ============================================================================
// Realtime (pub/sub)
// ============================================================================

/**
 * Realtime adapter for low-latency pub/sub. Not durable — for durable queues
 * use a separate adapter (TODO: add `QueueAdapter` when we ship background jobs).
 *
 * Implementations:
 * - Supabase Realtime: `channel.on('broadcast', ...)`.
 * - Pusher: `channel.bind(event, ...)`.
 * - Ably: `channel.subscribe(name, ...)`.
 * - Self-hosted ws: thin wrapper over a single websocket connection.
 */
export interface RealtimeAdapter {
  /**
   * Subscribe to a channel. Returns an unsubscribe function. Calling it
   * MUST tear down server-side subscriptions and close any held sockets if
   * this was the last subscriber.
   */
  subscribe(channel: string, onMessage: (payload: unknown) => void): () => void;

  /**
   * Publish a payload to a channel. Resolves once the broker has accepted
   * the message — does NOT wait for delivery to subscribers.
   */
  publish(channel: string, payload: unknown): Promise<void>;
}

// ============================================================================
// Provider selection
// ============================================================================

/**
 * Database providers we have adapters for or are committed to building.
 * Add a new entry only when you also add an adapter file under `adapters/`.
 */
export type DatabaseProvider = 'supabase' | 'neon' | 'postgres';

/**
 * Auth providers. `supabase` is current. `auth0`, `clerk`, `cognito` are
 * skeletons documented in `docs/SCALING.md`.
 */
export type AuthProvider = 'supabase' | 'auth0' | 'clerk' | 'cognito';

/**
 * Storage providers. `supabase` is current. `s3` covers AWS + R2 + B2 +
 * MinIO (any S3-compatible backend).
 */
export type StorageProvider = 'supabase' | 's3' | 'r2' | 'b2';

/**
 * Realtime providers. `supabase` is current. `pusher` and `ably` are
 * documented migration targets.
 */
export type RealtimeProvider = 'supabase' | 'pusher' | 'ably' | 'self-hosted';

/**
 * Top-level configuration. The factory reads the provider field, picks an
 * adapter, and forwards the remaining config to its constructor.
 *
 * ENV resolution:
 * - `AGI_DATABASE_PROVIDER` -> `provider`
 * - `AGI_DATABASE_URL` or `DATABASE_URL` -> `connectionString`
 * - For Supabase: `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
 *   (server) / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser).
 */
export interface DataLayerConfig {
  database: { provider: DatabaseProvider } & Partial<DatabaseConnectionConfig> & {
      /** Supabase-specific: URL + key. */
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      supabaseServiceRoleKey?: string;
    };
  auth: { provider: AuthProvider } & Record<string, unknown>;
  storage: { provider: StorageProvider } & Record<string, unknown>;
  realtime: { provider: RealtimeProvider } & Record<string, unknown>;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Adapter says "I'm a skeleton — implement me before using." Thrown by
 * Neon and raw Postgres adapters today.
 */
export class NotImplementedError extends Error {
  constructor(adapterName: string, methodName: string, migrationGuide?: string) {
    const guide = migrationGuide ? `\n\nMigration guide:\n${migrationGuide}` : '';
    super(
      `${adapterName} adapter does not implement ${methodName}() yet. ` +
        `See packages/data-layer/src/adapters/${adapterName.toLowerCase()}.ts ` +
        `for the implementation checklist.${guide}`,
    );
    this.name = 'NotImplementedError';
  }
}

/** Configuration is malformed (missing keys, unknown provider, etc.). */
export class DataLayerConfigError extends Error {
  constructor(message: string) {
    super(`@agiworkforce/data-layer config error: ${message}`);
    this.name = 'DataLayerConfigError';
  }
}

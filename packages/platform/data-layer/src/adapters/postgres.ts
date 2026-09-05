/**
 * @file adapters/postgres.ts
 * @module @agiworkforce/data-layer/adapters/postgres
 *
 * # Raw Postgres adapter
 *
 * Targets any Postgres reachable over plain TCP: self-hosted, AWS RDS, GCP
 * Cloud SQL, Azure Database for Postgres, Neon's own non-serverless endpoint,
 * and a local Homebrew server during development. Built on `pg`, the canonical
 * Node driver.
 *
 * Behaviourally identical to `NeonDatabaseAdapter`: same config shape, same
 * transaction semantics, same tenant-scope preamble, same error mapping. The
 * differences are in the transport, not the contract:
 *
 * - **Connection model:** long-lived TCP through `pg.Pool`. It does not
 *   multiplex, so a serverless deployment needs external pooling (PgBouncer in
 *   `transaction` mode, or RDS Proxy) in front of it.
 * - **Runtime:** `pg` needs Node `net`/`tls`, so it does not run on Vercel Edge
 *   or Cloudflare Workers. Those runtimes need the Neon adapter.
 * - **TLS:** taken from the connection string. `pg` reads `sslmode` itself, so
 *   nothing here configures TLS beyond refusing an insecure string.
 *
 * ```bash
 * AGI_DATABASE_PROVIDER=postgres
 * AGI_DATABASE_URL=postgresql://user:pwd@host:5432/db?sslmode=require
 * ```
 *
 * ## RLS contract
 *
 * Identical to the Neon adapter and driven by the same shared preamble in
 * `./sql-session`: the bound subject and organization are written with
 * transaction-local `set_config(..., true)` under `SET LOCAL ROLE app_rls`, so
 * the policies in `apps/web/db/neon/0037_rls_user_isolation.sql` read them back
 * through `public.current_app_user_id()`.
 *
 * SECURITY: `withUser(jwt)` does NOT verify the JWT signature. It is
 * default-deny and throws unless the adapter is constructed with
 * `unsafeAllowUnverifiedJwtSubject: true`, which asserts the caller already
 * verified the token upstream.
 */

import type { Pool, PoolClient, QueryResult } from 'pg';
import {
  type DatabaseAdapter,
  type DatabaseConnectionConfig,
  type DatabaseConnectionErrorEvent,
  type DatabaseConnectionErrorScope,
  DataLayerConfigError,
} from '../types';
import {
  BEGIN_RLS_SCOPE_STATEMENT,
  BEGIN_STATEMENT,
  BIND_TENANT_SCOPE_STATEMENT,
  COMMIT_STATEMENT,
  NO_ORGANIZATION_SCOPE,
  ROLLBACK_STATEMENT,
  decodeJwtSub,
  withStatementContext,
} from './sql-session';

const POSTGRES_ADAPTER_NAME = 'Postgres';

type PostgresModule = typeof import('pg');

let _postgresModule: PostgresModule | null = null;

async function loadPostgres(): Promise<PostgresModule> {
  if (_postgresModule) return _postgresModule;
  try {
    _postgresModule = (await import('pg')) as PostgresModule;
  } catch (e) {
    throw new DataLayerConfigError(
      'Tried to use the Postgres adapter but pg is not installed. ' +
        'Run `pnpm add pg` in the consuming app, or set AGI_DATABASE_PROVIDER to a ' +
        'different provider. ' +
        `Underlying error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return _postgresModule;
}

const SSL_MODE_PARAM = 'sslmode';
const SSL_MODE_DISABLE = 'disable';
const SECURE_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

/**
 * SECURITY: `pg` speaks plaintext by default and silently stays plaintext when
 * the connection string says nothing about TLS, so a missing `sslmode` is not a
 * neutral default, it is credentials on the wire. Loopback is the one exemption:
 * a local development server never leaves the machine.
 */
function assertSecureConnectionString(connectionString: string): void {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DataLayerConfigError(
      'AGI_DATABASE_URL (or DATABASE_URL) is not a valid connection string. Expected ' +
        'postgresql://user:pwd@host:5432/db?sslmode=require.',
    );
  }

  if (isLoopbackHost(url.hostname)) return;

  const sslmode = url.searchParams.get(SSL_MODE_PARAM);
  if (sslmode === SSL_MODE_DISABLE) {
    throw new DataLayerConfigError(
      `AGI_DATABASE_URL (or DATABASE_URL) sets ${SSL_MODE_PARAM}=${SSL_MODE_DISABLE}, which ` +
        'explicitly asks for a plaintext connection to a remote host. Remove it, or point the ' +
        'connection string at a loopback address for local development.',
    );
  }

  if (!sslmode || !SECURE_SSL_MODES.has(sslmode)) {
    throw new DataLayerConfigError(
      `AGI_DATABASE_URL (or DATABASE_URL) must set ${SSL_MODE_PARAM}=require (or verify-ca / ` +
        'verify-full) so traffic is never sent unencrypted. The pg driver connects in plaintext ' +
        'when the connection string is silent about TLS. Add ' +
        `?${SSL_MODE_PARAM}=require to the connection string, or point it at a loopback address ` +
        'for local development.',
    );
  }
}

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * Below the driver's own 10s default so a pool sitting idle across a serverless
 * invocation gap closes its socket instead of handing the next invocation a
 * connection that already died in the freeze.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 5_000;

/**
 * `PoolClient.release(err)` destroys the connection instead of returning it to
 * the pool. Used only when a rollback failed, where the client may still carry
 * this request's transaction-local tenant scope and handing it to the next
 * checkout would leak one tenant's subject into another's query.
 */
const DESTROY_ON_RELEASE = new Error('postgres client released without a clean transaction');

export interface PostgresDatabaseAdapterConfig extends DatabaseConnectionConfig {
  pool?: Pool;
  poolPromise?: Promise<Pool>;
  /**
   * Opt in to the UNVERIFIED-JWT escape hatch.
   *
   * @internal SECURITY DEFAULT-DENY. `withUser(jwt)` decodes the `sub` claim of
   * the supplied token WITHOUT verifying its signature and binds it as the RLS
   * subject. If a caller forwards an attacker-minted JWT, the attacker picks the
   * `sub` and impersonates any user. So `withUser()` THROWS unless this flag is
   * explicitly set to `true`, forcing the integrator to acknowledge that the
   * token has already been signature-verified upstream.
   */
  unsafeAllowUnverifiedJwtSubject?: boolean;
}

export class PostgresDatabaseAdapter implements DatabaseAdapter {
  private poolPromise: Promise<Pool>;
  private boundSub: string | null = null;
  private boundOrgId: string | null = null;
  private disposed = false;
  private ownsPool: boolean;
  private readonly reportedErrors = new WeakSet<object>();
  private readonly guardedClients = new WeakSet<PoolClient>();

  constructor(private config: PostgresDatabaseAdapterConfig) {
    if (config.pool) {
      this.poolPromise = Promise.resolve(config.pool);
      this.ownsPool = true;
    } else if (config.poolPromise) {
      this.poolPromise = config.poolPromise;
      this.ownsPool = false;
    } else {
      assertSecureConnectionString(config.connectionString);
      this.poolPromise = (async () => {
        const mod = await loadPostgres();
        return this.guardTransportErrors(
          new mod.Pool({
            connectionString: config.connectionString,
            connectionTimeoutMillis: config.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
            idleTimeoutMillis: DEFAULT_IDLE_TIMEOUT_MS,
            ...(config.poolSize !== undefined ? { max: config.poolSize } : {}),
            ...(config.statementTimeoutMs !== undefined
              ? { statement_timeout: config.statementTimeoutMs }
              : {}),
            ...(config.queryTimeoutMs !== undefined
              ? { query_timeout: config.queryTimeoutMs }
              : {}),
            ...(config.applicationName !== undefined
              ? { application_name: config.applicationName }
              : {}),
          }),
        );
      })();
      this.ownsPool = true;
    }
  }

  private guardTransportErrors(pool: Pool): Pool {
    pool.on('error', (error: unknown) => this.reportTransportError('pool', error));
    return pool;
  }

  /**
   * The pool strips its own idle-error listener off a client for as long as it
   * is checked out, so without this a transport error during that window is
   * unhandled and crashes the process. `pool.connect()` can hand back a client
   * wired on an earlier checkout, hence the WeakSet.
   */
  private async checkoutClient(pool: Pool): Promise<PoolClient> {
    const client = await pool.connect();
    if (!this.guardedClients.has(client)) {
      this.guardedClients.add(client);
      client.on('error', (error: unknown) => this.reportTransportError('client', error));
    }
    return client;
  }

  private reportTransportError(scope: DatabaseConnectionErrorScope, error: unknown): void {
    if (typeof error === 'object' && error !== null) {
      if (this.reportedErrors.has(error)) return;
      this.reportedErrors.add(error);
    }
    const event: DatabaseConnectionErrorEvent = {
      scope,
      error,
      ...(this.config.applicationName !== undefined
        ? { applicationName: this.config.applicationName }
        : {}),
    };
    const report = this.config.onConnectionError;
    try {
      if (report) report(event);
      else console.error('postgres connection transport error', event);
    } catch {
      return;
    }
  }

  private async getPool(): Promise<Pool> {
    if (this.disposed) {
      throw new DataLayerConfigError('PostgresDatabaseAdapter is disposed');
    }
    return this.poolPromise;
  }

  /**
   * SECURITY: both statements below are transaction-local, so COMMIT and
   * ROLLBACK revert them on the pooled connection. Binding the tenant scope
   * outside a transaction would carry one request's subject into the next
   * checkout of the same client.
   */
  private async beginRlsScope(client: PoolClient): Promise<void> {
    if (this.boundSub === null) {
      await client.query(BEGIN_STATEMENT);
      return;
    }
    await client.query(BEGIN_RLS_SCOPE_STATEMENT);
    await client.query(BIND_TENANT_SCOPE_STATEMENT, [
      this.boundSub,
      this.boundOrgId ?? NO_ORGANIZATION_SCOPE,
    ]);
  }

  /**
   * Returns whether the client is safe to hand back to the pool. A client whose
   * ROLLBACK failed may still hold the tenant scope this request bound, so it is
   * destroyed rather than reused.
   */
  private static async rollbackQuietly(client: PoolClient): Promise<boolean> {
    try {
      await client.query(ROLLBACK_STATEMENT);
      return true;
    } catch {
      return false;
    }
  }

  private static releaseAfterFailure(client: PoolClient, rolledBack: boolean): void {
    if (rolledBack) client.release();
    else client.release(DESTROY_ON_RELEASE);
  }

  private async runScoped<T>(
    sql: string,
    params: unknown[],
    read: (result: QueryResult) => T,
  ): Promise<T> {
    const pool = await this.getPool();
    const client = await this.checkoutClient(pool);
    let rolledBack = false;
    try {
      await this.beginRlsScope(client);
      const result = (await client.query(sql, params)) as QueryResult;
      await client.query(COMMIT_STATEMENT);
      client.release();
      return read(result);
    } catch (err) {
      rolledBack = await PostgresDatabaseAdapter.rollbackQuietly(client);
      PostgresDatabaseAdapter.releaseAfterFailure(client, rolledBack);
      throw withStatementContext(err, sql);
    }
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this.boundSub !== null) {
      return this.runScoped(sql, params, (result) => result.rows as T[]);
    }
    const pool = await this.getPool();
    try {
      const result = (await pool.query(sql, params)) as QueryResult;
      return result.rows as T[];
    } catch (err) {
      throw withStatementContext(err, sql);
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<number> {
    if (this.boundSub !== null) {
      return this.runScoped(sql, params, (result) => result.rowCount ?? 0);
    }
    const pool = await this.getPool();
    try {
      const result = (await pool.query(sql, params)) as QueryResult;
      return result.rowCount ?? 0;
    } catch (err) {
      throw withStatementContext(err, sql);
    }
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    const pool = await this.getPool();
    const client = await this.checkoutClient(pool);
    try {
      await this.beginRlsScope(client);
      const result = await fn(new PostgresTransactionAdapter(client));
      await client.query(COMMIT_STATEMENT);
      client.release();
      return result;
    } catch (err) {
      const rolledBack = await PostgresDatabaseAdapter.rollbackQuietly(client);
      PostgresDatabaseAdapter.releaseAfterFailure(client, rolledBack);
      throw err;
    }
  }

  /**
   * Bind a user JWT for the lifetime of the returned adapter. The receiver is
   * unchanged, so call this once per request scope. The returned adapter shares
   * the parent's pool and its `dispose()` only unbinds per-instance state.
   *
   * @internal SECURITY: the signature is NOT verified here, this only decodes
   * the `sub` claim, so the method is default-deny. Verify the token upstream
   * (Clerk `verifyToken` / {@link ClerkAuthAdapter}) before opting in.
   *
   * @throws DataLayerConfigError when the opt-in flag is not set, or when the
   * JWT is malformed.
   */
  withUser(jwt: string): DatabaseAdapter {
    if (this.config.unsafeAllowUnverifiedJwtSubject !== true) {
      throw new DataLayerConfigError(
        'PostgresDatabaseAdapter.withUser() decodes an UNVERIFIED JWT `sub` and binds it ' +
          'as the RLS subject, forwarding an attacker-minted token here is an ' +
          'impersonation footgun. Verify the token signature upstream (Clerk ' +
          'verifyToken / ClerkAuthAdapter.verifyJwt) FIRST, then construct the ' +
          'adapter with { unsafeAllowUnverifiedJwtSubject: true } to acknowledge ' +
          'that precondition.',
      );
    }
    const sub = decodeJwtSub(jwt, POSTGRES_ADAPTER_NAME);
    const next = this.derive();
    next.boundSub = sub;
    next.boundOrgId = this.boundOrgId;
    return next;
  }

  withOrg(organizationId: string | null): DatabaseAdapter {
    const next = this.derive();
    next.boundSub = this.boundSub;
    next.boundOrgId = organizationId;
    return next;
  }

  private derive(): PostgresDatabaseAdapter {
    return new PostgresDatabaseAdapter({
      ...this.config,
      poolPromise: this.poolPromise,
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.ownsPool) return;
    try {
      const pool = await this.poolPromise;
      await pool.end();
    } catch {
      return;
    }
  }

  async raw(): Promise<unknown> {
    return this.getPool();
  }
}

class PostgresTransactionAdapter implements DatabaseAdapter {
  constructor(private client: PoolClient) {}

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const result = (await this.client.query(sql, params)) as QueryResult;
      return result.rows as T[];
    } catch (err) {
      throw withStatementContext(err, sql);
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<number> {
    try {
      const result = (await this.client.query(sql, params)) as QueryResult;
      return result.rowCount ?? 0;
    } catch (err) {
      throw withStatementContext(err, sql);
    }
  }

  async transaction<T>(_fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    throw new DataLayerConfigError(
      'PostgresDatabaseAdapter does not support nested transactions. ' +
        'Open one transaction at the top of the request scope.',
    );
  }

  withUser(_jwt: string): DatabaseAdapter {
    throw new DataLayerConfigError(
      'Call withUser(jwt) on the outer PostgresDatabaseAdapter BEFORE opening a transaction. ' +
        'The JWT subject is bound via SET LOCAL at the start of the transaction.',
    );
  }

  withOrg(_organizationId: string | null): DatabaseAdapter {
    throw new DataLayerConfigError(
      'Call withOrg(organizationId) on the outer PostgresDatabaseAdapter BEFORE opening a ' +
        'transaction. The active organization is bound via SET LOCAL at the start of the ' +
        'transaction; rebinding it mid-transaction would change tenancy scope for statements ' +
        'that have already run.',
    );
  }

  async dispose(): Promise<void> {
    return;
  }
}

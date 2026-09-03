import type { Pool, PoolClient, QueryResult } from '@neondatabase/serverless';
import {
  type DatabaseAdapter,
  type DatabaseConnectionConfig,
  type DatabaseConnectionErrorEvent,
  type DatabaseConnectionErrorScope,
  DataLayerConfigError,
} from '../types';

export const MIGRATION_GUIDE = `
1. Provision a Neon project. Create a database. Copy the connection string
   (Dashboard -> Connection Details -> "Pooled connection"); it looks like
   "postgresql://user:pwd@ep-xxx.us-east-2.aws.neon.tech/db?sslmode=require".

2. Apply the canonical Neon migrations under apps/web/db/neon/ with the
   Neon CLI or your migration runner.

3. Verify Clerk session tokens before calling db.withUser(jwt). The GUC
   binding (set local request.jwt.claim.sub) drives your RLS policies.
   withUser() is default-deny: it THROWS unless the adapter was constructed
   with { unsafeAllowUnverifiedJwtSubject: true }, which acknowledges you
   have already signature-verified the token upstream.

4. Flip env vars (no code change required):
     AGI_DATABASE_PROVIDER=neon
     AGI_DATABASE_URL=postgresql://...neon.tech/db?sslmode=require
   The createDatabaseClient() factory now returns NeonDatabaseAdapter.

5. Verify. Run a smoke test: db.withUser(testJwt).query('select 1') from a
   server route, plus an RLS-fenced read to confirm row filtering. Then
   migrate hot paths to adapter.query/execute with parameterized SQL.

Full guide: docs/product/definition.md and docs/architecture/overview.md.
`.trim();

/**
 * Postgres reports a failing statement by parameter index and character
 * offset alone, so an error like "could not determine data type of parameter
 * $4" names no query and no table. Attaching the statement (never the
 * parameter values, which carry user content) makes the offending SQL
 * identifiable from a log line.
 */
function withStatementContext(error: unknown, sql: string): unknown {
  if (!(error instanceof Error) || 'statement' in error) return error;
  Object.defineProperty(error, 'statement', {
    value: sql.replace(/\s+/g, ' ').trim().slice(0, 500),
    enumerable: true,
  });
  return error;
}

type NeonModule = typeof import('@neondatabase/serverless');

let _neonModule: NeonModule | null = null;

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function localWebSocketProxyHost(): string | null {
  const proxy = process.env['AGI_DATABASE_WS_PROXY']?.trim();
  if (!proxy) return null;
  return proxy.split(':')[0] ?? '';
}

function isLocalWebSocketProxyTarget(hostname: string): boolean {
  const proxyHost = localWebSocketProxyHost();
  if (proxyHost === null) return false;
  return isLoopbackHost(hostname) || hostname === proxyHost;
}

function applyLocalWebSocketProxy(neon: NeonModule): void {
  const proxy = process.env['AGI_DATABASE_WS_PROXY']?.trim();
  if (!proxy) return;

  const host = proxy.split(':')[0] ?? '';
  if (!isLoopbackHost(host)) {
    throw new DataLayerConfigError(
      `AGI_DATABASE_WS_PROXY must point at a loopback address; got "${proxy}". ` +
        'It exists so a local Postgres can be reached through neondatabase/wsproxy ' +
        'during development, and honouring a remote host would route database ' +
        'traffic and credentials to another machine over an unencrypted socket.',
    );
  }

  neon.neonConfig.wsProxy = (host: string, port: number | string) =>
    `${proxy}/v1?address=${host}:${port}`;
  neon.neonConfig.useSecureWebSocket = false;
  neon.neonConfig.pipelineTLS = false;
  neon.neonConfig.pipelineConnect = false;
}

interface SecureWebSocketDefaults {
  wsProxy: NeonModule['neonConfig']['wsProxy'];
  useSecureWebSocket: boolean;
  pipelineTLS: boolean;
  pipelineConnect: NeonModule['neonConfig']['pipelineConnect'];
}

let _secureWebSocketDefaults: SecureWebSocketDefaults | null = null;

function captureSecureWebSocketDefaults(neon: NeonModule): SecureWebSocketDefaults {
  if (!_secureWebSocketDefaults) {
    _secureWebSocketDefaults = {
      wsProxy: neon.neonConfig.wsProxy,
      useSecureWebSocket: neon.neonConfig.useSecureWebSocket,
      pipelineTLS: neon.neonConfig.pipelineTLS,
      pipelineConnect: neon.neonConfig.pipelineConnect,
    };
  }
  return _secureWebSocketDefaults;
}

function restoreSecureWebSocketDefaults(neon: NeonModule, defaults: SecureWebSocketDefaults): void {
  neon.neonConfig.wsProxy = defaults.wsProxy;
  neon.neonConfig.useSecureWebSocket = defaults.useSecureWebSocket;
  neon.neonConfig.pipelineTLS = defaults.pipelineTLS;
  neon.neonConfig.pipelineConnect = defaults.pipelineConnect;
}

/**
 * Routes one-shot `pool.query()` calls over HTTP fetch instead of a
 * WebSocket, so unbound queries hold no idle socket between invocations.
 * The driver disables this whenever the Pool carries a
 * `connect`/`acquire`/`release`/`remove` listener; `guardTransportErrors`
 * wires each client directly instead, so it stays eligible. Transactions
 * still call `pool.connect()` onto the WebSocket client regardless. Off
 * under the local WS proxy, which has no Neon HTTP endpoint to fetch.
 */
function applyPoolQueryViaFetch(neon: NeonModule, usingLocalProxy: boolean): void {
  if (usingLocalProxy) return;
  neon.neonConfig.poolQueryViaFetch = true;
}

async function importNeonModule(): Promise<NeonModule> {
  if (_neonModule) return _neonModule;
  try {
    _neonModule = (await import('@neondatabase/serverless')) as NeonModule;
  } catch (e) {
    throw new DataLayerConfigError(
      'Tried to use the Neon adapter but @neondatabase/serverless is not installed. ' +
        'Run `pnpm add @neondatabase/serverless` in the consuming app, or set ' +
        'AGI_DATABASE_PROVIDER to a different provider. ' +
        `Underlying error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return _neonModule;
}

async function loadNeon(connectionHost: string): Promise<NeonModule> {
  const loaded = await importNeonModule();
  const defaults = captureSecureWebSocketDefaults(loaded);
  const usingLocalProxy = isLocalWebSocketProxyTarget(connectionHost);
  if (usingLocalProxy) {
    applyLocalWebSocketProxy(loaded);
  } else {
    restoreSecureWebSocketDefaults(loaded, defaults);
  }
  applyPoolQueryViaFetch(loaded, usingLocalProxy);
  return loaded;
}

function decodeJwtSub(jwt: string): string {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new DataLayerConfigError(
      `Neon withUser: expected a 3-segment JWT, got ${parts.length}-segment token.`,
    );
  }
  const payloadSegment = parts[1];
  if (!payloadSegment) {
    throw new DataLayerConfigError('Neon withUser: empty JWT payload segment.');
  }
  const b64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  let json: string;
  try {
    if (typeof globalThis.atob === 'function') {
      json = globalThis.atob(padded);
    } else {
      json = Buffer.from(padded, 'base64').toString('utf8');
    }
  } catch (e) {
    throw new DataLayerConfigError(
      `Neon withUser: failed to base64-decode JWT payload: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new DataLayerConfigError(
      `Neon withUser: JWT payload is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new DataLayerConfigError('Neon withUser: JWT payload is not an object.');
  }
  const sub = (parsed as Record<string, unknown>)['sub'];
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new DataLayerConfigError('Neon withUser: JWT payload has no string `sub` claim.');
  }
  return sub;
}

const SECURE_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);
const NEON_APEX_HOST = 'neon.tech';
const NEON_HOST_SUFFIX = `.${NEON_APEX_HOST}`;

function isNeonHost(hostname: string): boolean {
  return hostname === NEON_APEX_HOST || hostname.endsWith(NEON_HOST_SUFFIX);
}

function assertSecureConnectionString(connectionString: string): void {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DataLayerConfigError(
      'AGI_DATABASE_URL (or DATABASE_URL) is not a valid connection string. Expected ' +
        'postgresql://user:pwd@host/db?sslmode=require.',
    );
  }

  if (isLocalWebSocketProxyTarget(url.hostname)) return;

  const sslmode = url.searchParams.get('sslmode');
  if (sslmode === 'disable') {
    throw new DataLayerConfigError(
      'AGI_DATABASE_URL (or DATABASE_URL) sets sslmode=disable, which explicitly asks for ' +
        'a plaintext connection. Remove sslmode=disable, or set AGI_DATABASE_WS_PROXY for a ' +
        'loopback-only local Postgres during development.',
    );
  }

  if (isNeonHost(url.hostname)) return;

  if (!sslmode || !SECURE_SSL_MODES.has(sslmode)) {
    throw new DataLayerConfigError(
      'AGI_DATABASE_URL (or DATABASE_URL) must set sslmode=require (or verify-ca / ' +
        'verify-full) so traffic is never sent unencrypted. Add ?sslmode=require to the ' +
        'connection string, point it at a Neon host (*.neon.tech), or set ' +
        'AGI_DATABASE_WS_PROXY for a loopback-only local Postgres during development.',
    );
  }
}

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * Below the driver's own 10s default so a pool sitting idle across a
 * Vercel invocation gap closes its socket instead of handing the next
 * invocation a connection that already died in the freeze.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 5_000;

export interface NeonDatabaseAdapterConfig extends DatabaseConnectionConfig {
  pool?: Pool;
  poolPromise?: Promise<Pool>;
  unsafeAllowUnverifiedJwtSubject?: boolean;
}

export class NeonDatabaseAdapter implements DatabaseAdapter {
  private poolPromise: Promise<Pool>;
  private boundSub: string | null = null;
  private boundOrgId: string | null = null;
  private disposed = false;
  private ownsPool: boolean;
  private readonly reportedErrors = new WeakSet<object>();
  private readonly guardedClients = new WeakSet<PoolClient>();

  constructor(private config: NeonDatabaseAdapterConfig) {
    if (config.pool) {
      this.poolPromise = Promise.resolve(config.pool);
      this.ownsPool = true;
    } else if (config.poolPromise) {
      this.poolPromise = config.poolPromise;
      this.ownsPool = false;
    } else {
      assertSecureConnectionString(config.connectionString);
      const connectionHost = new URL(config.connectionString).hostname;
      this.poolPromise = (async () => {
        const mod = await loadNeon(connectionHost);
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
      else console.error('neon connection transport error', event);
    } catch {
      return;
    }
  }

  private async getPool(): Promise<Pool> {
    if (this.disposed) {
      throw new DataLayerConfigError('NeonDatabaseAdapter is disposed');
    }
    return this.poolPromise;
  }

  private async beginRlsScope(client: PoolClient): Promise<void> {
    if (this.boundSub === null) {
      await client.query('BEGIN');
      return;
    }
    await client.query('BEGIN; SET LOCAL ROLE app_rls');
    await client.query(
      "SELECT set_config('request.jwt.claim.sub', $1, true), " +
        "set_config('request.jwt.claim.org_id', $2, true)",
      [this.boundSub, this.boundOrgId ?? ''],
    );
  }

  /**
   * Run a parameterized SELECT through the pool. If a JWT subject has been
   * bound via `withUser()`, every call checks out a dedicated client, runs
   * the RLS preamble (see {@link beginRlsScope}) first, then the user query,
   * and releases the client. Otherwise we go straight through `pool.query`
   * for the cheaper path.
   */
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const pool = await this.getPool();
    if (this.boundSub === null) {
      try {
        const result = (await pool.query(sql, params as unknown[])) as QueryResult;
        return result.rows as T[];
      } catch (err) {
        throw withStatementContext(err, sql);
      }
    }
    const client = await this.checkoutClient(pool);
    try {
      await this.beginRlsScope(client);
      const result = (await client.query(sql, params as unknown[])) as QueryResult;
      await client.query('COMMIT');
      return result.rows as T[];
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // best-effort rollback; surface the original error
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<number> {
    const pool = await this.getPool();
    if (this.boundSub === null) {
      try {
        const result = (await pool.query(sql, params as unknown[])) as QueryResult;
        return result.rowCount ?? 0;
      } catch (err) {
        throw withStatementContext(err, sql);
      }
    }
    const client = await this.checkoutClient(pool);
    try {
      await this.beginRlsScope(client);
      const result = (await client.query(sql, params as unknown[])) as QueryResult;
      await client.query('COMMIT');
      return result.rowCount ?? 0;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // best-effort rollback; surface the original error
      }
      throw withStatementContext(err, sql);
    } finally {
      client.release();
    }
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    const pool = await this.getPool();
    const client = await this.checkoutClient(pool);
    try {
      await this.beginRlsScope(client);
      const tx = new NeonTransactionAdapter(client);
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // best-effort rollback; surface the original error
      }
      throw err;
    } finally {
      client.release();
    }
  }

  withUser(jwt: string): DatabaseAdapter {
    if (this.config.unsafeAllowUnverifiedJwtSubject !== true) {
      throw new DataLayerConfigError(
        'NeonDatabaseAdapter.withUser() decodes an UNVERIFIED JWT `sub` and binds it ' +
          'as the RLS subject, forwarding an attacker-minted token here is an ' +
          'impersonation footgun. Verify the token signature upstream (Clerk ' +
          'verifyToken / ClerkAuthAdapter.verifyJwt) FIRST, then construct the ' +
          'adapter with { unsafeAllowUnverifiedJwtSubject: true } to acknowledge ' +
          'that precondition. The live web gateway derives identity from Clerk ' +
          'auth() directly and must not use this path.',
      );
    }
    const sub = decodeJwtSub(jwt);
    const next = new NeonDatabaseAdapter({
      ...this.config,
      poolPromise: this.poolPromise,
    });
    next.boundSub = sub;
    next.boundOrgId = this.boundOrgId;
    return next;
  }

  withOrg(organizationId: string | null): DatabaseAdapter {
    const next = new NeonDatabaseAdapter({
      ...this.config,
      poolPromise: this.poolPromise,
    });
    next.boundSub = this.boundSub;
    next.boundOrgId = organizationId;
    return next;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.ownsPool) {
      return;
    }
    try {
      const pool = await this.poolPromise;
      await pool.end();
    } catch {
      // Pool may have already ended, or never connected. Either way
      // dispose is a no-throw operation.
    }
  }

  async raw(): Promise<unknown> {
    return this.getPool();
  }
}

class NeonTransactionAdapter implements DatabaseAdapter {
  constructor(private client: PoolClient) {}

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const result = (await this.client.query(sql, params as unknown[])) as QueryResult;
      return result.rows as T[];
    } catch (err) {
      throw withStatementContext(err, sql);
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<number> {
    try {
      const result = (await this.client.query(sql, params as unknown[])) as QueryResult;
      return result.rowCount ?? 0;
    } catch (err) {
      throw withStatementContext(err, sql);
    }
  }

  async transaction<T>(_fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    throw new DataLayerConfigError(
      'NeonDatabaseAdapter does not support nested transactions. ' +
        'Open one transaction at the top of the request scope.',
    );
  }

  withUser(_jwt: string): DatabaseAdapter {
    throw new DataLayerConfigError(
      'Call withUser(jwt) on the outer NeonDatabaseAdapter BEFORE opening a transaction. ' +
        'The JWT subject is bound via SET LOCAL at the start of the transaction.',
    );
  }

  withOrg(_organizationId: string | null): DatabaseAdapter {
    throw new DataLayerConfigError(
      'Call withOrg(organizationId) on the outer NeonDatabaseAdapter BEFORE opening a ' +
        'transaction. The active organization is bound via SET LOCAL at the start of the ' +
        'transaction; rebinding it mid-transaction would change tenancy scope for statements ' +
        'that have already run.',
    );
  }

  async dispose(): Promise<void> {
    // No-op: the outer adapter owns the pool, the held client is released
    // by the outer transaction() in its finally block.
  }
}

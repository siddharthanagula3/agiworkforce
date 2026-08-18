/**
 * @file adapters/neon.ts
 * @module @agiworkforce/data-layer/adapters/neon
 *
 * # Neon adapter
 *
 * Neon (https://neon.tech) is serverless Postgres with branching, generous
 * free tier, and the `@neondatabase/serverless` driver — purpose-built for
 * edge runtimes (Vercel Edge, Cloudflare Workers) AND ordinary Node.
 *
 * Wire it up by setting two env vars:
 *
 * ```bash
 * AGI_DATABASE_PROVIDER=neon
 * AGI_DATABASE_URL=postgresql://user:pwd@ep-xxx.us-east-2.aws.neon.tech/db?sslmode=require
 * ```
 *
 * Feature code never imports this class directly — it goes through
 * `createDatabaseClient()` in `../factory.ts`. This adapter just satisfies
 * the vendor-neutral `DatabaseAdapter` contract from `../types.ts`.
 *
 * ## RLS contract
 *
 * This adapter binds the Clerk JWT subject via a Postgres-native session GUC:
 *
 * ```sql
 * SET LOCAL request.jwt.claim.sub = '<sub>';
 * ```
 *
 * Your RLS policies must read it back with
 * `current_setting('request.jwt.claim.sub', true)`.
 *
 * ```sql
 * CREATE POLICY "owner_only" ON conversations
 *   USING (user_id::text = current_setting('request.jwt.claim.sub', true));
 * ```
 *
 * SECURITY: `withUser(jwt)` does NOT verify the JWT signature — it only
 * base64url-decodes the middle segment and reads `.sub`. Binding an
 * unverified `sub` to RLS is an impersonation footgun, so `withUser()` is
 * DEFAULT-DENY: it throws unless the adapter is constructed with
 * `unsafeAllowUnverifiedJwtSubject: true`. Verify the token upstream
 * (Clerk `verifyToken` / `ClerkAuthAdapter.verifyJwt`) BEFORE opting in.
 * The live web gateway never calls this path; it derives identity from
 * Clerk `auth()` directly.
 *
 * ## Connection pooling
 *
 * The driver's `Pool` export multiplexes over WebSocket internally for
 * Node and over `fetch` for edge. You DO NOT run PgBouncer in front. For
 * one-shot edge invocations consider the `neon()` HTTP function instead;
 * for long-lived Node servers `Pool` is the right call (we use it here).
 *
 * ## Storage + Realtime
 *
 * Neon doesn't ship those. Pair this adapter with:
 *
 * - Storage: S3 / R2 / B2 (planned `s3.ts` adapter) or Vercel Blob.
 * - Realtime: Pusher / Ably / self-hosted ws or Vercel Edge Pub/Sub.
 *
 * The factory rejects `AGI_STORAGE_PROVIDER=s3` etc. today with a
 * `DataLayerConfigError` pointing at the current technical architecture.
 */

import type { Pool, PoolClient, QueryResult } from '@neondatabase/serverless';
import {
  type DatabaseAdapter,
  type DatabaseConnectionConfig,
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

Full guide: docs/current/source-of-truth.md and docs/current/technical-architecture.md.
`.trim();

type NeonModule = typeof import('@neondatabase/serverless');

let _neonModule: NeonModule | null = null;

async function loadNeon(): Promise<NeonModule> {
  if (_neonModule) return _neonModule;
  try {
    _neonModule = (await import('@neondatabase/serverless')) as NeonModule;
    return _neonModule;
  } catch (e) {
    throw new DataLayerConfigError(
      'Tried to use the Neon adapter but @neondatabase/serverless is not installed. ' +
        'Run `pnpm add @neondatabase/serverless` in the consuming app, or set ' +
        'AGI_DATABASE_PROVIDER to a different provider. ' +
        `Underlying error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Decode the `sub` claim from a JWT WITHOUT verifying its signature.
 *
 * @internal SECURITY: this trusts an UNVERIFIED token. An attacker who can
 * reach a caller that forwards a self-minted JWT here controls the `sub`
 * that drives RLS — i.e. impersonation. It is ONLY safe when the caller has
 * already verified the signature (e.g. via {@link ClerkAuthAdapter.verifyJwt}
 * / Clerk `verifyToken`) BEFORE handing the token to `withUser`. Because
 * that precondition is invisible from here, `withUser` is default-deny: it
 * refuses to call this unless the adapter was explicitly constructed with
 * `unsafeAllowUnverifiedJwtSubject: true`. Do not export this helper.
 *
 * Throws if the JWT is malformed (wrong segment count, non-JSON middle,
 * missing/non-string `sub`). Throwing surfaces operator config bugs early
 * rather than silently dropping RLS context.
 */
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

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;

export interface NeonDatabaseAdapterConfig extends DatabaseConnectionConfig {
  pool?: Pool;
  poolPromise?: Promise<Pool>;
  /**
   * Opt in to the UNVERIFIED-JWT escape hatch.
   *
   * @internal SECURITY DEFAULT-DENY. `withUser(jwt)` decodes the `sub` claim
   * of the supplied token WITHOUT verifying its signature and binds it as the
   * RLS subject. If a caller forwards an attacker-minted JWT, the attacker
   * picks the `sub` and impersonates any user. So `withUser()` THROWS unless
   * this flag is explicitly set to `true`, forcing the integrator to
   * acknowledge that the token has already been signature-verified upstream
   * (Clerk `verifyToken` / {@link ClerkAuthAdapter}) before it reaches here.
   *
   * The live web gateway never sets this — it derives identity from Clerk
   * `auth()` directly and never calls `withUser`. Leave it unset unless you
   * are wiring a verified-token-only path and have proven the verification
   * happens first.
   */
  unsafeAllowUnverifiedJwtSubject?: boolean;
}

export class NeonDatabaseAdapter implements DatabaseAdapter {
  private poolPromise: Promise<Pool>;
  private boundSub: string | null = null;
  private boundOrgId: string | null = null;
  private disposed = false;
  private ownsPool: boolean;

  constructor(private config: NeonDatabaseAdapterConfig) {
    if (config.pool) {
      this.poolPromise = Promise.resolve(config.pool);
      this.ownsPool = true;
    } else if (config.poolPromise) {
      this.poolPromise = config.poolPromise;
      this.ownsPool = false;
    } else {
      this.poolPromise = (async () => {
        const mod = await loadNeon();
        return new mod.Pool({
          connectionString: config.connectionString,
          connectionTimeoutMillis: config.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
          ...(config.poolSize !== undefined ? { max: config.poolSize } : {}),
          ...(config.statementTimeoutMs !== undefined
            ? { statement_timeout: config.statementTimeoutMs }
            : {}),
          ...(config.queryTimeoutMs !== undefined ? { query_timeout: config.queryTimeoutMs } : {}),
          ...(config.applicationName !== undefined
            ? { application_name: config.applicationName }
            : {}),
        });
      })();
      this.ownsPool = true;
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
      const result = (await pool.query(sql, params as unknown[])) as QueryResult;
      return result.rows as T[];
    }
    const client = await pool.connect();
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
      const result = (await pool.query(sql, params as unknown[])) as QueryResult;
      return result.rowCount ?? 0;
    }
    const client = await pool.connect();
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
      throw err;
    } finally {
      client.release();
    }
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    const pool = await this.getPool();
    const client = await pool.connect();
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

  /**
   * Bind a user JWT for the lifetime of the returned adapter. The original
   * (service-context) adapter is unchanged — call this for every request
   * scope. Subsequent `query()` / `execute()` / `transaction()` calls run
   * `SET LOCAL request.jwt.claim.sub = $1` so RLS policies see the user.
   *
   * The returned adapter shares the parent's pool — calling `dispose()` on
   * it only unbinds the per-instance state. The pool lifetime is owned by
   * the root adapter that constructed it.
   *
   * @internal SECURITY: the JWT signature is NOT verified here — this method
   * only decodes the `sub` claim. Decoding an unverified token and binding
   * its `sub` to RLS is an impersonation footgun, so this method is
   * DEFAULT-DENY: it throws unless the adapter was constructed with
   * `unsafeAllowUnverifiedJwtSubject: true`. The integrator MUST verify the
   * token's signature upstream (Clerk `verifyToken` / {@link ClerkAuthAdapter})
   * before opting in. The live web gateway never calls this path; it derives
   * identity from Clerk `auth()` directly.
   *
   * @throws DataLayerConfigError when the opt-in flag is not set, or when the
   * JWT is malformed (handled by {@link decodeJwtSub}).
   */
  withUser(jwt: string): DatabaseAdapter {
    if (this.config.unsafeAllowUnverifiedJwtSubject !== true) {
      throw new DataLayerConfigError(
        'NeonDatabaseAdapter.withUser() decodes an UNVERIFIED JWT `sub` and binds it ' +
          'as the RLS subject — forwarding an attacker-minted token here is an ' +
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
    const result = (await this.client.query(sql, params as unknown[])) as QueryResult;
    return result.rows as T[];
  }

  async execute(sql: string, params: unknown[] = []): Promise<number> {
    const result = (await this.client.query(sql, params as unknown[])) as QueryResult;
    return result.rowCount ?? 0;
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

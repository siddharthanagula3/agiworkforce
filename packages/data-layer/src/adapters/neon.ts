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
 * Unlike the Supabase adapter — which leans on `Authorization: Bearer <jwt>`
 * to drive `auth.uid()` in PostgREST — this adapter binds the JWT subject
 * via a Postgres-native session GUC:
 *
 * ```sql
 * SET LOCAL request.jwt.claim.sub = '<sub>';
 * ```
 *
 * Your RLS policies must read it back with `current_setting('request.jwt.claim.sub', true)`,
 * not `auth.uid()` — the latter is a Supabase-only helper. Example policy
 * port:
 *
 * ```sql
 * -- Supabase original
 * CREATE POLICY "owner_only" ON conversations
 *   USING (user_id = auth.uid());
 *
 * -- Neon equivalent
 * CREATE POLICY "owner_only" ON conversations
 *   USING (user_id::text = current_setting('request.jwt.claim.sub', true));
 * ```
 *
 * The JWT itself is NOT verified here — that's the AuthAdapter's job. We
 * only decode the `sub` claim (base64url-decode the middle segment, parse
 * JSON, read `.sub`). If verification matters for your security model, do
 * it before calling `withUser(jwt)`.
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
 * `DataLayerConfigError` pointing at `docs/SCALING.md`.
 */

import type { Pool, PoolClient, QueryResult } from '@neondatabase/serverless';
import {
  type DatabaseAdapter,
  type DatabaseConnectionConfig,
  DataLayerConfigError,
} from '../types';

/**
 * Step-by-step Supabase-to-Neon migration. Surfaced via the public export
 * below so consumers can read it from the package without spelunking the
 * source — and so the ops runbook can render it.
 */
export const MIGRATION_GUIDE = `
1. Provision a Neon project. Create a database. Copy the connection string
   (Dashboard -> Connection Details -> "Pooled connection"); it looks like
   "postgresql://user:pwd@ep-xxx.us-east-2.aws.neon.tech/db?sslmode=require".

2. Port the schema. The 32 canonical migrations under supabase/migrations/
   are vanilla Postgres — apply them with the Neon CLI or psql:
     for f in supabase/migrations/*.sql; do
       psql "$AGI_DATABASE_URL" -f "$f"
     done
   RLS policies port verbatim except the auth.uid() reference: rewrite
   each "auth.uid()" to "current_setting('request.jwt.claim.sub', true)::uuid".

3. Pick an AuthAdapter. Neon doesn't ship auth — choose Auth0, Clerk, or
   Cognito. The new IdP mints JWTs that you pass to db.withUser(jwt) before
   running queries; the GUC binding (set local request.jwt.claim.sub) drives
   your rewritten RLS policies.

4. Flip env vars (no code change required):
     AGI_DATABASE_PROVIDER=neon
     AGI_DATABASE_URL=postgresql://...neon.tech/db?sslmode=require
   The createDatabaseClient() factory now returns NeonDatabaseAdapter.

5. Verify. Run a smoke test: db.withUser(testJwt).query('select 1') from a
   server route, plus an RLS-fenced read to confirm row filtering. Then
   migrate hot paths off any direct supabase-js fluent calls (.from('table')
   -> adapter.query/execute) — those are the last bits of vendor coupling.

Full guide: docs/SCALING.md "Supabase to Neon".
`.trim();

/**
 * Lazy-load the driver so the package can be consumed in environments that
 * don't have `@neondatabase/serverless` installed (Supabase-only deploys).
 * Mirrors the loadSupabase() pattern in adapters/supabase.ts.
 */
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
 * Verification belongs in the AuthAdapter — by the time we get here the
 * caller has already proven the JWT is good. We just need the subject to
 * bind it as a session GUC for RLS.
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
  // base64url -> base64
  const b64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  let json: string;
  try {
    if (typeof globalThis.atob === 'function') {
      json = globalThis.atob(padded);
    } else {
      // Node fallback (older runtimes without globalThis.atob).
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

export interface NeonDatabaseAdapterConfig extends DatabaseConnectionConfig {
  /** Optional pre-built pool. Skips construction (used in tests). */
  pool?: Pool;
  /**
   * Optional pre-built pool promise. When set, the adapter shares the pool
   * with whatever upstream owns it; `dispose()` will NOT end the pool — only
   * unbind any per-instance state (`boundSub`).
   *
   * `withUser()` uses this to hand the parent's pool to the child instance
   * so a per-request adapter doesn't open a new TCP-WebSocket per call.
   */
  poolPromise?: Promise<Pool>;
}

/**
 * `DatabaseAdapter` implementation backed by `@neondatabase/serverless`'s
 * `Pool`. Lazy-connects (no socket activity at construction); safe to import
 * eagerly even when the env is misconfigured.
 */
export class NeonDatabaseAdapter implements DatabaseAdapter {
  private poolPromise: Promise<Pool>;
  private boundSub: string | null = null;
  private disposed = false;
  /**
   * `true` when this instance owns the pool and should `pool.end()` on
   * dispose. Child instances created by `withUser()` set this to `false`
   * — the root adapter owns the pool lifetime.
   */
  private ownsPool: boolean;

  constructor(private config: NeonDatabaseAdapterConfig) {
    if (config.pool) {
      this.poolPromise = Promise.resolve(config.pool);
      this.ownsPool = true;
    } else if (config.poolPromise) {
      // Inherited pool from the parent adapter — do NOT end it on dispose.
      this.poolPromise = config.poolPromise;
      this.ownsPool = false;
    } else {
      // Defer pool construction until first use so misconfigured boots
      // don't crash on import.
      this.poolPromise = (async () => {
        const mod = await loadNeon();
        return new mod.Pool({
          connectionString: config.connectionString,
          ...(config.poolSize !== undefined ? { max: config.poolSize } : {}),
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

  /**
   * Run a parameterized SELECT through the pool. If a JWT subject has been
   * bound via `withUser()`, every call checks out a dedicated client, runs
   * `SET LOCAL request.jwt.claim.sub = $1` first, then the user query, and
   * releases the client. Otherwise we go straight through `pool.query` for
   * the cheaper path.
   */
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const pool = await this.getPool();
    if (this.boundSub === null) {
      const result = (await pool.query(sql, params as unknown[])) as QueryResult;
      return result.rows as T[];
    }
    const client = await pool.connect();
    try {
      // SET LOCAL is transaction-scoped, so we wrap in a one-shot
      // transaction. This makes the GUC binding cheap and isolated.
      await client.query('BEGIN');
      await client.query('SET LOCAL request.jwt.claim.sub = $1', [this.boundSub]);
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

  /**
   * Run a parameterized INSERT / UPDATE / DELETE. Returns the affected row
   * count from `result.rowCount`, falling back to 0 when the driver leaves
   * it null (DDL, etc.).
   */
  async execute(sql: string, params: unknown[] = []): Promise<number> {
    const pool = await this.getPool();
    if (this.boundSub === null) {
      const result = (await pool.query(sql, params as unknown[])) as QueryResult;
      return result.rowCount ?? 0;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL request.jwt.claim.sub = $1', [this.boundSub]);
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

  /**
   * Run `fn` inside a real SQL transaction. The sub-adapter passed to `fn`
   * is bound to the held `PoolClient` so every query inside runs on the
   * same connection. If `fn` resolves we COMMIT; if it throws we ROLLBACK.
   *
   * If a JWT has been bound via `withUser()` the same `SET LOCAL` GUC fires
   * once at the top of the transaction — RLS sees the right subject for
   * the duration.
   */
  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    const pool = await this.getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (this.boundSub !== null) {
        await client.query('SET LOCAL request.jwt.claim.sub = $1', [this.boundSub]);
      }
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
   * The JWT signature is NOT verified here — that's the AuthAdapter's job.
   * This method only decodes the `sub` claim.
   *
   * The returned adapter shares the parent's pool — calling `dispose()` on
   * it only unbinds the per-instance state. The pool lifetime is owned by
   * the root adapter that constructed it.
   */
  withUser(jwt: string): DatabaseAdapter {
    const sub = decodeJwtSub(jwt);
    // Hand the parent's pool promise down so the child re-uses the same
    // pool instead of constructing a new TCP/WebSocket connection.
    const next = new NeonDatabaseAdapter({
      ...this.config,
      poolPromise: this.poolPromise,
    });
    next.boundSub = sub;
    return next;
  }

  /**
   * Close the underlying pool when this adapter owns it. For child instances
   * created by `withUser()` this only marks the instance disposed — the
   * pool lifetime belongs to the root adapter.
   *
   * Safe to call repeatedly; subsequent `query()` / `execute()` /
   * `transaction()` calls reject.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.ownsPool) {
      // Child adapter (from withUser) — boundSub is per-instance, so just
      // marking disposed is enough. The shared pool keeps running.
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

  /**
   * Escape hatch: get the raw `Pool` (typed as `unknown` — the data-layer
   * contract is vendor-neutral and we don't want consumers leaking the
   * driver type). Cast it on the consumer side with eyes open.
   */
  async raw(): Promise<unknown> {
    return this.getPool();
  }
}

/**
 * Sub-adapter passed to the `transaction()` callback. Holds a single
 * `PoolClient` so every query inside the transaction runs on the same
 * connection. We do NOT support nested `transaction()` calls — Postgres
 * doesn't allow nested top-level transactions, and the SAVEPOINT pattern
 * is best left to callers who actually want it.
 *
 * Calling `withUser()` on a transaction adapter throws — JWT scoping must
 * be set BEFORE the transaction (the outer adapter's `boundSub` propagates
 * via `SET LOCAL` at the top of the BEGIN).
 *
 * Calling `dispose()` on a transaction adapter is a no-op; the pool is
 * managed by the outer adapter.
 */
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

  async dispose(): Promise<void> {
    // No-op: the outer adapter owns the pool, the held client is released
    // by the outer transaction() in its finally block.
  }
}

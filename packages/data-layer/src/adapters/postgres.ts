/**
 * @file adapters/postgres.ts
 * @module @agiworkforce/data-layer/adapters/postgres
 *
 * # Raw Postgres adapter (SKELETON — not yet implemented)
 *
 * Targets self-hosted Postgres, AWS RDS, GCP Cloud SQL, Azure Database for
 * Postgres, and Neon-in-non-serverless mode (long-lived TCP connection).
 *
 * Built on `pg` (https://www.npmjs.com/package/pg), the canonical Node
 * Postgres driver. Differences from Neon:
 *
 * - **Connection model:** long-lived TCP via `pg.Pool`. Set `max` (pool
 *   size) per process; for serverless / Lambda you must use external
 *   pooling (RDS Proxy, PgBouncer) — `pg.Pool` does NOT multiplex.
 * - **Edge incompatibility:** `pg` requires Node `net` / `tls`. Won't run on
 *   Vercel Edge or Cloudflare Workers. Use `NeonDatabaseAdapter` (HTTP)
 *   for those runtimes.
 * - **TLS:** RDS / Cloud SQL require explicit TLS config. Self-hosted
 *   Postgres often runs without — wire it via the connection string
 *   (`?sslmode=disable` for dev, `?sslmode=require` for prod).
 *
 * ## Implementation checklist (when migrating)
 *
 * 1. **Install the driver:**
 *    ```bash
 *    pnpm --filter @agiworkforce/data-layer add pg
 *    pnpm --filter @agiworkforce/data-layer add -D @types/pg
 *    ```
 *
 * 2. **Schema:** Same as Neon — copy `supabase/migrations/`. Standard
 *    Postgres so RLS, generated columns, triggers all port without
 *    modification.
 *
 * 3. **Auth:** Same plumbing as Neon — RLS expects a JWT-like claim that
 *    your AuthAdapter mints. Use `set_config('request.jwt.claims', $1, true)`
 *    inside a transaction to bind it.
 *
 * 4. **Pooling:** For multi-tenant traffic >10 RPS per pod, run PgBouncer
 *    in front (`pool_mode = transaction`). RDS Proxy works the same way
 *    on AWS. See `docs/SCALING.md` §"Connection pooling".
 *
 * 5. **Read replicas:** `pg` supports `read_replica_pool` separately —
 *    route SELECTs there, writes to the primary. The adapter should
 *    expose a `withReadOnly()` helper symmetric to `withUser(jwt)`.
 *    See `docs/SCALING.md` §"Read replicas".
 *
 * ## Reference implementation sketch
 *
 * ```ts
 * import { Pool, type PoolClient } from 'pg';
 *
 * export class PostgresDatabaseAdapter implements DatabaseAdapter {
 *   private pool: Pool;
 *   private boundJwt: string | null = null;
 *
 *   constructor(config: DatabaseConnectionConfig) {
 *     this.pool = new Pool({
 *       connectionString: config.connectionString,
 *       max: config.poolSize ?? 10,
 *       statement_timeout: config.statementTimeoutMs ?? 30_000,
 *       application_name: config.applicationName ?? 'agiworkforce',
 *     });
 *   }
 *
 *   async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
 *     const client = await this.pool.connect();
 *     try {
 *       if (this.boundJwt) {
 *         await client.query(
 *           "select set_config('request.jwt.claims', $1, true)",
 *           [this.boundJwt],
 *         );
 *       }
 *       const r = await client.query(sql, params);
 *       return r.rows as T[];
 *     } finally {
 *       client.release();
 *     }
 *   }
 *
 *   async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
 *     const client = await this.pool.connect();
 *     try {
 *       await client.query('begin');
 *       // Wrap the held client so all calls go through it.
 *       const tx = new PostgresTxAdapter(client, this.boundJwt);
 *       const result = await fn(tx);
 *       await client.query('commit');
 *       return result;
 *     } catch (err) {
 *       await client.query('rollback');
 *       throw err;
 *     } finally {
 *       client.release();
 *     }
 *   }
 * }
 * ```
 */

import { type DatabaseAdapter, NotImplementedError, type DatabaseConnectionConfig } from '../types';

const MIGRATION_GUIDE = `
1. pnpm --filter @agiworkforce/data-layer add pg @types/pg
2. Copy SQL from supabase/migrations/ to your target Postgres.
3. Pair with an AuthAdapter that mints JWT-like claims.
4. Set AGI_DATABASE_URL=postgresql://user:pwd@host:5432/db?sslmode=require.
5. Replace this skeleton — see the JSDoc reference implementation.

Full guide: docs/SCALING.md §"Self-hosted Postgres / RDS"
`.trim();

export class PostgresDatabaseAdapter implements DatabaseAdapter {
  constructor(_config: DatabaseConnectionConfig) {
    // Lazy. Don't connect at construction.
  }

  async query<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): Promise<T[]> {
    throw new NotImplementedError('Postgres', 'query', MIGRATION_GUIDE);
  }

  async execute(_sql: string, _params?: unknown[]): Promise<number> {
    throw new NotImplementedError('Postgres', 'execute', MIGRATION_GUIDE);
  }

  async transaction<T>(_fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    throw new NotImplementedError('Postgres', 'transaction', MIGRATION_GUIDE);
  }

  withUser(_jwt: string): DatabaseAdapter {
    throw new NotImplementedError('Postgres', 'withUser', MIGRATION_GUIDE);
  }

  async dispose(): Promise<void> {
    // No-op until pooled connections exist.
  }
}

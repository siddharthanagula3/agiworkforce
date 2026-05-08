/**
 * @file adapters/neon.ts
 * @module @agiworkforce/data-layer/adapters/neon
 *
 * # Neon adapter (SKELETON — not yet implemented)
 *
 * Neon (https://neon.tech) is a serverless Postgres with branching, generous
 * free tier, and the `@neondatabase/serverless` driver — purpose-built for
 * edge runtimes (Vercel Edge, Cloudflare Workers).
 *
 * ## Why this skeleton exists
 *
 * The `DatabaseAdapter` interface in `../types.ts` is the seam we need to swap
 * Supabase for Neon without touching feature code. The Supabase adapter is the
 * default today; this file documents EXACTLY what to do when we're ready to
 * migrate.
 *
 * ## Implementation checklist (when migrating)
 *
 * 1. **Install the driver:**
 *    ```bash
 *    pnpm --filter @agiworkforce/data-layer add @neondatabase/serverless
 *    ```
 *    Move it from `peerDependencies` to `dependencies` once a real
 *    consumer ships.
 *
 * 2. **Schema:** Neon is vanilla Postgres — copy the canonical migrations
 *    from `supabase/migrations/` and apply them. The 27 files post-audit
 *    are SQL-only with no Supabase-specific syntax outside RLS policies.
 *    RLS works on any Postgres ≥ 9.5; the policies port verbatim.
 *
 * 3. **Auth:** Neon doesn't ship auth. You need a separate `AuthAdapter`
 *    (Auth0 / Clerk / Cognito). The new auth provider mints JWTs that
 *    you pass to `withUser(jwt)`. The RLS policies then need to be
 *    rewritten to use the new claim names instead of `auth.uid()` —
 *    typically `current_setting('request.jwt.claims', true)::json->>'sub'`.
 *
 *    See `docs/SCALING.md` §"Auth provider migration" for the auth side.
 *
 * 4. **Connection pooling:** Neon's serverless driver does HTTPS-based
 *    connection multiplexing, so you don't run PgBouncer. For long-lived
 *    Node processes, use the `Pool` export from `@neondatabase/serverless`.
 *    For edge / Vercel functions, use the `neon()` function — single-shot
 *    connections.
 *
 * 5. **Storage + Realtime:** Neon doesn't ship these. Pair with:
 *    - Storage: S3 / R2 / B2 (use `s3.ts` adapter — TODO) or Vercel Blob.
 *    - Realtime: Pusher / Ably / self-hosted ws (use `pusher.ts` —
 *      TODO) or Vercel Edge Pub/Sub.
 *
 * 6. **Connection string:** put it in `AGI_DATABASE_URL` (preferred over
 *    `DATABASE_URL` to avoid clashing with other tools). Format:
 *    `postgresql://user:pwd@ep-xxx.us-east-2.aws.neon.tech/db?sslmode=require`
 *
 * ## Reference implementation sketch
 *
 * ```ts
 * import { Pool } from '@neondatabase/serverless';
 *
 * export class NeonDatabaseAdapter implements DatabaseAdapter {
 *   private pool: Pool;
 *   private boundJwt: string | null = null;
 *
 *   constructor(config: { connectionString: string }) {
 *     this.pool = new Pool({ connectionString: config.connectionString });
 *   }
 *
 *   async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
 *     const client = await this.pool.connect();
 *     try {
 *       if (this.boundJwt) {
 *         await client.query(
 *           `set local request.jwt.claims = $1`,
 *           [this.boundJwt],
 *         );
 *       }
 *       const r = await client.query(sql, params);
 *       return r.rows as T[];
 *     } finally {
 *       client.release();
 *     }
 *   }
 *   // ...
 * }
 * ```
 *
 * The skeleton below throws `NotImplementedError` so any accidental
 * production use fails fast.
 */

import { type DatabaseAdapter, NotImplementedError, type DatabaseConnectionConfig } from '../types';

const MIGRATION_GUIDE = `
1. pnpm --filter @agiworkforce/data-layer add @neondatabase/serverless
2. Copy SQL from supabase/migrations/ to your Neon project.
3. Pick an AuthAdapter (Auth0 / Clerk / Cognito).
4. Set AGI_DATABASE_URL=postgresql://...neon.tech/db?sslmode=require.
5. Replace this skeleton — see the JSDoc reference implementation.

Full guide: docs/SCALING.md §"Supabase to Neon"
`.trim();

export class NeonDatabaseAdapter implements DatabaseAdapter {
  // Underscore-prefixed so `noUnusedParameters` accepts the unused config
  // until the real implementation lands.
  constructor(_config: DatabaseConnectionConfig) {
    // Constructor MUST be cheap — don't open connections here. Open them
    // lazily inside the first query so that misconfigured production
    // boots don't crash on import.
  }

  async query<T = Record<string, unknown>>(_sql: string, _params?: unknown[]): Promise<T[]> {
    throw new NotImplementedError('Neon', 'query', MIGRATION_GUIDE);
  }

  async execute(_sql: string, _params?: unknown[]): Promise<number> {
    throw new NotImplementedError('Neon', 'execute', MIGRATION_GUIDE);
  }

  async transaction<T>(_fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    throw new NotImplementedError('Neon', 'transaction', MIGRATION_GUIDE);
  }

  withUser(_jwt: string): DatabaseAdapter {
    throw new NotImplementedError('Neon', 'withUser', MIGRATION_GUIDE);
  }

  async dispose(): Promise<void> {
    // No-op until pooled connections exist.
  }
}

/**
 * @file adapters/supabase.ts
 * @module @agiworkforce/data-layer/adapters/supabase
 *
 * # Supabase adapter (current default)
 *
 * Wraps `@supabase/supabase-js` so the rest of the codebase only touches
 * the vendor-neutral `DatabaseAdapter` / `AuthAdapter` / etc. interfaces.
 *
 * ## RLS contract
 *
 * `withUser(jwt)` returns a NEW adapter whose every query is bound to the
 * user via the `Authorization: Bearer <jwt>` header. The original (service
 * role) adapter remains for webhook / cron callsites.
 *
 * This mirrors the existing `getUserClient()` / `getServiceClient()` split
 * in `apps/web/lib/supabase-server.ts` — see that file for the security
 * policy. Audit ground truth: `docs/audit/` WEB-RLS-BYPASS finding.
 *
 * ## SQL passthrough caveat
 *
 * Supabase's PostgREST API is NOT raw-SQL. The `query()` / `execute()`
 * methods on this adapter call the `exec_sql` Postgres function via RPC.
 * That function MUST exist in the database — it ships with the canonical
 * migrations under `supabase/migrations/`. If you call `query()` against
 * a database without that function, the call rejects.
 *
 * For most callsites we recommend STAYING on the supabase-js fluent API
 * (`.from('table').select(...)`) for now — gradually migrate hot paths
 * to the adapter as you verify the SQL-passthrough contract. The full
 * migration is documented in `docs/SCALING.md` §"Supabase to Neon".
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AuthAdapter,
  type DatabaseAdapter,
  type RealtimeAdapter,
  type RefreshedTokens,
  type StorageAdapter,
  type StoragePutResult,
  type VerifiedJwt,
  DataLayerConfigError,
  NotImplementedError,
} from '../types';

/**
 * Lazy-loaded supabase-js. We import dynamically so the package can be
 * consumed in environments that don't ship the supabase peer dep
 * (e.g. a future Neon-only deployment).
 */
type CreateClientFn = (url: string, key: string, opts?: Record<string, unknown>) => SupabaseClient;

let _createClient: CreateClientFn | null = null;

async function loadSupabase(): Promise<CreateClientFn> {
  if (_createClient) return _createClient;
  try {
    const mod = (await import('@supabase/supabase-js')) as {
      createClient: CreateClientFn;
    };
    _createClient = mod.createClient;
    return _createClient;
  } catch (e) {
    throw new DataLayerConfigError(
      'Tried to use the Supabase adapter but @supabase/supabase-js is not installed. ' +
        'Either `pnpm add @supabase/supabase-js` in the consuming app, or set ' +
        'AGI_DATABASE_PROVIDER to a different provider. ' +
        `Underlying error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

// ============================================================================
// Database
// ============================================================================

export interface SupabaseDatabaseConfig {
  supabaseUrl: string;
  /** Service role key (server) or anon key (browser). */
  supabaseKey: string;
  /** Optional pre-built client. Skips construction when present. */
  client?: SupabaseClient;
}

export class SupabaseDatabaseAdapter implements DatabaseAdapter {
  private clientPromise: Promise<SupabaseClient>;
  private boundJwt: string | null = null;
  private disposed = false;
  /**
   * Cached JWT-bound client. Built lazily on first JWT-bound query and
   * reused for subsequent calls in the same request scope, so we don't
   * spin up a fresh `createClient()` per query (which previously meant a
   * new auth GoTrueClient + headers object per call).
   */
  private boundClientPromise: Promise<SupabaseClient> | null = null;

  constructor(private config: SupabaseDatabaseConfig) {
    if (config.client) {
      this.clientPromise = Promise.resolve(config.client);
    } else {
      this.clientPromise = (async () => {
        const create = await loadSupabase();
        return create(config.supabaseUrl, config.supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      })();
    }
  }

  private async getClient(): Promise<SupabaseClient> {
    if (this.disposed) {
      throw new DataLayerConfigError('SupabaseDatabaseAdapter is disposed');
    }
    const base = await this.clientPromise;
    if (!this.boundJwt) return base;
    if (!this.boundClientPromise) {
      const jwt = this.boundJwt;
      this.boundClientPromise = (async () => {
        const create = await loadSupabase();
        return create(this.config.supabaseUrl, this.config.supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${jwt}` } },
        });
      })();
    }
    return this.boundClientPromise;
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await this.getClient();
    const { data, error } = await client.rpc('exec_sql', {
      query: sql,
      params: params as unknown as Record<string, unknown>[],
    });
    if (error) throw error;
    return (data as T[] | null) ?? [];
  }

  async execute(sql: string, params: unknown[] = []): Promise<number> {
    const client = await this.getClient();
    const { data, error } = await client.rpc('exec_sql_count', {
      query: sql,
      params: params as unknown as Record<string, unknown>[],
    });
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  }

  async transaction<T>(_fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    // Supabase / PostgREST cannot multiplex statements over a single
    // connection from the JS client, so true transactions require an
    // RPC that wraps the whole unit of work. Earlier this method was a
    // silent passthrough that ran each statement independently — that
    // gave the FALSE impression of a transaction (no BEGIN/COMMIT, no
    // rollback on partial failure). We now refuse to lie.
    //
    // For real transactions today, switch to the Neon or postgres
    // adapter. See docs/SCALING.md §"Transactions across providers".
    throw new NotImplementedError(
      'Supabase',
      'transaction',
      'Supabase JS cannot multiplex statements over a single connection. ' +
        'For real transactions use the Neon adapter (NeonDatabaseAdapter.transaction) ' +
        'or move the unit of work into a Postgres function called via .rpc().',
    );
  }

  withUser(jwt: string): DatabaseAdapter {
    const next = new SupabaseDatabaseAdapter(this.config);
    next.boundJwt = jwt;
    return next;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  /**
   * Escape hatch: get the raw supabase-js client for fluent
   * `.from('table').select(...)` queries. Use sparingly — every call
   * to this method is a place that needs migrating before we can swap
   * Supabase out.
   *
   * Tracked in `docs/SCALING.md` §"Supabase fluent-API callsites to migrate".
   */
  async raw(): Promise<SupabaseClient> {
    return this.getClient();
  }
}

// ============================================================================
// Auth
// ============================================================================

export interface SupabaseAuthConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Optional pre-built client (e.g. from a request scope). */
  client?: SupabaseClient;
}

export class SupabaseAuthAdapter implements AuthAdapter {
  private clientPromise: Promise<SupabaseClient>;

  constructor(config: SupabaseAuthConfig) {
    if (config.client) {
      this.clientPromise = Promise.resolve(config.client);
    } else {
      this.clientPromise = (async () => {
        const create = await loadSupabase();
        return create(config.supabaseUrl, config.supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, flowType: 'pkce' },
        });
      })();
    }
  }

  async verifyJwt(token: string): Promise<VerifiedJwt | null> {
    const client = await this.clientPromise;
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    const result: VerifiedJwt = {
      userId: data.user.id,
      raw: data.user as unknown as Record<string, unknown>,
    };
    if (data.user.email) {
      result.email = data.user.email;
    }
    return result;
  }

  async refreshToken(refreshToken: string): Promise<RefreshedTokens | null> {
    const client = await this.clientPromise;
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) return null;
    const result: RefreshedTokens = {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    };
    if (data.session.expires_at) {
      result.expiresAt = data.session.expires_at;
    }
    return result;
  }
}

// ============================================================================
// Storage
// ============================================================================

export interface SupabaseStorageConfig {
  supabaseUrl: string;
  supabaseKey: string;
  client?: SupabaseClient;
}

export class SupabaseStorageAdapter implements StorageAdapter {
  private clientPromise: Promise<SupabaseClient>;

  constructor(config: SupabaseStorageConfig) {
    if (config.client) {
      this.clientPromise = Promise.resolve(config.client);
    } else {
      this.clientPromise = (async () => {
        const create = await loadSupabase();
        return create(config.supabaseUrl, config.supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      })();
    }
  }

  async put(bucket: string, key: string, data: Uint8Array): Promise<StoragePutResult> {
    const client = await this.clientPromise;
    const { data: result, error } = await client.storage
      .from(bucket)
      .upload(key, data, { upsert: true, contentType: 'application/octet-stream' });
    if (error) throw error;
    const { data: pub } = client.storage.from(bucket).getPublicUrl(result.path);
    return { url: pub.publicUrl, key: result.path };
  }

  async get(bucket: string, key: string): Promise<Uint8Array | null> {
    const client = await this.clientPromise;
    const { data, error } = await client.storage.from(bucket).download(key);
    if (error) {
      // Supabase returns 400/404 as errors; treat "not found" as null.
      const msg = error.message.toLowerCase();
      if (msg.includes('not found') || msg.includes('404')) return null;
      throw error;
    }
    if (!data) return null;
    const ab = await data.arrayBuffer();
    return new Uint8Array(ab);
  }

  async delete(bucket: string, key: string): Promise<void> {
    const client = await this.clientPromise;
    const { error } = await client.storage.from(bucket).remove([key]);
    if (error) throw error;
  }

  async signedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string> {
    if (ttlSeconds <= 0) {
      throw new DataLayerConfigError('signedUrl ttlSeconds must be > 0');
    }
    const client = await this.clientPromise;
    const { data, error } = await client.storage.from(bucket).createSignedUrl(key, ttlSeconds);
    if (error) throw error;
    return data.signedUrl;
  }
}

// ============================================================================
// Realtime
// ============================================================================

export interface SupabaseRealtimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  client?: SupabaseClient;
}

export class SupabaseRealtimeAdapter implements RealtimeAdapter {
  private clientPromise: Promise<SupabaseClient>;
  /**
   * Reusable publish channels keyed by channel name. Building + subscribing
   * + tearing down a fresh channel on every `publish()` call is a hot-path
   * footgun (round-trip + GoTrueClient setup per publish). We keep one
   * subscribed channel per name and reuse it for the lifetime of this
   * adapter; `dispose()`-style cleanup is the host app's responsibility
   * since RealtimeAdapter has no `dispose` method.
   */
  private publishChannels = new Map<string, Promise<SupabaseRealtimeChannel>>();

  constructor(config: SupabaseRealtimeConfig) {
    if (config.client) {
      this.clientPromise = Promise.resolve(config.client);
    } else {
      this.clientPromise = (async () => {
        const create = await loadSupabase();
        return create(config.supabaseUrl, config.supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      })();
    }
  }

  subscribe(channelName: string, onMessage: (payload: unknown) => void): () => void {
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const client = await this.clientPromise;
      // Re-check `cancelled` AFTER each await — the unsubscribe callback may
      // have fired before we made it past the client promise.
      if (cancelled) return;
      const channel = client.channel(channelName);
      channel.on('broadcast', { event: '*' }, (payload) => {
        onMessage(payload);
      });
      await channel.subscribe();
      // Re-check again now that subscribe() has resolved — if the caller
      // unsubscribed during the round-trip, tear down immediately. Without
      // this check we'd leak the open subscription forever (cleanup would
      // be assigned but never called because the returned function already
      // ran with `cleanup === null`).
      if (cancelled) {
        void channel.unsubscribe();
        return;
      }
      cleanup = () => {
        void channel.unsubscribe();
      };
    })();
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }

  async publish(channelName: string, payload: unknown): Promise<void> {
    const client = await this.clientPromise;
    let entry = this.publishChannels.get(channelName);
    if (!entry) {
      entry = (async () => {
        const ch = client.channel(channelName) as unknown as SupabaseRealtimeChannel;
        await ch.subscribe();
        return ch;
      })();
      this.publishChannels.set(channelName, entry);
    }
    const channel = await entry;
    await channel.send({ type: 'broadcast', event: 'message', payload });
  }
}

/**
 * Minimal duck-typed shape of a Supabase realtime channel — the public
 * surface we need from `client.channel(name)`. Avoids leaking the full
 * realtime-js types into our DatabaseAdapter contract.
 *
 * The real `subscribe()` is fire-and-forget (returns the channel itself,
 * not a promise) — but it's safe to await its return value in our wrapper
 * since `await <non-promise>` resolves immediately.
 */
interface SupabaseRealtimeChannel {
  subscribe(): unknown;
  unsubscribe(): unknown;
  send(payload: { type: string; event: string; payload: unknown }): unknown;
}

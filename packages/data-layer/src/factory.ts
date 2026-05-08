/**
 * @file factory.ts
 * @module @agiworkforce/data-layer/factory
 *
 * # Factory functions — pick an adapter from config or env
 *
 * Feature code never imports a concrete adapter. It calls one of the
 * `create*Client()` functions, which read either an explicit config
 * argument or the process environment, and return the right adapter.
 *
 * Switching providers becomes a one-line env change:
 *
 * ```bash
 * # Today:
 * AGI_DATABASE_PROVIDER=supabase
 *
 * # Tomorrow:
 * AGI_DATABASE_PROVIDER=neon
 * AGI_DATABASE_URL=postgresql://...neon.tech/db?sslmode=require
 * ```
 *
 * ## Env vars consumed
 *
 * | Env var                            | Default       | Used by      |
 * |------------------------------------|---------------|--------------|
 * | `AGI_DATABASE_PROVIDER`            | `supabase`    | DB factory   |
 * | `AGI_AUTH_PROVIDER`                | `supabase`    | Auth factory |
 * | `AGI_STORAGE_PROVIDER`             | `supabase`    | Storage      |
 * | `AGI_REALTIME_PROVIDER`            | `supabase`    | Realtime     |
 * | `AGI_DATABASE_URL` / `DATABASE_URL`| —             | Neon, PG     |
 * | `NEXT_PUBLIC_SUPABASE_URL`         | —             | Supabase     |
 * | `SUPABASE_SERVICE_ROLE_KEY`        | —             | Supabase srv |
 * | `NEXT_PUBLIC_SUPABASE_ANON_KEY`    | —             | Supabase web |
 *
 * Defaults are conservative — if you don't set anything, you get the
 * Supabase adapter (matches today's behavior).
 */

import {
  type AuthAdapter,
  type DatabaseAdapter,
  type DatabaseConnectionConfig,
  type DatabaseProvider,
  type AuthProvider,
  type RealtimeAdapter,
  type RealtimeProvider,
  type StorageAdapter,
  type StorageProvider,
  DataLayerConfigError,
} from './types';
import {
  SupabaseAuthAdapter,
  SupabaseDatabaseAdapter,
  SupabaseRealtimeAdapter,
  SupabaseStorageAdapter,
} from './adapters/supabase';
import { NeonDatabaseAdapter } from './adapters/neon';
import { PostgresDatabaseAdapter } from './adapters/postgres';

// Browser-safe env getter — falls back to `undefined` if `process.env`
// isn't defined (we're not in Node). This lets the factory be imported
// from edge runtimes / mobile builds that bundle differently.
function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[name];
}

function readEnvProvider<T extends string>(name: string, fallback: T, allowed: readonly T[]): T {
  const raw = readEnv(name);
  if (!raw) return fallback;
  if ((allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  throw new DataLayerConfigError(`Env var ${name}="${raw}" is not one of: ${allowed.join(', ')}`);
}

// ============================================================================
// Database
// ============================================================================

const DATABASE_PROVIDERS = ['supabase', 'neon', 'postgres'] as const;

export interface CreateDatabaseClientOptions {
  /** Explicit provider; if omitted, reads `AGI_DATABASE_PROVIDER`. */
  provider?: DatabaseProvider;
  /** Postgres-compatible connection string (Neon / Postgres only). */
  connectionString?: string;
  /** Supabase URL (Supabase only). */
  supabaseUrl?: string;
  /** Supabase service-role or anon key (Supabase only). */
  supabaseKey?: string;
  poolSize?: number;
  applicationName?: string;
}

/**
 * Build a `DatabaseAdapter` from explicit config or process env.
 *
 * @example
 *   // Read from env (the common case):
 *   const db = createDatabaseClient();
 *
 * @example
 *   // Explicit override (tests, multi-tenant scenarios):
 *   const db = createDatabaseClient({
 *     provider: 'supabase',
 *     supabaseUrl: '...',
 *     supabaseKey: '...',
 *   });
 */
export function createDatabaseClient(opts: CreateDatabaseClientOptions = {}): DatabaseAdapter {
  const provider =
    opts.provider ??
    readEnvProvider<DatabaseProvider>('AGI_DATABASE_PROVIDER', 'supabase', DATABASE_PROVIDERS);

  switch (provider) {
    case 'supabase': {
      const url = opts.supabaseUrl ?? readEnv('NEXT_PUBLIC_SUPABASE_URL');
      const key =
        opts.supabaseKey ??
        readEnv('SUPABASE_SERVICE_ROLE_KEY') ??
        readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      if (!url || !key) {
        throw new DataLayerConfigError(
          'Supabase database adapter requires NEXT_PUBLIC_SUPABASE_URL ' +
            'and (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY).',
        );
      }
      return new SupabaseDatabaseAdapter({ supabaseUrl: url, supabaseKey: key });
    }
    case 'neon': {
      const connectionString =
        opts.connectionString ?? readEnv('AGI_DATABASE_URL') ?? readEnv('DATABASE_URL');
      if (!connectionString) {
        throw new DataLayerConfigError(
          'Neon adapter requires AGI_DATABASE_URL (or DATABASE_URL) — a postgres:// connection string.',
        );
      }
      const cfg: DatabaseConnectionConfig = { connectionString };
      if (opts.poolSize !== undefined) cfg.poolSize = opts.poolSize;
      if (opts.applicationName !== undefined) cfg.applicationName = opts.applicationName;
      return new NeonDatabaseAdapter(cfg);
    }
    case 'postgres': {
      const connectionString =
        opts.connectionString ?? readEnv('AGI_DATABASE_URL') ?? readEnv('DATABASE_URL');
      if (!connectionString) {
        throw new DataLayerConfigError(
          'Postgres adapter requires AGI_DATABASE_URL (or DATABASE_URL) — a postgres:// connection string.',
        );
      }
      const cfg: DatabaseConnectionConfig = { connectionString };
      if (opts.poolSize !== undefined) cfg.poolSize = opts.poolSize;
      if (opts.applicationName !== undefined) cfg.applicationName = opts.applicationName;
      return new PostgresDatabaseAdapter(cfg);
    }
  }
}

// ============================================================================
// Auth
// ============================================================================

const AUTH_PROVIDERS = ['supabase', 'auth0', 'clerk', 'cognito'] as const;

export interface CreateAuthClientOptions {
  provider?: AuthProvider;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

/**
 * Build an `AuthAdapter`. Today only `supabase` is implemented; the other
 * providers' migration paths are documented in `docs/SCALING.md`.
 */
export function createAuthClient(opts: CreateAuthClientOptions = {}): AuthAdapter {
  const provider =
    opts.provider ?? readEnvProvider<AuthProvider>('AGI_AUTH_PROVIDER', 'supabase', AUTH_PROVIDERS);

  switch (provider) {
    case 'supabase': {
      const url = opts.supabaseUrl ?? readEnv('NEXT_PUBLIC_SUPABASE_URL');
      const key = opts.supabaseAnonKey ?? readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      if (!url || !key) {
        throw new DataLayerConfigError(
          'Supabase auth adapter requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.',
        );
      }
      return new SupabaseAuthAdapter({ supabaseUrl: url, supabaseAnonKey: key });
    }
    case 'auth0':
    case 'clerk':
    case 'cognito':
      throw new DataLayerConfigError(
        `Auth provider "${provider}" is documented in docs/SCALING.md but no adapter ships yet. ` +
          `See docs/SCALING.md §"Auth provider migration" for the implementation path.`,
      );
  }
}

// ============================================================================
// Storage
// ============================================================================

const STORAGE_PROVIDERS = ['supabase', 's3', 'r2', 'b2'] as const;

export interface CreateStorageClientOptions {
  provider?: StorageProvider;
  supabaseUrl?: string;
  supabaseKey?: string;
}

export function createStorageClient(opts: CreateStorageClientOptions = {}): StorageAdapter {
  const provider =
    opts.provider ??
    readEnvProvider<StorageProvider>('AGI_STORAGE_PROVIDER', 'supabase', STORAGE_PROVIDERS);

  switch (provider) {
    case 'supabase': {
      const url = opts.supabaseUrl ?? readEnv('NEXT_PUBLIC_SUPABASE_URL');
      const key =
        opts.supabaseKey ??
        readEnv('SUPABASE_SERVICE_ROLE_KEY') ??
        readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      if (!url || !key) {
        throw new DataLayerConfigError(
          'Supabase storage adapter requires NEXT_PUBLIC_SUPABASE_URL + a key.',
        );
      }
      return new SupabaseStorageAdapter({ supabaseUrl: url, supabaseKey: key });
    }
    case 's3':
    case 'r2':
    case 'b2':
      throw new DataLayerConfigError(
        `Storage provider "${provider}" is documented in docs/SCALING.md but no adapter ships yet. ` +
          `See docs/SCALING.md §"Storage migration" for the implementation path.`,
      );
  }
}

// ============================================================================
// Realtime
// ============================================================================

const REALTIME_PROVIDERS = ['supabase', 'pusher', 'ably', 'self-hosted'] as const;

export interface CreateRealtimeClientOptions {
  provider?: RealtimeProvider;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export function createRealtimeClient(opts: CreateRealtimeClientOptions = {}): RealtimeAdapter {
  const provider =
    opts.provider ??
    readEnvProvider<RealtimeProvider>('AGI_REALTIME_PROVIDER', 'supabase', REALTIME_PROVIDERS);

  switch (provider) {
    case 'supabase': {
      const url = opts.supabaseUrl ?? readEnv('NEXT_PUBLIC_SUPABASE_URL');
      const key = opts.supabaseAnonKey ?? readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      if (!url || !key) {
        throw new DataLayerConfigError(
          'Supabase realtime adapter requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.',
        );
      }
      return new SupabaseRealtimeAdapter({ supabaseUrl: url, supabaseAnonKey: key });
    }
    case 'pusher':
    case 'ably':
    case 'self-hosted':
      throw new DataLayerConfigError(
        `Realtime provider "${provider}" is documented in docs/SCALING.md but no adapter ships yet. ` +
          `See docs/SCALING.md §"Realtime migration" for the implementation path.`,
      );
  }
}

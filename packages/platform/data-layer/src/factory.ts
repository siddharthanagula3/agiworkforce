/**
 * @file factory.ts
 * @module @agiworkforce/data-layer/factory
 *
 * # Factory functions, pick an adapter from config or env
 *
 * Feature code never imports a concrete adapter. It calls one of the
 * `create*Client()` functions, which read either an explicit config
 * argument or the process environment, and return the right adapter.
 *
 * Switching database providers becomes a one-line env change, but the current
 * product default is Neon for database and Clerk for auth:
 *
 * ```bash
 * AGI_DATABASE_PROVIDER=neon
 * AGI_DATABASE_URL=postgresql://...neon.tech/db?sslmode=require
 * AGI_AUTH_PROVIDER=clerk
 * ```
 *
 * ## Env vars consumed
 *
 * | Env var                            | Default       | Used by      |
 * |------------------------------------|---------------|--------------|
 * | `AGI_DATABASE_PROVIDER`            | `neon`        | DB factory   |
 * | `AGI_AUTH_PROVIDER`                | `clerk`       | Auth factory |
 * | `AGI_REALTIME_PROVIDER`            | explicit only | Realtime     |
 * | `AGI_DATABASE_URL` / `DATABASE_URL`|, | Neon DB      |
 * | `CLERK_JWT_KEY` / `CLERK_SECRET_KEY`|, | Clerk auth   |
 * | `CLERK_AUTHORIZED_PARTIES`          | app origin    | Clerk auth   |
 *
 * Defaults are fail-closed for anything that is not implemented on the
 * Clerk + Neon platform boundary.
 */

import {
  type AuthAdapter,
  type DatabaseAdapter,
  type DatabaseConnectionErrorListener,
  type DatabaseProvider,
  type AuthProvider,
  type RealtimeAdapter,
  type RealtimeProvider,
  DataLayerConfigError,
} from './types';
import { ClerkAuthAdapter } from './adapters/clerk';
import { NeonDatabaseAdapter, type NeonDatabaseAdapterConfig } from './adapters/neon';

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

function readRequiredEnvProvider<T extends string>(name: string, allowed: readonly T[]): T {
  const raw = readEnv(name);
  if (!raw) {
    throw new DataLayerConfigError(
      `${name} is required. Realtime has no implicit runtime default; ` +
        'choose an explicit supported provider for this surface.',
    );
  }
  if ((allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }
  throw new DataLayerConfigError(`Env var ${name}="${raw}" is not one of: ${allowed.join(', ')}`);
}

const DATABASE_PROVIDERS = ['neon'] as const;

export interface CreateDatabaseClientOptions {
  provider?: DatabaseProvider;
  connectionString?: string;
  poolSize?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
  queryTimeoutMs?: number;
  applicationName?: string;
  unsafeAllowUnverifiedJwtSubject?: boolean;
  onConnectionError?: DatabaseConnectionErrorListener;
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
 *     provider: 'neon',
 *     connectionString: 'postgresql://...',
 *   });
 */
export function createDatabaseClient(opts: CreateDatabaseClientOptions = {}): DatabaseAdapter {
  const provider = selectDatabaseProvider(opts.provider ?? readEnv('AGI_DATABASE_PROVIDER'));

  switch (provider) {
    case 'neon': {
      const connectionString =
        opts.connectionString ?? readEnv('AGI_DATABASE_URL') ?? readEnv('DATABASE_URL');
      if (!connectionString) {
        throw new DataLayerConfigError(
          'Neon adapter requires AGI_DATABASE_URL (or DATABASE_URL), a postgres:// connection string.',
        );
      }
      const cfg: NeonDatabaseAdapterConfig = { connectionString };
      if (opts.poolSize !== undefined) cfg.poolSize = opts.poolSize;
      if (opts.connectionTimeoutMs !== undefined)
        cfg.connectionTimeoutMs = opts.connectionTimeoutMs;
      if (opts.statementTimeoutMs !== undefined) cfg.statementTimeoutMs = opts.statementTimeoutMs;
      if (opts.queryTimeoutMs !== undefined) cfg.queryTimeoutMs = opts.queryTimeoutMs;
      if (opts.applicationName !== undefined) cfg.applicationName = opts.applicationName;
      if (opts.onConnectionError !== undefined) cfg.onConnectionError = opts.onConnectionError;
      if (opts.unsafeAllowUnverifiedJwtSubject === true) {
        cfg.unsafeAllowUnverifiedJwtSubject = true;
      }
      return new NeonDatabaseAdapter(cfg);
    }
  }
}

function selectDatabaseProvider(raw: string | undefined): DatabaseProvider {
  if (!raw) return 'neon';
  if ((DATABASE_PROVIDERS as readonly string[]).includes(raw)) {
    return raw as DatabaseProvider;
  }
  throw new DataLayerConfigError(
    `Database provider "${raw}" is not selectable in production. ` +
      'Only neon is currently implemented; raw postgres remains a migration skeleton.',
  );
}

function parseAuthorizedParties(raw: string | undefined): string[] | undefined {
  const parties = (raw ?? '')
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean);
  return parties.length > 0 ? parties : undefined;
}

function deploymentOrigin(): string | undefined {
  const appUrl = readEnv('NEXT_PUBLIC_APP_URL')?.trim() || readEnv('AGI_APP_URL')?.trim();
  if (!appUrl) return undefined;
  try {
    return new URL(appUrl).origin;
  } catch {
    return undefined;
  }
}

const AUTH_PROVIDERS = ['auth0', 'clerk', 'cognito'] as const;

export interface CreateAuthClientOptions {
  provider?: AuthProvider;
  clerkSecretKey?: string;
  clerkJwtKey?: string;
  clerkAuthorizedParties?: string[];
}

export function createAuthClient(opts: CreateAuthClientOptions = {}): AuthAdapter {
  const provider =
    opts.provider ?? readEnvProvider<AuthProvider>('AGI_AUTH_PROVIDER', 'clerk', AUTH_PROVIDERS);

  switch (provider) {
    case 'clerk': {
      const secretKey = opts.clerkSecretKey ?? readEnv('CLERK_SECRET_KEY');
      const jwtKey = opts.clerkJwtKey ?? readEnv('CLERK_JWT_KEY');
      const authorizedParties =
        opts.clerkAuthorizedParties ??
        parseAuthorizedParties(readEnv('CLERK_AUTHORIZED_PARTIES')) ??
        parseAuthorizedParties(deploymentOrigin());
      return new ClerkAuthAdapter({ secretKey, jwtKey, authorizedParties });
    }
    case 'auth0':
    case 'cognito':
      throw new DataLayerConfigError(
        `Auth provider "${provider}" is documented in docs/architecture/overview.md but no adapter ships yet. `,
      );
  }
}

const REALTIME_PROVIDERS = ['pusher', 'ably', 'self-hosted'] as const;

export interface CreateRealtimeClientOptions {
  provider?: RealtimeProvider;
}

export function createRealtimeClient(opts: CreateRealtimeClientOptions = {}): RealtimeAdapter {
  const provider =
    opts.provider ??
    readRequiredEnvProvider<RealtimeProvider>('AGI_REALTIME_PROVIDER', REALTIME_PROVIDERS);

  switch (provider) {
    case 'pusher':
    case 'ably':
    case 'self-hosted':
      throw new DataLayerConfigError(
        `Realtime provider "${provider}" is documented in docs/architecture/overview.md but no adapter ships yet. `,
      );
  }
}

/**
 * @file factory.ts
 * @module @agiworkforce/data-layer/factory
 *
 * Feature code never imports a concrete adapter. It calls
 * `createDatabaseClient()`, which reads either an explicit config argument or
 * the process environment, and returns the right adapter.
 *
 * Switching database host is provider selection plus credentials, no code
 * change. The product default is Neon:
 *
 * ```bash
 * AGI_DATABASE_PROVIDER=neon
 * AGI_DATABASE_URL=postgresql://...neon.tech/db?sslmode=require
 * ```
 *
 * Any other Postgres host, self-hosted, RDS, Cloud SQL, or a local server,
 * takes the same two vars against the plain-TCP driver:
 *
 * ```bash
 * AGI_DATABASE_PROVIDER=postgres
 * AGI_DATABASE_URL=postgresql://user:pwd@host:5432/db?sslmode=require
 * ```
 *
 * | Env var                             | Default  | Used by           |
 * |-------------------------------------|----------|-------------------|
 * | `AGI_DATABASE_PROVIDER`             | `neon`   | DB factory        |
 * | `AGI_DATABASE_URL` / `DATABASE_URL` | required | Neon and Postgres |
 *
 * | Provider   | Driver                     | Transport       | Edge runtimes |
 * |------------|----------------------------|-----------------|---------------|
 * | `neon`     | `@neondatabase/serverless` | WebSocket, HTTP | yes           |
 * | `postgres` | `pg`                       | TCP             | no            |
 */

import {
  type DatabaseAdapter,
  type DatabaseConnectionErrorListener,
  type DatabaseProvider,
  DataLayerConfigError,
} from './types';
import { assertDatabaseEnvironmentIsolation } from './environment-isolation';
import { NeonDatabaseAdapter, type NeonDatabaseAdapterConfig } from './adapters/neon';
import { PostgresDatabaseAdapter, type PostgresDatabaseAdapterConfig } from './adapters/postgres';

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[name];
}

const DATABASE_PROVIDERS = ['neon', 'postgres'] as const;
const DEFAULT_DATABASE_PROVIDER: DatabaseProvider = 'neon';

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
  const cfg = databaseConnectionConfig(provider, opts);

  switch (provider) {
    case 'neon':
      return new NeonDatabaseAdapter(cfg);
    case 'postgres':
      return new PostgresDatabaseAdapter(cfg);
  }
}

function databaseConnectionConfig(
  provider: DatabaseProvider,
  opts: CreateDatabaseClientOptions,
): NeonDatabaseAdapterConfig & PostgresDatabaseAdapterConfig {
  const connectionString =
    opts.connectionString ?? readEnv('AGI_DATABASE_URL') ?? readEnv('DATABASE_URL');
  if (!connectionString) {
    throw new DataLayerConfigError(
      `The ${provider} adapter requires AGI_DATABASE_URL (or DATABASE_URL), ` +
        'a postgres:// connection string.',
    );
  }
  assertDatabaseEnvironmentIsolation({ connectionString });
  const cfg: NeonDatabaseAdapterConfig & PostgresDatabaseAdapterConfig = { connectionString };
  if (opts.poolSize !== undefined) cfg.poolSize = opts.poolSize;
  if (opts.connectionTimeoutMs !== undefined) cfg.connectionTimeoutMs = opts.connectionTimeoutMs;
  if (opts.statementTimeoutMs !== undefined) cfg.statementTimeoutMs = opts.statementTimeoutMs;
  if (opts.queryTimeoutMs !== undefined) cfg.queryTimeoutMs = opts.queryTimeoutMs;
  if (opts.applicationName !== undefined) cfg.applicationName = opts.applicationName;
  if (opts.onConnectionError !== undefined) cfg.onConnectionError = opts.onConnectionError;
  if (opts.unsafeAllowUnverifiedJwtSubject === true) {
    cfg.unsafeAllowUnverifiedJwtSubject = true;
  }
  return cfg;
}

function selectDatabaseProvider(raw: string | undefined): DatabaseProvider {
  if (!raw) return DEFAULT_DATABASE_PROVIDER;
  if ((DATABASE_PROVIDERS as readonly string[]).includes(raw)) {
    return raw as DatabaseProvider;
  }
  throw new DataLayerConfigError(
    `Database provider "${raw}" is not selectable. ` +
      `Supported providers: ${DATABASE_PROVIDERS.join(', ')}.`,
  );
}

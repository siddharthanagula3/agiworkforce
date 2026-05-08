/**
 * @agiworkforce/data-layer — cloud-provider-portable persistence/auth/storage/realtime.
 *
 * # Quick start
 *
 * ```ts
 * import { createDatabaseClient } from '@agiworkforce/data-layer';
 *
 * const db = createDatabaseClient(); // reads AGI_DATABASE_PROVIDER (default: supabase)
 * const userDb = db.withUser(jwtFromRequest);
 * const rows = await userDb.query<{ id: string }>(
 *   'select id from conversations where user_id = $1',
 *   [userId],
 * );
 * ```
 *
 * # Why this package exists
 *
 * The codebase couples to Supabase today. This package introduces the seam to
 * swap Supabase for Neon, RDS, S3, Auth0, etc. without rewriting feature code.
 *
 * - Read `docs/ARCHITECTURE.md` for the system map.
 * - Read `docs/SCALING.md` for migration playbooks.
 * - Read `docs/HOSTING.md` for multi-cloud deployment.
 * - Read `docs/PERFORMANCE.md` for heavy-traffic patterns.
 */

// Interfaces — the contract feature code depends on.
export type {
  AuthAdapter,
  AuthProvider,
  DataLayerConfig,
  DatabaseAdapter,
  DatabaseConnectionConfig,
  DatabaseProvider,
  RealtimeAdapter,
  RealtimeProvider,
  RefreshedTokens,
  StorageAdapter,
  StoragePutResult,
  StorageProvider,
  VerifiedJwt,
} from './types';

// Errors.
export { DataLayerConfigError, NotImplementedError } from './types';

// Factory functions — the public entry points.
export {
  createAuthClient,
  createDatabaseClient,
  createRealtimeClient,
  createStorageClient,
} from './factory';

export type {
  CreateAuthClientOptions,
  CreateDatabaseClientOptions,
  CreateRealtimeClientOptions,
  CreateStorageClientOptions,
} from './factory';

// Concrete adapter classes — exported for advanced users (testing,
// embedding) but feature code should prefer the factory functions.
export {
  SupabaseAuthAdapter,
  SupabaseDatabaseAdapter,
  SupabaseRealtimeAdapter,
  SupabaseStorageAdapter,
} from './adapters/supabase';

export { NeonDatabaseAdapter } from './adapters/neon';
export { PostgresDatabaseAdapter } from './adapters/postgres';

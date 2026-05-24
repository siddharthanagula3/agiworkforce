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
 * - Read `docs/current/technical-architecture.md` for the system map.
 * - Read `docs/archive/2026-05-21-docs-consolidation/SCALING.md`
 *   for legacy migration playbooks.
 * - Read `docs/current/commercial-and-launch.md` for managed-compute gates.
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
export { ClerkAuthAdapter, type ClerkAuthConfig } from './adapters/clerk';

export {
  SupabaseAuthAdapter,
  SupabaseDatabaseAdapter,
  SupabaseRealtimeAdapter,
  SupabaseStorageAdapter,
} from './adapters/supabase';

export { NeonDatabaseAdapter } from './adapters/neon';
export { PostgresDatabaseAdapter } from './adapters/postgres';

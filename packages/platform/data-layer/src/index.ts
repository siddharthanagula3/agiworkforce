
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

export { DataLayerConfigError, NotImplementedError } from './types';

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
export { ClerkAuthAdapter, type ClerkAuthConfig } from './adapters/clerk';

export { NeonDatabaseAdapter } from './adapters/neon';
export { PostgresDatabaseAdapter } from './adapters/postgres';

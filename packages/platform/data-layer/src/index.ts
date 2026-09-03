export type {
  AuthAdapter,
  AuthProvider,
  DataLayerConfig,
  DatabaseAdapter,
  DatabaseConnectionConfig,
  DatabaseConnectionErrorEvent,
  DatabaseConnectionErrorListener,
  DatabaseConnectionErrorScope,
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

export { ClerkAuthAdapter, type ClerkAuthConfig } from './adapters/clerk';

export { NeonDatabaseAdapter } from './adapters/neon';
export { PostgresDatabaseAdapter } from './adapters/postgres';

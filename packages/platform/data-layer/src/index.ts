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
  VerifiedJwt,
} from './types';

export { DataLayerConfigError, NotImplementedError } from './types';

export { createAuthClient, createDatabaseClient, createRealtimeClient } from './factory';

export type {
  CreateAuthClientOptions,
  CreateDatabaseClientOptions,
  CreateRealtimeClientOptions,
} from './factory';

export { ClerkAuthAdapter, type ClerkAuthConfig } from './adapters/clerk';

export { NeonDatabaseAdapter, type NeonDatabaseAdapterConfig } from './adapters/neon';
export { PostgresDatabaseAdapter, type PostgresDatabaseAdapterConfig } from './adapters/postgres';

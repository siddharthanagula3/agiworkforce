export type {
  DatabaseAdapter,
  DatabaseConnectionConfig,
  DatabaseConnectionErrorEvent,
  DatabaseConnectionErrorListener,
  DatabaseConnectionErrorScope,
  DatabaseProvider,
} from './types';

export { DataLayerConfigError } from './types';

export { createDatabaseClient, type CreateDatabaseClientOptions } from './factory';

export { NeonDatabaseAdapter, type NeonDatabaseAdapterConfig } from './adapters/neon';
export { PostgresDatabaseAdapter, type PostgresDatabaseAdapterConfig } from './adapters/postgres';

export {
  assertDatabaseEnvironmentIsolation,
  checkConfigKeys,
  defineConfigKeys,
  deployedValueViolations,
  DEPLOYED_VALUE_RULES,
  isLoopbackConnectionString,
  resolveRuntimeEnvironment,
  REMOTE_DATABASE_OVERRIDE_VALUE,
  REMOTE_DATABASE_OVERRIDE_VAR,
  type ConfigKeyDescriptor,
  type ConfigKeyLifecycle,
  type ConfigKeyRegistry,
  type ConfigKeySecrecy,
  type ConfigKeyType,
  type ConfigKeyViolation,
  type ConfigKeyViolationReason,
  type DeployedValueRule,
  type DeployedValueViolation,
  type DatabaseEnvironmentIsolationOptions,
  type IsolationEnvironment,
  type RuntimeEnvironment,
} from './environment-isolation';

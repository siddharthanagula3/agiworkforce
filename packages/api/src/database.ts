/**
 * Database API — typed wrappers for db_* Tauri commands (SQL, MySQL, MongoDB, Redis).
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface ConnectionConfig {
  host: string;
  port: number;
  username?: string;
  database?: string;
  ssl?: boolean;
  [key: string]: unknown;
}

export interface PoolConfig {
  maxConnections?: number;
  minConnections?: number;
  idleTimeout?: number;
}

export interface QueryValidation {
  valid: boolean;
  queryType?: string;
  errors: string[];
}

export interface SelectQuery {
  table: string;
  columns?: string[];
  where?: string;
  orderBy?: string;
  limit?: number;
}

export interface InsertQuery {
  table: string;
  columns: string[];
  values: unknown[][];
}

export interface UpdateQuery {
  table: string;
  set: Record<string, unknown>;
  where: string;
}

export interface DeleteQuery {
  table: string;
  where: string;
}

// ---- Connection Pool ----

export async function dbCreatePool(
  connectionId: string,
  config: ConnectionConfig,
  poolConfig: PoolConfig,
): Promise<void> {
  return command<void>('db_create_pool', { connectionId, config, poolConfig });
}

export async function dbClosePool(connectionId: string): Promise<void> {
  return command<void>('db_close_pool', { connectionId });
}

export async function dbListPools(): Promise<string[]> {
  return command<string[]>('db_list_pools');
}

export async function dbGetPoolStats(connectionId: string): Promise<unknown> {
  return command<unknown>('db_get_pool_stats', { connectionId });
}

// ---- Query Execution ----

export async function dbExecuteQuery(connectionId: string, sql: string): Promise<unknown> {
  return command<unknown>('db_execute_query', { connectionId, sql });
}

export async function dbExecutePrepared(
  connectionId: string,
  sql: string,
  params: unknown[],
): Promise<unknown> {
  return command<unknown>('db_execute_prepared', { connectionId, sql, params });
}

export async function dbExecuteBatch(connectionId: string, queries: string[]): Promise<unknown[]> {
  return command<unknown[]>('db_execute_batch', { connectionId, queries });
}

export async function dbValidateQuery(sql: string): Promise<QueryValidation> {
  return command<QueryValidation>('db_validate_query', { sql });
}

// ---- Query Builder ----

export async function dbBuildSelect(query: SelectQuery): Promise<string> {
  return command<string>('db_build_select', { query });
}

export async function dbBuildInsert(query: InsertQuery): Promise<string> {
  return command<string>('db_build_insert', { query });
}

export async function dbBuildUpdate(query: UpdateQuery): Promise<string> {
  return command<string>('db_build_update', { query });
}

export async function dbBuildDelete(query: DeleteQuery): Promise<string> {
  return command<string>('db_build_delete', { query });
}

// ---- Credential Storage ----

export async function dbStorePassword(connectionId: string, password: string): Promise<void> {
  return command<void>('db_store_password', { connectionId, password });
}

export async function dbHasStoredPassword(connectionId: string): Promise<boolean> {
  return command<boolean>('db_has_stored_password', { connectionId });
}

export async function dbGetStoredPassword(connectionId: string): Promise<string | null> {
  return command<string | null>('db_get_stored_password', { connectionId });
}

export async function dbDeleteStoredPassword(connectionId: string): Promise<void> {
  return command<void>('db_delete_stored_password', { connectionId });
}

// ---- MySQL ----

export async function dbMysqlTestConnection(connectionId: string): Promise<boolean> {
  return command<boolean>('db_mysql_test_connection', { connectionId });
}

export async function dbMysqlListTables(connectionId: string): Promise<string[]> {
  return command<string[]>('db_mysql_list_tables', { connectionId });
}

export async function dbMysqlDescribeTable(
  connectionId: string,
  tableName: string,
): Promise<unknown> {
  return command<unknown>('db_mysql_describe_table', { connectionId, tableName });
}

export async function dbMysqlListIndexes(
  connectionId: string,
  tableName: string,
): Promise<unknown> {
  return command<unknown>('db_mysql_list_indexes', { connectionId, tableName });
}

export async function dbMysqlCallProcedure(
  connectionId: string,
  procedureName: string,
  params: unknown[],
): Promise<unknown[]> {
  return command<unknown[]>('db_mysql_call_procedure', { connectionId, procedureName, params });
}

export async function dbMysqlBulkInsert(
  connectionId: string,
  tableName: string,
  columns: string[],
  rows: unknown[][],
): Promise<number> {
  return command<number>('db_mysql_bulk_insert', { connectionId, tableName, columns, rows });
}

// ---- MongoDB ----

export async function dbMongoConnect(
  connectionId: string,
  config: ConnectionConfig,
): Promise<void> {
  return command<void>('db_mongo_connect', { connectionId, config });
}

export async function dbMongoFind(
  connectionId: string,
  collection: string,
  filter: Record<string, unknown>,
  limit?: number,
): Promise<unknown> {
  return command<unknown>('db_mongo_find', { connectionId, collection, filter, limit });
}

export async function dbMongoFindOne(
  connectionId: string,
  collection: string,
  filter: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  return command<Record<string, unknown> | null>('db_mongo_find_one', {
    connectionId,
    collection,
    filter,
  });
}

export async function dbMongoInsertOne(
  connectionId: string,
  collection: string,
  document: Record<string, unknown>,
): Promise<string> {
  return command<string>('db_mongo_insert_one', { connectionId, collection, document });
}

export async function dbMongoInsertMany(
  connectionId: string,
  collection: string,
  documents: Record<string, unknown>[],
): Promise<string[]> {
  return command<string[]>('db_mongo_insert_many', { connectionId, collection, documents });
}

export async function dbMongoUpdateMany(
  connectionId: string,
  collection: string,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
): Promise<unknown> {
  return command<unknown>('db_mongo_update_many', { connectionId, collection, filter, update });
}

export async function dbMongoDeleteMany(
  connectionId: string,
  collection: string,
  filter: Record<string, unknown>,
): Promise<number> {
  return command<number>('db_mongo_delete_many', { connectionId, collection, filter });
}

export async function dbMongoDisconnect(connectionId: string): Promise<void> {
  return command<void>('db_mongo_disconnect', { connectionId });
}

// ---- Redis ----

export async function dbRedisConnect(
  connectionId: string,
  config: ConnectionConfig,
): Promise<void> {
  return command<void>('db_redis_connect', { connectionId, config });
}

export async function dbRedisGet(connectionId: string, key: string): Promise<string | null> {
  return command<string | null>('db_redis_get', { connectionId, key });
}

export async function dbRedisSet(
  connectionId: string,
  key: string,
  value: string,
  expirationSeconds?: number,
): Promise<void> {
  return command<void>('db_redis_set', { connectionId, key, value, expirationSeconds });
}

export async function dbRedisDel(connectionId: string, keys: string[]): Promise<number> {
  return command<number>('db_redis_del', { connectionId, keys });
}

export async function dbRedisExists(connectionId: string, key: string): Promise<boolean> {
  return command<boolean>('db_redis_exists', { connectionId, key });
}

export async function dbRedisExpire(
  connectionId: string,
  key: string,
  seconds: number,
): Promise<boolean> {
  return command<boolean>('db_redis_expire', { connectionId, key, seconds });
}

export async function dbRedisHget(
  connectionId: string,
  key: string,
  field: string,
): Promise<string | null> {
  return command<string | null>('db_redis_hget', { connectionId, key, field });
}

export async function dbRedisHset(
  connectionId: string,
  key: string,
  field: string,
  value: string,
): Promise<boolean> {
  return command<boolean>('db_redis_hset', { connectionId, key, field, value });
}

export async function dbRedisHgetall(
  connectionId: string,
  key: string,
): Promise<Record<string, string>> {
  return command<Record<string, string>>('db_redis_hgetall', { connectionId, key });
}

export async function dbRedisDisconnect(connectionId: string): Promise<void> {
  return command<void>('db_redis_disconnect', { connectionId });
}

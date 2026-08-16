
import { invoke, isTauri } from '../lib/tauri-mock';

export interface ConnectionConfig {
  database_type: 'Postgres' | 'MySql' | 'Sqlite' | 'MongoDB' | 'Redis';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  file_path?: string;
  connection_string?: string;
}

export interface PoolConfig {
  max_size: number;
  min_idle: number;
  connection_timeout_seconds: number;
}

export interface QueryResult {
  columns?: string[];
  rows?: SqlRowValue[][];
  affected_rows?: number;
  execution_time_ms?: number;
}

export type SqlRowValue = string | number | boolean | null;

export interface QueryValidation {
  is_valid: boolean;
  query_type?: string;
  tables?: string[];
  risk_level?: string;
  warnings?: string[];
  error?: string;
}

export interface PoolStats {
  active_connections: number;
  idle_connections: number;
  max_connections: number;
  total_queries: number;
}

export interface MySqlColumnInfo {
  name: string;
  data_type: string;
  nullable: boolean;
  key?: string;
  default_value?: string;
  extra?: string;
}

export interface MySqlIndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  index_type?: string;
}

export type MongoDocument = Record<string, unknown>;

export type MongoFilter = Record<string, unknown>;

export type MongoUpdate = Record<string, unknown>;

export interface MongoResult {
  matched_count?: number;
  modified_count?: number;
  upserted_id?: string;
}

export interface SelectQuery {
  table: string;
  columns: string[];
  where_clause?: string;
  limit?: number;
  offset?: number;
}

export interface InsertQuery {
  table: string;
  columns: string[];
  values: string[][];
}

export interface UpdateQuery {
  table: string;
  set_values: Record<string, string>;
  where_clause?: string;
}

export interface DeleteQuery {
  table: string;
  where_clause?: string;
}

export async function dbCreatePool(
  connectionId: string,
  config: ConnectionConfig,
  poolConfig: PoolConfig,
): Promise<void> {
  if (!isTauri) {
    console.debug('[database] dbCreatePool (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_create_pool', {
      connectionId,
      config,
      poolConfig,
    });
  } catch (error) {
    throw new Error(`Failed to create connection pool: ${error}`);
  }
}

export async function dbExecuteQuery(connectionId: string, sql: string): Promise<QueryResult> {
  if (!isTauri) {
    console.debug('[database] dbExecuteQuery (mock)', connectionId, sql);
    return { columns: [], rows: [] };
  }

  try {
    return await invoke<QueryResult>('db_execute_query', {
      connectionId,
      sql,
    });
  } catch (error) {
    throw new Error(`Query execution failed: ${error}`);
  }
}

export async function dbExecutePrepared(
  connectionId: string,
  sql: string,
  params: SqlRowValue[],
): Promise<QueryResult> {
  if (!isTauri) {
    console.debug('[database] dbExecutePrepared (mock)', connectionId, sql);
    return { columns: [], rows: [] };
  }

  try {
    return await invoke<QueryResult>('db_execute_prepared', {
      connectionId,
      sql,
      params,
    });
  } catch (error) {
    throw new Error(`Prepared statement execution failed: ${error}`);
  }
}

export async function dbExecuteBatch(
  connectionId: string,
  queries: string[],
): Promise<QueryResult[]> {
  if (!isTauri) {
    console.debug('[database] dbExecuteBatch (mock)', connectionId, queries.length);
    return [];
  }

  try {
    return await invoke<QueryResult[]>('db_execute_batch', {
      connectionId,
      queries,
    });
  } catch (error) {
    throw new Error(`Batch execution failed: ${error}`);
  }
}

export async function dbClosePool(connectionId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[database] dbClosePool (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_close_pool', { connectionId });
  } catch (error) {
    throw new Error(`Failed to close pool: ${error}`);
  }
}

export async function dbListPools(): Promise<string[]> {
  if (!isTauri) {
    console.debug('[database] dbListPools (mock)');
    return [];
  }

  try {
    return await invoke<string[]>('db_list_pools');
  } catch (error) {
    throw new Error(`Failed to list pools: ${error}`);
  }
}

export async function dbGetPoolStats(connectionId: string): Promise<PoolStats> {
  if (!isTauri) {
    console.debug('[database] dbGetPoolStats (mock)', connectionId);
    return { active_connections: 0, idle_connections: 0, max_connections: 0, total_queries: 0 };
  }

  try {
    return await invoke<PoolStats>('db_get_pool_stats', { connectionId });
  } catch (error) {
    throw new Error(`Failed to get pool stats: ${error}`);
  }
}

export async function dbValidateQuery(sql: string): Promise<QueryValidation> {
  if (!isTauri) {
    console.debug('[database] dbValidateQuery (mock)', sql);
    return { is_valid: true, query_type: 'SELECT', tables: [], risk_level: 'low', warnings: [] };
  }

  try {
    return await invoke<QueryValidation>('db_validate_query', { sql });
  } catch (error) {
    throw new Error(`Query validation failed: ${error}`);
  }
}

export async function dbBuildSelect(query: SelectQuery): Promise<string> {
  if (!isTauri) {
    console.debug('[database] dbBuildSelect (mock)', query.table);
    return `SELECT ${query.columns.join(', ')} FROM ${query.table}`;
  }

  try {
    return await invoke<string>('db_build_select', { query });
  } catch (error) {
    throw new Error(`Failed to build SELECT query: ${error}`);
  }
}

export async function dbBuildInsert(query: InsertQuery): Promise<string> {
  if (!isTauri) {
    console.debug('[database] dbBuildInsert (mock)', query.table);
    return `INSERT INTO ${query.table} (${query.columns.join(', ')}) VALUES (...)`;
  }

  try {
    return await invoke<string>('db_build_insert', { query });
  } catch (error) {
    throw new Error(`Failed to build INSERT query: ${error}`);
  }
}

export async function dbBuildUpdate(query: UpdateQuery): Promise<string> {
  if (!isTauri) {
    console.debug('[database] dbBuildUpdate (mock)', query.table);
    return `UPDATE ${query.table} SET ...`;
  }

  try {
    return await invoke<string>('db_build_update', { query });
  } catch (error) {
    throw new Error(`Failed to build UPDATE query: ${error}`);
  }
}

export async function dbBuildDelete(query: DeleteQuery): Promise<string> {
  if (!isTauri) {
    console.debug('[database] dbBuildDelete (mock)', query.table);
    return `DELETE FROM ${query.table}`;
  }

  try {
    return await invoke<string>('db_build_delete', { query });
  } catch (error) {
    throw new Error(`Failed to build DELETE query: ${error}`);
  }
}

export async function dbMysqlTestConnection(connectionId: string): Promise<boolean> {
  if (!isTauri) {
    console.debug('[database] dbMysqlTestConnection (mock)', connectionId);
    return true;
  }

  try {
    return await invoke<boolean>('db_mysql_test_connection', { connectionId });
  } catch (error) {
    throw new Error(`MySQL connection test failed: ${error}`);
  }
}

export async function dbMysqlListTables(connectionId: string): Promise<string[]> {
  if (!isTauri) {
    console.debug('[database] dbMysqlListTables (mock)', connectionId);
    return [];
  }

  try {
    return await invoke<string[]>('db_mysql_list_tables', { connectionId });
  } catch (error) {
    throw new Error(`MySQL list tables failed: ${error}`);
  }
}

export async function dbMysqlDescribeTable(
  connectionId: string,
  tableName: string,
): Promise<MySqlColumnInfo[]> {
  if (!isTauri) {
    console.debug('[database] dbMysqlDescribeTable (mock)', connectionId, tableName);
    return [];
  }

  try {
    return await invoke<MySqlColumnInfo[]>('db_mysql_describe_table', {
      connectionId,
      tableName,
    });
  } catch (error) {
    throw new Error(`MySQL describe table failed: ${error}`);
  }
}

export async function dbMysqlListIndexes(
  connectionId: string,
  tableName: string,
): Promise<MySqlIndexInfo[]> {
  if (!isTauri) {
    console.debug('[database] dbMysqlListIndexes (mock)', connectionId, tableName);
    return [];
  }

  try {
    return await invoke<MySqlIndexInfo[]>('db_mysql_list_indexes', {
      connectionId,
      tableName,
    });
  } catch (error) {
    throw new Error(`MySQL list indexes failed: ${error}`);
  }
}

export async function dbMysqlCallProcedure(
  connectionId: string,
  procedureName: string,
  params: unknown[],
): Promise<unknown[]> {
  if (!isTauri) {
    console.debug('[database] dbMysqlCallProcedure (mock)', connectionId, procedureName);
    return [];
  }

  try {
    return await invoke<unknown[]>('db_mysql_call_procedure', {
      connectionId,
      procedureName,
      params,
    });
  } catch (error) {
    throw new Error(`MySQL call procedure failed: ${error}`);
  }
}

export async function dbMysqlBulkInsert(
  connectionId: string,
  tableName: string,
  columns: string[],
  rows: unknown[][],
): Promise<number> {
  if (!isTauri) {
    console.debug('[database] dbMysqlBulkInsert (mock)', connectionId, tableName, rows.length);
    return 0;
  }

  try {
    return await invoke<number>('db_mysql_bulk_insert', {
      connectionId,
      tableName,
      columns,
      rows,
    });
  } catch (error) {
    throw new Error(`MySQL bulk insert failed: ${error}`);
  }
}

export async function dbMongoConnect(
  connectionId: string,
  config: ConnectionConfig,
): Promise<void> {
  if (!isTauri) {
    console.debug('[database] dbMongoConnect (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_mongo_connect', {
      connectionId,
      config,
    });
  } catch (error) {
    throw new Error(`MongoDB connection failed: ${error}`);
  }
}

export async function dbMongoFind(
  connectionId: string,
  collection: string,
  filter: MongoFilter,
  limit?: number,
): Promise<MongoDocument[]> {
  if (!isTauri) {
    console.debug('[database] dbMongoFind (mock)', connectionId, collection);
    return [];
  }

  try {
    const result = await invoke<MongoDocument[]>('db_mongo_find', {
      connectionId,
      collection,
      filter,
      limit,
    });
    return result;
  } catch (error) {
    throw new Error(`MongoDB find failed: ${error}`);
  }
}

export async function dbMongoFindOne(
  connectionId: string,
  collection: string,
  filter: MongoFilter,
): Promise<MongoDocument | null> {
  if (!isTauri) {
    console.debug('[database] dbMongoFindOne (mock)', connectionId, collection);
    return null;
  }

  try {
    return await invoke<MongoDocument | null>('db_mongo_find_one', {
      connectionId,
      collection,
      filter,
    });
  } catch (error) {
    throw new Error(`MongoDB findOne failed: ${error}`);
  }
}

export async function dbMongoInsertOne(
  connectionId: string,
  collection: string,
  document: MongoDocument,
): Promise<string> {
  if (!isTauri) {
    console.debug('[database] dbMongoInsertOne (mock)', connectionId, collection);
    return `mock_id_${Date.now()}`;
  }

  try {
    return await invoke<string>('db_mongo_insert_one', {
      connectionId,
      collection,
      document,
    });
  } catch (error) {
    throw new Error(`MongoDB insertOne failed: ${error}`);
  }
}

export async function dbMongoInsertMany(
  connectionId: string,
  collection: string,
  documents: MongoDocument[],
): Promise<string[]> {
  if (!isTauri) {
    console.debug(
      '[database] dbMongoInsertMany (mock)',
      connectionId,
      collection,
      documents.length,
    );
    return [];
  }

  try {
    return await invoke<string[]>('db_mongo_insert_many', {
      connectionId,
      collection,
      documents,
    });
  } catch (error) {
    throw new Error(`MongoDB insertMany failed: ${error}`);
  }
}

export async function dbMongoUpdateMany(
  connectionId: string,
  collection: string,
  filter: MongoFilter,
  update: MongoUpdate,
): Promise<MongoResult> {
  if (!isTauri) {
    console.debug('[database] dbMongoUpdateMany (mock)', connectionId, collection);
    return { matched_count: 0, modified_count: 0 };
  }

  try {
    return await invoke<MongoResult>('db_mongo_update_many', {
      connectionId,
      collection,
      filter,
      update,
    });
  } catch (error) {
    throw new Error(`MongoDB updateMany failed: ${error}`);
  }
}

export async function dbMongoDeleteMany(
  connectionId: string,
  collection: string,
  filter: MongoFilter,
): Promise<number> {
  if (!isTauri) {
    console.debug('[database] dbMongoDeleteMany (mock)', connectionId, collection);
    return 0;
  }

  try {
    return await invoke<number>('db_mongo_delete_many', {
      connectionId,
      collection,
      filter,
    });
  } catch (error) {
    throw new Error(`MongoDB deleteMany failed: ${error}`);
  }
}

export async function dbMongoDisconnect(connectionId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[database] dbMongoDisconnect (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_mongo_disconnect', { connectionId });
  } catch (error) {
    throw new Error(`MongoDB disconnect failed: ${error}`);
  }
}

export async function dbRedisConnect(
  connectionId: string,
  config: ConnectionConfig,
): Promise<void> {
  if (!isTauri) {
    console.debug('[database] dbRedisConnect (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_redis_connect', {
      connectionId,
      config,
    });
  } catch (error) {
    throw new Error(`Redis connection failed: ${error}`);
  }
}

export async function dbRedisGet(connectionId: string, key: string): Promise<string | null> {
  if (!isTauri) {
    console.debug('[database] dbRedisGet (mock)', connectionId, key);
    return null;
  }

  try {
    return await invoke<string | null>('db_redis_get', {
      connectionId,
      key,
    });
  } catch (error) {
    throw new Error(`Redis GET failed: ${error}`);
  }
}

export async function dbRedisSet(
  connectionId: string,
  key: string,
  value: string,
  expirationSeconds?: number,
): Promise<void> {
  if (!isTauri) {
    console.debug('[database] dbRedisSet (mock)', connectionId, key);
    return;
  }

  try {
    return await invoke<void>('db_redis_set', {
      connectionId,
      key,
      value,
      expirationSeconds,
    });
  } catch (error) {
    throw new Error(`Redis SET failed: ${error}`);
  }
}

export async function dbRedisDel(connectionId: string, keys: string[]): Promise<number> {
  if (!isTauri) {
    console.debug('[database] dbRedisDel (mock)', connectionId, keys.length);
    return 0;
  }

  try {
    return await invoke<number>('db_redis_del', {
      connectionId,
      keys,
    });
  } catch (error) {
    throw new Error(`Redis DEL failed: ${error}`);
  }
}

export async function dbRedisExists(connectionId: string, key: string): Promise<boolean> {
  if (!isTauri) {
    console.debug('[database] dbRedisExists (mock)', connectionId, key);
    return false;
  }

  try {
    return await invoke<boolean>('db_redis_exists', {
      connectionId,
      key,
    });
  } catch (error) {
    throw new Error(`Redis EXISTS failed: ${error}`);
  }
}

export async function dbRedisExpire(
  connectionId: string,
  key: string,
  seconds: number,
): Promise<boolean> {
  if (!isTauri) {
    console.debug('[database] dbRedisExpire (mock)', connectionId, key, seconds);
    return true;
  }

  try {
    return await invoke<boolean>('db_redis_expire', {
      connectionId,
      key,
      seconds,
    });
  } catch (error) {
    throw new Error(`Redis EXPIRE failed: ${error}`);
  }
}

export async function dbRedisHGet(
  connectionId: string,
  key: string,
  field: string,
): Promise<string | null> {
  if (!isTauri) {
    console.debug('[database] dbRedisHGet (mock)', connectionId, key, field);
    return null;
  }

  try {
    return await invoke<string | null>('db_redis_hget', {
      connectionId,
      key,
      field,
    });
  } catch (error) {
    throw new Error(`Redis HGET failed: ${error}`);
  }
}

export async function dbRedisHSet(
  connectionId: string,
  key: string,
  field: string,
  value: string,
): Promise<boolean> {
  if (!isTauri) {
    console.debug('[database] dbRedisHSet (mock)', connectionId, key, field);
    return true;
  }

  try {
    return await invoke<boolean>('db_redis_hset', {
      connectionId,
      key,
      field,
      value,
    });
  } catch (error) {
    throw new Error(`Redis HSET failed: ${error}`);
  }
}

export async function dbRedisHGetAll(
  connectionId: string,
  key: string,
): Promise<Record<string, string>> {
  if (!isTauri) {
    console.debug('[database] dbRedisHGetAll (mock)', connectionId, key);
    return {};
  }

  try {
    return await invoke<Record<string, string>>('db_redis_hgetall', {
      connectionId,
      key,
    });
  } catch (error) {
    throw new Error(`Redis HGETALL failed: ${error}`);
  }
}

export async function dbRedisDisconnect(connectionId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[database] dbRedisDisconnect (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_redis_disconnect', { connectionId });
  } catch (error) {
    throw new Error(`Redis disconnect failed: ${error}`);
  }
}

export async function dbStorePassword(connectionId: string, password: string): Promise<void> {
  if (!isTauri) {
    console.debug('[database] dbStorePassword (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_store_password', {
      connectionId,
      password,
    });
  } catch (error) {
    throw new Error(`Failed to store password: ${error}`);
  }
}

export async function dbHasStoredPassword(connectionId: string): Promise<boolean> {
  if (!isTauri) {
    console.debug('[database] dbHasStoredPassword (mock)', connectionId);
    return false;
  }

  try {
    return await invoke<boolean>('db_has_stored_password', { connectionId });
  } catch (error) {
    throw new Error(`Failed to check stored password: ${error}`);
  }
}

export async function dbGetStoredPassword(connectionId: string): Promise<string | null> {
  if (!isTauri) {
    console.debug('[database] dbGetStoredPassword (mock)', connectionId);
    return null;
  }

  try {
    return await invoke<string | null>('db_get_stored_password', { connectionId });
  } catch (error) {
    throw new Error(`Failed to retrieve stored password: ${error}`);
  }
}

export async function dbDeleteStoredPassword(connectionId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[database] dbDeleteStoredPassword (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_delete_stored_password', { connectionId });
  } catch (error) {
    throw new Error(`Failed to delete stored password: ${error}`);
  }
}

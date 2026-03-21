/**
 * Database API
 *
 * TypeScript wrappers for all database Tauri commands.
 * Covers SQL (Postgres, MySQL, SQLite), MongoDB, and Redis operations
 * plus secure password storage, query building, and pool management.
 *
 * 40 commands total:
 * - SQL Core: create_pool, execute_query, execute_prepared, execute_batch, close_pool, list_pools, get_pool_stats
 * - SQL Query Builders: build_select, build_insert, build_update, build_delete, validate_query
 * - MySQL: test_connection, list_tables, describe_table, list_indexes, call_procedure, bulk_insert
 * - MongoDB: connect, find, find_one, insert_one, insert_many, update_many, delete_many, disconnect
 * - Redis: connect, get, set, del, exists, expire, hget, hset, hgetall, disconnect
 * - Password: store_password, has_stored_password, get_stored_password, delete_stored_password
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/** Database connection configuration */
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

/** Connection pool configuration */
export interface PoolConfig {
  max_size: number;
  min_idle: number;
  connection_timeout_seconds: number;
}

/** SQL query result */
export interface QueryResult {
  columns?: string[];
  rows?: SqlRowValue[][];
  affected_rows?: number;
  execution_time_ms?: number;
}

/** SQL row value types */
export type SqlRowValue = string | number | boolean | null;

/** SQL query validation result */
export interface QueryValidation {
  is_valid: boolean;
  query_type?: string;
  tables?: string[];
  risk_level?: string;
  warnings?: string[];
  error?: string;
}

/** Connection pool statistics */
export interface PoolStats {
  active_connections: number;
  idle_connections: number;
  max_connections: number;
  total_queries: number;
}

/** MySQL column information */
export interface MySqlColumnInfo {
  name: string;
  data_type: string;
  nullable: boolean;
  key?: string;
  default_value?: string;
  extra?: string;
}

/** MySQL index information */
export interface MySqlIndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  index_type?: string;
}

/** MongoDB document type */
export type MongoDocument = Record<string, unknown>;

/** MongoDB query filter */
export type MongoFilter = Record<string, unknown>;

/** MongoDB update operations */
export type MongoUpdate = Record<string, unknown>;

/** MongoDB operation result */
export interface MongoResult {
  matched_count?: number;
  modified_count?: number;
  upserted_id?: string;
}

/** SELECT query parameters */
export interface SelectQuery {
  table: string;
  columns: string[];
  where_clause?: string;
  limit?: number;
  offset?: number;
}

/** INSERT query parameters */
export interface InsertQuery {
  table: string;
  columns: string[];
  values: string[][];
}

/** UPDATE query parameters */
export interface UpdateQuery {
  table: string;
  set_values: Record<string, string>;
  where_clause?: string;
}

/** DELETE query parameters */
export interface DeleteQuery {
  table: string;
  where_clause?: string;
}

// ============================================================================
// SQL Core Operations
// ============================================================================

/**
 * Create a new SQL connection pool.
 * Supports Postgres, MySQL, and SQLite.
 */
export async function dbCreatePool(
  connectionId: string,
  config: ConnectionConfig,
  poolConfig: PoolConfig,
): Promise<void> {
  if (!isTauri) {
    console.info('[database] dbCreatePool (mock)', connectionId);
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

/**
 * Execute a read-only SQL query against a connection.
 * Only SELECT and WITH (CTE) statements are allowed.
 */
export async function dbExecuteQuery(connectionId: string, sql: string): Promise<QueryResult> {
  if (!isTauri) {
    console.info('[database] dbExecuteQuery (mock)', connectionId, sql);
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

/**
 * Execute a prepared statement with parameterized values.
 * Supports SELECT, INSERT, UPDATE, DELETE, and WITH statements.
 * Write operations (INSERT/UPDATE/DELETE) require user confirmation.
 */
export async function dbExecutePrepared(
  connectionId: string,
  sql: string,
  params: SqlRowValue[],
): Promise<QueryResult> {
  if (!isTauri) {
    console.info('[database] dbExecutePrepared (mock)', connectionId, sql);
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

/**
 * Execute multiple read-only SQL queries in a batch.
 * Each query must be a SELECT or WITH statement.
 * Maximum 100 queries per batch.
 */
export async function dbExecuteBatch(
  connectionId: string,
  queries: string[],
): Promise<QueryResult[]> {
  if (!isTauri) {
    console.info('[database] dbExecuteBatch (mock)', connectionId, queries.length);
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

/**
 * Close a SQL connection pool and release resources.
 */
export async function dbClosePool(connectionId: string): Promise<void> {
  if (!isTauri) {
    console.info('[database] dbClosePool (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_close_pool', { connectionId });
  } catch (error) {
    throw new Error(`Failed to close pool: ${error}`);
  }
}

/**
 * List all active connection pool IDs.
 */
export async function dbListPools(): Promise<string[]> {
  if (!isTauri) {
    console.info('[database] dbListPools (mock)');
    return [];
  }

  try {
    return await invoke<string[]>('db_list_pools');
  } catch (error) {
    throw new Error(`Failed to list pools: ${error}`);
  }
}

/**
 * Get statistics for a connection pool (active/idle connections, query count).
 */
export async function dbGetPoolStats(connectionId: string): Promise<PoolStats> {
  if (!isTauri) {
    console.info('[database] dbGetPoolStats (mock)', connectionId);
    return { active_connections: 0, idle_connections: 0, max_connections: 0, total_queries: 0 };
  }

  try {
    return await invoke<PoolStats>('db_get_pool_stats', { connectionId });
  } catch (error) {
    throw new Error(`Failed to get pool stats: ${error}`);
  }
}

// ============================================================================
// SQL Query Validation & Building
// ============================================================================

/**
 * Validate a SQL query for security and correctness.
 * Returns risk level, tables accessed, and any warnings.
 */
export async function dbValidateQuery(sql: string): Promise<QueryValidation> {
  if (!isTauri) {
    console.info('[database] dbValidateQuery (mock)', sql);
    return { is_valid: true, query_type: 'SELECT', tables: [], risk_level: 'low', warnings: [] };
  }

  try {
    return await invoke<QueryValidation>('db_validate_query', { sql });
  } catch (error) {
    throw new Error(`Query validation failed: ${error}`);
  }
}

/**
 * Build a SELECT SQL string from structured parameters.
 */
export async function dbBuildSelect(query: SelectQuery): Promise<string> {
  if (!isTauri) {
    console.info('[database] dbBuildSelect (mock)', query.table);
    return `SELECT ${query.columns.join(', ')} FROM ${query.table}`;
  }

  try {
    return await invoke<string>('db_build_select', { query });
  } catch (error) {
    throw new Error(`Failed to build SELECT query: ${error}`);
  }
}

/**
 * Build an INSERT SQL string from structured parameters.
 * WARNING: Returns interpolated SQL. Use dbExecutePrepared for actual writes.
 */
export async function dbBuildInsert(query: InsertQuery): Promise<string> {
  if (!isTauri) {
    console.info('[database] dbBuildInsert (mock)', query.table);
    return `INSERT INTO ${query.table} (${query.columns.join(', ')}) VALUES (...)`;
  }

  try {
    return await invoke<string>('db_build_insert', { query });
  } catch (error) {
    throw new Error(`Failed to build INSERT query: ${error}`);
  }
}

/**
 * Build an UPDATE SQL string from structured parameters.
 * WARNING: Returns interpolated SQL. Use dbExecutePrepared for actual writes.
 */
export async function dbBuildUpdate(query: UpdateQuery): Promise<string> {
  if (!isTauri) {
    console.info('[database] dbBuildUpdate (mock)', query.table);
    return `UPDATE ${query.table} SET ...`;
  }

  try {
    return await invoke<string>('db_build_update', { query });
  } catch (error) {
    throw new Error(`Failed to build UPDATE query: ${error}`);
  }
}

/**
 * Build a DELETE SQL string from structured parameters.
 */
export async function dbBuildDelete(query: DeleteQuery): Promise<string> {
  if (!isTauri) {
    console.info('[database] dbBuildDelete (mock)', query.table);
    return `DELETE FROM ${query.table}`;
  }

  try {
    return await invoke<string>('db_build_delete', { query });
  } catch (error) {
    throw new Error(`Failed to build DELETE query: ${error}`);
  }
}

// ============================================================================
// MySQL-Specific Operations
// ============================================================================

/**
 * Test a MySQL connection by executing a simple query.
 */
export async function dbMysqlTestConnection(connectionId: string): Promise<boolean> {
  if (!isTauri) {
    console.info('[database] dbMysqlTestConnection (mock)', connectionId);
    return true;
  }

  try {
    return await invoke<boolean>('db_mysql_test_connection', { connectionId });
  } catch (error) {
    throw new Error(`MySQL connection test failed: ${error}`);
  }
}

/**
 * List all tables in a MySQL database.
 */
export async function dbMysqlListTables(connectionId: string): Promise<string[]> {
  if (!isTauri) {
    console.info('[database] dbMysqlListTables (mock)', connectionId);
    return [];
  }

  try {
    return await invoke<string[]>('db_mysql_list_tables', { connectionId });
  } catch (error) {
    throw new Error(`MySQL list tables failed: ${error}`);
  }
}

/**
 * Describe a MySQL table schema (columns, types, keys).
 */
export async function dbMysqlDescribeTable(
  connectionId: string,
  tableName: string,
): Promise<MySqlColumnInfo[]> {
  if (!isTauri) {
    console.info('[database] dbMysqlDescribeTable (mock)', connectionId, tableName);
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

/**
 * List indexes on a MySQL table.
 */
export async function dbMysqlListIndexes(
  connectionId: string,
  tableName: string,
): Promise<MySqlIndexInfo[]> {
  if (!isTauri) {
    console.info('[database] dbMysqlListIndexes (mock)', connectionId, tableName);
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

/**
 * Call a MySQL stored procedure with parameters.
 * Procedure name must match pattern: [a-zA-Z_][a-zA-Z0-9_]{0,63}
 */
export async function dbMysqlCallProcedure(
  connectionId: string,
  procedureName: string,
  params: unknown[],
): Promise<unknown[]> {
  if (!isTauri) {
    console.info('[database] dbMysqlCallProcedure (mock)', connectionId, procedureName);
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

/**
 * Bulk insert rows into a MySQL table.
 * Column names and table name are validated against SQL injection.
 */
export async function dbMysqlBulkInsert(
  connectionId: string,
  tableName: string,
  columns: string[],
  rows: unknown[][],
): Promise<number> {
  if (!isTauri) {
    console.info('[database] dbMysqlBulkInsert (mock)', connectionId, tableName, rows.length);
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

// ============================================================================
// MongoDB Operations
// ============================================================================

/**
 * Connect to a MongoDB instance.
 */
export async function dbMongoConnect(
  connectionId: string,
  config: ConnectionConfig,
): Promise<void> {
  if (!isTauri) {
    console.info('[database] dbMongoConnect (mock)', connectionId);
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

/**
 * Find documents in a MongoDB collection.
 */
export async function dbMongoFind(
  connectionId: string,
  collection: string,
  filter: MongoFilter,
  limit?: number,
): Promise<MongoDocument[]> {
  if (!isTauri) {
    console.info('[database] dbMongoFind (mock)', connectionId, collection);
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

/**
 * Find a single document in a MongoDB collection.
 */
export async function dbMongoFindOne(
  connectionId: string,
  collection: string,
  filter: MongoFilter,
): Promise<MongoDocument | null> {
  if (!isTauri) {
    console.info('[database] dbMongoFindOne (mock)', connectionId, collection);
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

/**
 * Insert a single document into a MongoDB collection.
 * Returns the inserted document ID.
 */
export async function dbMongoInsertOne(
  connectionId: string,
  collection: string,
  document: MongoDocument,
): Promise<string> {
  if (!isTauri) {
    console.info('[database] dbMongoInsertOne (mock)', connectionId, collection);
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

/**
 * Insert multiple documents into a MongoDB collection.
 * Returns an array of inserted document IDs.
 */
export async function dbMongoInsertMany(
  connectionId: string,
  collection: string,
  documents: MongoDocument[],
): Promise<string[]> {
  if (!isTauri) {
    console.info('[database] dbMongoInsertMany (mock)', connectionId, collection, documents.length);
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

/**
 * Update multiple documents in a MongoDB collection.
 */
export async function dbMongoUpdateMany(
  connectionId: string,
  collection: string,
  filter: MongoFilter,
  update: MongoUpdate,
): Promise<MongoResult> {
  if (!isTauri) {
    console.info('[database] dbMongoUpdateMany (mock)', connectionId, collection);
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

/**
 * Delete multiple documents from a MongoDB collection.
 * Returns the count of deleted documents.
 */
export async function dbMongoDeleteMany(
  connectionId: string,
  collection: string,
  filter: MongoFilter,
): Promise<number> {
  if (!isTauri) {
    console.info('[database] dbMongoDeleteMany (mock)', connectionId, collection);
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

/**
 * Disconnect from a MongoDB instance.
 */
export async function dbMongoDisconnect(connectionId: string): Promise<void> {
  if (!isTauri) {
    console.info('[database] dbMongoDisconnect (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_mongo_disconnect', { connectionId });
  } catch (error) {
    throw new Error(`MongoDB disconnect failed: ${error}`);
  }
}

// ============================================================================
// Redis Operations
// ============================================================================

/**
 * Connect to a Redis instance.
 */
export async function dbRedisConnect(
  connectionId: string,
  config: ConnectionConfig,
): Promise<void> {
  if (!isTauri) {
    console.info('[database] dbRedisConnect (mock)', connectionId);
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

/**
 * Get a value from Redis by key.
 */
export async function dbRedisGet(connectionId: string, key: string): Promise<string | null> {
  if (!isTauri) {
    console.info('[database] dbRedisGet (mock)', connectionId, key);
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

/**
 * Set a key-value pair in Redis with optional expiration.
 * Maximum key size: 512MB. Maximum expiration: 1 year.
 */
export async function dbRedisSet(
  connectionId: string,
  key: string,
  value: string,
  expirationSeconds?: number,
): Promise<void> {
  if (!isTauri) {
    console.info('[database] dbRedisSet (mock)', connectionId, key);
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

/**
 * Delete one or more keys from Redis.
 * Returns the count of keys deleted.
 */
export async function dbRedisDel(connectionId: string, keys: string[]): Promise<number> {
  if (!isTauri) {
    console.info('[database] dbRedisDel (mock)', connectionId, keys.length);
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

/**
 * Check if a key exists in Redis.
 */
export async function dbRedisExists(connectionId: string, key: string): Promise<boolean> {
  if (!isTauri) {
    console.info('[database] dbRedisExists (mock)', connectionId, key);
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

/**
 * Set a TTL (time-to-live) on a Redis key.
 * Returns true if the timeout was set.
 */
export async function dbRedisExpire(
  connectionId: string,
  key: string,
  seconds: number,
): Promise<boolean> {
  if (!isTauri) {
    console.info('[database] dbRedisExpire (mock)', connectionId, key, seconds);
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

/**
 * Get a field value from a Redis hash.
 */
export async function dbRedisHGet(
  connectionId: string,
  key: string,
  field: string,
): Promise<string | null> {
  if (!isTauri) {
    console.info('[database] dbRedisHGet (mock)', connectionId, key, field);
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

/**
 * Set a field-value pair in a Redis hash.
 * Returns true if a new field was created.
 */
export async function dbRedisHSet(
  connectionId: string,
  key: string,
  field: string,
  value: string,
): Promise<boolean> {
  if (!isTauri) {
    console.info('[database] dbRedisHSet (mock)', connectionId, key, field);
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

/**
 * Get all fields and values from a Redis hash.
 */
export async function dbRedisHGetAll(
  connectionId: string,
  key: string,
): Promise<Record<string, string>> {
  if (!isTauri) {
    console.info('[database] dbRedisHGetAll (mock)', connectionId, key);
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

/**
 * Disconnect from a Redis instance.
 */
export async function dbRedisDisconnect(connectionId: string): Promise<void> {
  if (!isTauri) {
    console.info('[database] dbRedisDisconnect (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_redis_disconnect', { connectionId });
  } catch (error) {
    throw new Error(`Redis disconnect failed: ${error}`);
  }
}

// ============================================================================
// Secure Password Storage
// ============================================================================

/**
 * Store a database connection password securely using encrypted storage.
 * Password is encrypted with machine-derived keys (Argon2id + AES-GCM).
 */
export async function dbStorePassword(connectionId: string, password: string): Promise<void> {
  if (!isTauri) {
    console.info('[database] dbStorePassword (mock)', connectionId);
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

/**
 * Check if a password exists for a database connection.
 * Does NOT return the actual password for security reasons.
 */
export async function dbHasStoredPassword(connectionId: string): Promise<boolean> {
  if (!isTauri) {
    console.info('[database] dbHasStoredPassword (mock)', connectionId);
    return false;
  }

  try {
    return await invoke<boolean>('db_has_stored_password', { connectionId });
  } catch (error) {
    throw new Error(`Failed to check stored password: ${error}`);
  }
}

/**
 * Retrieve a stored database password for creating a connection.
 * Requires explicit user approval (Critical risk level).
 * Should only be called when establishing a connection.
 */
export async function dbGetStoredPassword(connectionId: string): Promise<string | null> {
  if (!isTauri) {
    console.info('[database] dbGetStoredPassword (mock)', connectionId);
    return null;
  }

  try {
    return await invoke<string | null>('db_get_stored_password', { connectionId });
  } catch (error) {
    throw new Error(`Failed to retrieve stored password: ${error}`);
  }
}

/**
 * Delete a stored database password.
 */
export async function dbDeleteStoredPassword(connectionId: string): Promise<void> {
  if (!isTauri) {
    console.info('[database] dbDeleteStoredPassword (mock)', connectionId);
    return;
  }

  try {
    return await invoke<void>('db_delete_stored_password', { connectionId });
  } catch (error) {
    throw new Error(`Failed to delete stored password: ${error}`);
  }
}

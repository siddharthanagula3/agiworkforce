import { create } from 'zustand';
import {
  dbCreatePool,
  dbExecuteQuery,
  dbExecutePrepared,
  dbExecuteBatch,
  dbClosePool,
  dbListPools,
  dbGetPoolStats,
  dbValidateQuery,
  dbBuildSelect,
  dbBuildInsert,
  dbBuildUpdate,
  dbBuildDelete,
  dbMongoConnect,
  dbMongoFind,
  dbMongoFindOne,
  dbMongoInsertOne,
  dbMongoInsertMany,
  dbMongoUpdateMany,
  dbMongoDeleteMany,
  dbMongoDisconnect,
  dbRedisConnect,
  dbRedisGet,
  dbRedisSet,
  dbRedisDel,
  dbRedisExists,
  dbRedisExpire,
  dbRedisHGet,
  dbRedisHSet,
  dbRedisHGetAll,
  dbRedisDisconnect,
  dbStorePassword,
  dbHasStoredPassword,
  dbGetStoredPassword,
  dbDeleteStoredPassword,
  dbMysqlTestConnection,
  dbMysqlListTables,
  dbMysqlDescribeTable,
  dbMysqlListIndexes,
  dbMysqlCallProcedure,
  dbMysqlBulkInsert,
  type ConnectionConfig,
  type PoolConfig,
  type QueryResult,
  type SqlRowValue,
  type QueryValidation,
  type PoolStats,
  type MongoDocument,
  type MongoFilter,
  type MongoUpdate,
  type MongoResult,
  type MySqlColumnInfo,
  type MySqlIndexInfo,
  type SelectQuery,
  type InsertQuery,
  type UpdateQuery,
  type DeleteQuery,
} from '../api/database';

// Re-export types for consumers
export type {
  ConnectionConfig,
  PoolConfig,
  QueryResult,
  SqlRowValue,
  QueryValidation,
  PoolStats,
  MongoDocument,
  MongoFilter,
  MongoUpdate,
  MongoResult,
  MySqlColumnInfo,
  MySqlIndexInfo,
  SelectQuery,
  InsertQuery,
  UpdateQuery,
  DeleteQuery,
};

export interface DatabaseConnection {
  id: string;
  name: string;
  config: ConnectionConfig;
  type: 'SQL' | 'MongoDB' | 'Redis';
  connected: boolean;
}

interface DatabaseState {
  connections: DatabaseConnection[];
  activeConnectionId: string | null;

  currentQuery: string;
  queryResults: QueryResult | null;
  queryHistory: string[];
  loading: boolean;
  error: string | null;

  createSqlConnection: (
    id: string,
    name: string,
    config: ConnectionConfig,
    poolConfig: PoolConfig,
  ) => Promise<void>;
  createMongoConnection: (id: string, name: string, config: ConnectionConfig) => Promise<void>;
  createRedisConnection: (id: string, name: string, config: ConnectionConfig) => Promise<void>;
  closeConnection: (connectionId: string) => Promise<void>;
  setActiveConnection: (connectionId: string) => void;
  listPools: () => Promise<string[]>;

  executeQuery: (sql: string) => Promise<QueryResult>;
  executePrepared: (sql: string, params: SqlRowValue[]) => Promise<QueryResult>;
  executeBatch: (queries: string[]) => Promise<QueryResult[]>;

  buildSelectQuery: (query: SelectQuery) => Promise<string>;
  buildInsertQuery: (query: InsertQuery) => Promise<string>;
  buildUpdateQuery: (query: UpdateQuery) => Promise<string>;
  buildDeleteQuery: (query: DeleteQuery) => Promise<string>;

  mongoFind: (collection: string, filter: MongoFilter, limit?: number) => Promise<MongoDocument[]>;
  mongoFindOne: (collection: string, filter: MongoFilter) => Promise<MongoDocument | null>;
  mongoInsertOne: (collection: string, document: MongoDocument) => Promise<string>;
  mongoInsertMany: (collection: string, documents: MongoDocument[]) => Promise<string[]>;
  mongoUpdateMany: (
    collection: string,
    filter: MongoFilter,
    update: MongoUpdate,
  ) => Promise<MongoResult>;
  mongoDeleteMany: (collection: string, filter: MongoFilter) => Promise<number>;

  redisGet: (key: string) => Promise<string | null>;
  redisSet: (key: string, value: string, expiration?: number) => Promise<void>;
  redisDel: (keys: string[]) => Promise<number>;
  redisExists: (key: string) => Promise<boolean>;
  redisExpire: (key: string, seconds: number) => Promise<boolean>;
  redisHGet: (key: string, field: string) => Promise<string | null>;
  redisHSet: (key: string, field: string, value: string) => Promise<boolean>;
  redisHGetAll: (key: string) => Promise<Record<string, string>>;

  // SQL validation & pool management
  validateQuery: (sql: string) => Promise<QueryValidation>;
  getPoolStats: (connectionId: string) => Promise<PoolStats>;

  // Secure password storage
  storePassword: (connectionId: string, password: string) => Promise<void>;
  hasStoredPassword: (connectionId: string) => Promise<boolean>;
  getStoredPassword: (connectionId: string) => Promise<string | null>;
  deleteStoredPassword: (connectionId: string) => Promise<void>;

  // MySQL-specific operations
  mysqlTestConnection: (connectionId: string) => Promise<boolean>;
  mysqlListTables: (connectionId: string) => Promise<string[]>;
  mysqlDescribeTable: (connectionId: string, tableName: string) => Promise<MySqlColumnInfo[]>;
  mysqlListIndexes: (connectionId: string, tableName: string) => Promise<MySqlIndexInfo[]>;
  mysqlCallProcedure: (
    connectionId: string,
    procedureName: string,
    params: unknown[],
  ) => Promise<unknown[]>;
  mysqlBulkInsert: (
    connectionId: string,
    tableName: string,
    columns: string[],
    rows: unknown[][],
  ) => Promise<number>;

  setCurrentQuery: (query: string) => void;
  addToHistory: (query: string) => void;
  clearResults: () => void;
  clearError: () => void;

  // AUDIT-006-022: Cleanup function for logout
  resetOnLogout: () => void;
}

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  currentQuery: '',
  queryResults: null,
  queryHistory: [],
  loading: false,
  error: null,

  createSqlConnection: async (
    id: string,
    name: string,
    config: ConnectionConfig,
    poolConfig: PoolConfig,
  ) => {
    set({ loading: true, error: null });
    try {
      await dbCreatePool(id, config, poolConfig);

      const newConnection: DatabaseConnection = {
        id,
        name,
        config,
        type: 'SQL',
        connected: true,
      };

      set((state) => ({
        connections: [...state.connections, newConnection],
        activeConnectionId: id,
        loading: false,
      }));
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  createMongoConnection: async (id: string, name: string, config: ConnectionConfig) => {
    set({ loading: true, error: null });
    try {
      await dbMongoConnect(id, config);

      const newConnection: DatabaseConnection = {
        id,
        name,
        config,
        type: 'MongoDB',
        connected: true,
      };

      set((state) => ({
        connections: [...state.connections, newConnection],
        activeConnectionId: id,
        loading: false,
      }));
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  createRedisConnection: async (id: string, name: string, config: ConnectionConfig) => {
    set({ loading: true, error: null });
    try {
      await dbRedisConnect(id, config);

      const newConnection: DatabaseConnection = {
        id,
        name,
        config,
        type: 'Redis',
        connected: true,
      };

      set((state) => ({
        connections: [...state.connections, newConnection],
        activeConnectionId: id,
        loading: false,
      }));
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  closeConnection: async (connectionId: string) => {
    const connection = get().connections.find((c) => c.id === connectionId);
    if (!connection) return;

    set({ loading: true, error: null });
    try {
      if (connection.type === 'SQL') {
        await dbClosePool(connectionId);
      } else if (connection.type === 'MongoDB') {
        await dbMongoDisconnect(connectionId);
      } else if (connection.type === 'Redis') {
        await dbRedisDisconnect(connectionId);
      }

      set((state) => ({
        connections: state.connections.filter((c) => c.id !== connectionId),
        activeConnectionId:
          state.activeConnectionId === connectionId ? null : state.activeConnectionId,
        loading: false,
      }));
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  setActiveConnection: (connectionId: string) => {
    set({ activeConnectionId: connectionId });
  },

  listPools: async () => {
    try {
      return await dbListPools();
    } catch (error) {
      throw error;
    }
  },

  executeQuery: async (sql: string) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await dbExecuteQuery(activeConnectionId, sql);

      const queryResult: QueryResult = {
        columns: result.columns || [],
        rows: result.rows || [],
        affected_rows: result.affected_rows,
        execution_time_ms: result.execution_time_ms,
      };

      set({ queryResults: queryResult, loading: false });
      get().addToHistory(sql);
      return queryResult;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  executePrepared: async (sql: string, params: SqlRowValue[]) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await dbExecutePrepared(activeConnectionId, sql, params);

      const queryResult: QueryResult = {
        columns: result.columns || [],
        rows: result.rows || [],
        affected_rows: result.affected_rows,
        execution_time_ms: result.execution_time_ms,
      };

      set({ queryResults: queryResult, loading: false });
      get().addToHistory(sql);
      return queryResult;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  executeBatch: async (queries: string[]) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const results = await dbExecuteBatch(activeConnectionId, queries);

      const queryResults: QueryResult[] = results.map((result) => ({
        columns: result.columns || [],
        rows: result.rows || [],
        affected_rows: result.affected_rows,
        execution_time_ms: result.execution_time_ms,
      }));

      set({ loading: false });
      queries.forEach((q) => get().addToHistory(q));
      return queryResults;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  buildSelectQuery: async (query: SelectQuery) => {
    try {
      return await dbBuildSelect(query);
    } catch (error) {
      throw error;
    }
  },

  buildInsertQuery: async (query: InsertQuery) => {
    try {
      return await dbBuildInsert(query);
    } catch (error) {
      throw error;
    }
  },

  buildUpdateQuery: async (query: UpdateQuery) => {
    try {
      return await dbBuildUpdate(query);
    } catch (error) {
      throw error;
    }
  },

  buildDeleteQuery: async (query: DeleteQuery) => {
    try {
      return await dbBuildDelete(query);
    } catch (error) {
      throw error;
    }
  },

  mongoFind: async (collection: string, filter: MongoFilter, limit?: number) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await dbMongoFind(activeConnectionId, collection, filter, limit);
      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  mongoFindOne: async (collection: string, filter: MongoFilter) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await dbMongoFindOne(activeConnectionId, collection, filter);
      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  mongoInsertOne: async (collection: string, document: MongoDocument) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await dbMongoInsertOne(activeConnectionId, collection, document);
      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  mongoInsertMany: async (collection: string, documents: MongoDocument[]) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await dbMongoInsertMany(activeConnectionId, collection, documents);
      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  mongoUpdateMany: async (collection: string, filter: MongoFilter, update: MongoUpdate) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await dbMongoUpdateMany(activeConnectionId, collection, filter, update);
      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  mongoDeleteMany: async (collection: string, filter: MongoFilter) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await dbMongoDeleteMany(activeConnectionId, collection, filter);
      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  redisGet: async (key: string) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await dbRedisGet(activeConnectionId, key);
      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  redisSet: async (key: string, value: string, expiration?: number) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      await dbRedisSet(activeConnectionId, key, value, expiration);
      set({ loading: false });
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  redisDel: async (keys: string[]) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await dbRedisDel(activeConnectionId, keys);
      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  redisExists: async (key: string) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    try {
      return await dbRedisExists(activeConnectionId, key);
    } catch (error) {
      throw error;
    }
  },

  redisExpire: async (key: string, seconds: number) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    try {
      return await dbRedisExpire(activeConnectionId, key, seconds);
    } catch (error) {
      throw error;
    }
  },

  redisHGet: async (key: string, field: string) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    try {
      return await dbRedisHGet(activeConnectionId, key, field);
    } catch (error) {
      throw error;
    }
  },

  redisHSet: async (key: string, field: string, value: string) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    try {
      return await dbRedisHSet(activeConnectionId, key, field, value);
    } catch (error) {
      throw error;
    }
  },

  redisHGetAll: async (key: string) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    try {
      return await dbRedisHGetAll(activeConnectionId, key);
    } catch (error) {
      throw error;
    }
  },

  // --- SQL validation & pool management ---

  validateQuery: async (sql: string) => {
    try {
      return await dbValidateQuery(sql);
    } catch (error) {
      throw error;
    }
  },

  getPoolStats: async (connectionId: string) => {
    try {
      return await dbGetPoolStats(connectionId);
    } catch (error) {
      throw error;
    }
  },

  // --- Secure password storage ---

  storePassword: async (connectionId: string, password: string) => {
    try {
      await dbStorePassword(connectionId, password);
    } catch (error) {
      throw error;
    }
  },

  hasStoredPassword: async (connectionId: string) => {
    try {
      return await dbHasStoredPassword(connectionId);
    } catch (error) {
      throw error;
    }
  },

  getStoredPassword: async (connectionId: string) => {
    try {
      return await dbGetStoredPassword(connectionId);
    } catch (error) {
      throw error;
    }
  },

  deleteStoredPassword: async (connectionId: string) => {
    try {
      await dbDeleteStoredPassword(connectionId);
    } catch (error) {
      throw error;
    }
  },

  // --- MySQL-specific operations ---

  mysqlTestConnection: async (connectionId: string) => {
    try {
      return await dbMysqlTestConnection(connectionId);
    } catch (error) {
      throw error;
    }
  },

  mysqlListTables: async (connectionId: string) => {
    try {
      return await dbMysqlListTables(connectionId);
    } catch (error) {
      throw error;
    }
  },

  mysqlDescribeTable: async (connectionId: string, tableName: string) => {
    try {
      return await dbMysqlDescribeTable(connectionId, tableName);
    } catch (error) {
      throw error;
    }
  },

  mysqlListIndexes: async (connectionId: string, tableName: string) => {
    try {
      return await dbMysqlListIndexes(connectionId, tableName);
    } catch (error) {
      throw error;
    }
  },

  mysqlCallProcedure: async (connectionId: string, procedureName: string, params: unknown[]) => {
    try {
      return await dbMysqlCallProcedure(connectionId, procedureName, params);
    } catch (error) {
      throw error;
    }
  },

  mysqlBulkInsert: async (
    connectionId: string,
    tableName: string,
    columns: string[],
    rows: unknown[][],
  ) => {
    try {
      return await dbMysqlBulkInsert(connectionId, tableName, columns, rows);
    } catch (error) {
      throw error;
    }
  },

  setCurrentQuery: (query: string) => {
    set({ currentQuery: query });
  },

  addToHistory: (query: string) => {
    set((state) => ({
      queryHistory: [...state.queryHistory.slice(-49), query],
    }));
  },

  clearResults: () => {
    set({ queryResults: null });
  },

  clearError: () => {
    set({ error: null });
  },

  // AUDIT-006-022 fix: Add resetOnLogout function for cleanup
  resetOnLogout: () => {
    set({
      connections: [],
      activeConnectionId: null,
      currentQuery: '',
      queryResults: null,
      queryHistory: [],
      loading: false,
      error: null,
    });
  },
}));

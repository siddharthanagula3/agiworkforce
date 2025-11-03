import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

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

export interface DatabaseConnection {
  id: string;
  name: string;
  config: ConnectionConfig;
  type: 'SQL' | 'MongoDB' | 'Redis';
  connected: boolean;
}

export interface QueryResult {
  columns?: string[];
  rows?: any[][];
  affected_rows?: number;
  execution_time_ms?: number;
}

interface DatabaseState {
  // Connections
  connections: DatabaseConnection[];
  activeConnectionId: string | null;

  // Query state
  currentQuery: string;
  queryResults: QueryResult | null;
  queryHistory: string[];
  loading: boolean;
  error: string | null;

  // Actions - Connection Management
  createSqlConnection: (id: string, name: string, config: ConnectionConfig, poolConfig: PoolConfig) => Promise<void>;
  createMongoConnection: (id: string, name: string, config: ConnectionConfig) => Promise<void>;
  createRedisConnection: (id: string, name: string, config: ConnectionConfig) => Promise<void>;
  closeConnection: (connectionId: string) => Promise<void>;
  setActiveConnection: (connectionId: string) => void;
  listPools: () => Promise<string[]>;

  // Actions - SQL Operations
  executeQuery: (sql: string) => Promise<QueryResult>;
  executePrepared: (sql: string, params: any[]) => Promise<QueryResult>;
  executeBatch: (queries: string[]) => Promise<QueryResult[]>;

  // Actions - Query Builder
  buildSelectQuery: (query: SelectQuery) => Promise<string>;
  buildInsertQuery: (query: InsertQuery) => Promise<string>;
  buildUpdateQuery: (query: UpdateQuery) => Promise<string>;
  buildDeleteQuery: (query: DeleteQuery) => Promise<string>;

  // Actions - MongoDB Operations
  mongoFind: (collection: string, filter: Record<string, any>, limit?: number) => Promise<any>;
  mongoFindOne: (collection: string, filter: Record<string, any>) => Promise<any>;
  mongoInsertOne: (collection: string, document: Record<string, any>) => Promise<string>;
  mongoInsertMany: (collection: string, documents: Record<string, any>[]) => Promise<string[]>;
  mongoUpdateMany: (collection: string, filter: Record<string, any>, update: Record<string, any>) => Promise<any>;
  mongoDeleteMany: (collection: string, filter: Record<string, any>) => Promise<number>;

  // Actions - Redis Operations
  redisGet: (key: string) => Promise<string | null>;
  redisSet: (key: string, value: string, expiration?: number) => Promise<void>;
  redisDel: (keys: string[]) => Promise<number>;
  redisExists: (key: string) => Promise<boolean>;
  redisExpire: (key: string, seconds: number) => Promise<boolean>;
  redisHGet: (key: string, field: string) => Promise<string | null>;
  redisHSet: (key: string, field: string, value: string) => Promise<boolean>;
  redisHGetAll: (key: string) => Promise<Record<string, string>>;

  // Actions - UI State
  setCurrentQuery: (query: string) => void;
  addToHistory: (query: string) => void;
  clearResults: () => void;
  clearError: () => void;
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

export const useDatabaseStore = create<DatabaseState>((set, get) => ({
  // Initial state
  connections: [],
  activeConnectionId: null,
  currentQuery: '',
  queryResults: null,
  queryHistory: [],
  loading: false,
  error: null,

  // Connection Management
  createSqlConnection: async (id: string, name: string, config: ConnectionConfig, poolConfig: PoolConfig) => {
    set({ loading: true, error: null });
    try {
      await invoke('db_create_pool', {
        connectionId: id,
        config,
        poolConfig,
      });

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
      await invoke('db_mongo_connect', {
        connectionId: id,
        config,
      });

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
      await invoke('db_redis_connect', {
        connectionId: id,
        config,
      });

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
        await invoke('db_close_pool', { connectionId });
      } else if (connection.type === 'MongoDB') {
        await invoke('db_mongo_disconnect', { connectionId });
      } else if (connection.type === 'Redis') {
        await invoke('db_redis_disconnect', { connectionId });
      }

      set((state) => ({
        connections: state.connections.filter((c) => c.id !== connectionId),
        activeConnectionId: state.activeConnectionId === connectionId ? null : state.activeConnectionId,
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
      const pools = await invoke<string[]>('db_list_pools');
      return pools;
    } catch (error) {
      throw error;
    }
  },

  // SQL Operations
  executeQuery: async (sql: string) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await invoke<any>('db_execute_query', {
        connectionId: activeConnectionId,
        sql,
      });

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

  executePrepared: async (sql: string, params: any[]) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await invoke<any>('db_execute_prepared', {
        connectionId: activeConnectionId,
        sql,
        params,
      });

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
      const results = await invoke<any[]>('db_execute_batch', {
        connectionId: activeConnectionId,
        queries,
      });

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

  // Query Builder
  buildSelectQuery: async (query: SelectQuery) => {
    try {
      const sql = await invoke<string>('db_build_select', { query });
      return sql;
    } catch (error) {
      throw error;
    }
  },

  buildInsertQuery: async (query: InsertQuery) => {
    try {
      const sql = await invoke<string>('db_build_insert', { query });
      return sql;
    } catch (error) {
      throw error;
    }
  },

  buildUpdateQuery: async (query: UpdateQuery) => {
    try {
      const sql = await invoke<string>('db_build_update', { query });
      return sql;
    } catch (error) {
      throw error;
    }
  },

  buildDeleteQuery: async (query: DeleteQuery) => {
    try {
      const sql = await invoke<string>('db_build_delete', { query });
      return sql;
    } catch (error) {
      throw error;
    }
  },

  // MongoDB Operations
  mongoFind: async (collection: string, filter: Record<string, any>, limit?: number) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await invoke<any>('db_mongo_find', {
        connectionId: activeConnectionId,
        collection,
        filter,
        limit,
      });

      set({ queryResults: { rows: result }, loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  mongoFindOne: async (collection: string, filter: Record<string, any>) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await invoke<any>('db_mongo_find_one', {
        connectionId: activeConnectionId,
        collection,
        filter,
      });

      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  mongoInsertOne: async (collection: string, document: Record<string, any>) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await invoke<string>('db_mongo_insert_one', {
        connectionId: activeConnectionId,
        collection,
        document,
      });

      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  mongoInsertMany: async (collection: string, documents: Record<string, any>[]) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await invoke<string[]>('db_mongo_insert_many', {
        connectionId: activeConnectionId,
        collection,
        documents,
      });

      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  mongoUpdateMany: async (collection: string, filter: Record<string, any>, update: Record<string, any>) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await invoke<any>('db_mongo_update_many', {
        connectionId: activeConnectionId,
        collection,
        filter,
        update,
      });

      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  mongoDeleteMany: async (collection: string, filter: Record<string, any>) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await invoke<number>('db_mongo_delete_many', {
        connectionId: activeConnectionId,
        collection,
        filter,
      });

      set({ loading: false });
      return result;
    } catch (error) {
      set({ loading: false, error: String(error) });
      throw error;
    }
  },

  // Redis Operations
  redisGet: async (key: string) => {
    const { activeConnectionId } = get();
    if (!activeConnectionId) {
      throw new Error('No active connection');
    }

    set({ loading: true, error: null });
    try {
      const result = await invoke<string | null>('db_redis_get', {
        connectionId: activeConnectionId,
        key,
      });

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
      await invoke('db_redis_set', {
        connectionId: activeConnectionId,
        key,
        value,
        expirationSeconds: expiration,
      });

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
      const result = await invoke<number>('db_redis_del', {
        connectionId: activeConnectionId,
        keys,
      });

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
      const result = await invoke<boolean>('db_redis_exists', {
        connectionId: activeConnectionId,
        key,
      });

      return result;
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
      const result = await invoke<boolean>('db_redis_expire', {
        connectionId: activeConnectionId,
        key,
        seconds,
      });

      return result;
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
      const result = await invoke<string | null>('db_redis_hget', {
        connectionId: activeConnectionId,
        key,
        field,
      });

      return result;
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
      const result = await invoke<boolean>('db_redis_hset', {
        connectionId: activeConnectionId,
        key,
        field,
        value,
      });

      return result;
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
      const result = await invoke<Record<string, string>>('db_redis_hgetall', {
        connectionId: activeConnectionId,
        key,
      });

      return result;
    } catch (error) {
      throw error;
    }
  },

  // UI State
  setCurrentQuery: (query: string) => {
    set({ currentQuery: query });
  },

  addToHistory: (query: string) => {
    set((state) => ({
      queryHistory: [...state.queryHistory.slice(-49), query], // Keep last 50
    }));
  },

  clearResults: () => {
    set({ queryResults: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));

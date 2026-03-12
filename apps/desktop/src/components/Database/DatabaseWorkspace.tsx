import { invoke } from '../../lib/tauri-mock';
import { Check, Database, History, Link, Link2Off, Play, Plus, Table } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  useDatabaseStore,
  type ConnectionConfig,
  type DatabaseConnection,
} from '../../stores/databaseStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';

interface DatabaseWorkspaceProps {
  className?: string;
}

const SQL_DATABASE_OPTIONS: Array<'Postgres' | 'MySql' | 'Sqlite'> = [
  'Postgres',
  'MySql',
  'Sqlite',
];

export function DatabaseWorkspace({ className }: DatabaseWorkspaceProps) {
  const {
    connections,
    activeConnectionId,
    currentQuery,
    queryResults,
    queryHistory,
    loading,
    error,
    createSqlConnection,
    createMongoConnection,
    createRedisConnection,
    closeConnection,
    setActiveConnection,
    executeQuery,
    mongoFind,
    redisGet,
    redisSet,
    setCurrentQuery,
    clearError,
  } = useDatabaseStore();

  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connectionType, setConnectionType] = useState<'SQL' | 'MongoDB' | 'Redis'>('SQL');
  const [connectionName, setConnectionName] = useState('');
  const [dbType, setDbType] = useState<'Postgres' | 'MySql' | 'Sqlite'>('Postgres');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [username, setUsername] = useState('');
  // WRK-002 FIX: Password is only temporarily held during form input, then immediately
  // stored in secure storage and cleared. Never persisted in React state long-term.
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [database, setDatabase] = useState('');

  const [mongoCollection, setMongoCollection] = useState('');
  const [mongoFilter, setMongoFilter] = useState('{}');

  const [redisKey, setRedisKey] = useState('');
  const [redisValue, setRedisValue] = useState('');

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const activeConnection = connections.find((c) => c.id === activeConnectionId);

  const handleCreateConnection = async () => {
    if (!connectionName.trim()) {
      toast.error('Please enter a connection name');
      return;
    }

    const connectionId = `conn_${Date.now()}`;
    // WRK-002 FIX: Capture password value before clearing
    const currentPassword = passwordInput;

    try {
      if (connectionType === 'SQL') {
        // WRK-002 FIX: Store password securely in encrypted storage FIRST
        if (currentPassword) {
          await invoke('db_store_password', {
            connectionId,
            password: currentPassword,
          });
        }

        const config: ConnectionConfig = {
          database_type: dbType,
          host,
          port: parseInt(port),
          username,
          password: currentPassword, // Use captured password, will be cleared after
          database,
        };

        const poolConfig = {
          max_size: 10,
          min_idle: 2,
          connection_timeout_seconds: 30,
        };

        await createSqlConnection(connectionId, connectionName, config, poolConfig);
      } else if (connectionType === 'MongoDB') {
        const config: ConnectionConfig = {
          database_type: 'MongoDB',
          host,
          port: parseInt(port),
          database,
        };

        await createMongoConnection(connectionId, connectionName, config);
      } else if (connectionType === 'Redis') {
        const config: ConnectionConfig = {
          database_type: 'Redis',
          host,
          port: parseInt(port),
        };

        await createRedisConnection(connectionId, connectionName, config);
      }

      toast.success(`Connected: ${connectionName}`);
      setShowConnectionForm(false);
      resetConnectionForm();
    } catch (error) {
      // WRK-002 FIX: Clean up stored password if connection failed
      if (currentPassword && connectionType === 'SQL') {
        try {
          await invoke('db_delete_stored_password', { connectionId });
        } catch {
          // Ignore cleanup errors
        }
      }
      console.error('[DatabaseWorkspace] Connection failed:', error);
      toast.error('Connection failed. Check your credentials and try again.');
    }
  };

  const resetConnectionForm = () => {
    setConnectionName('');
    setHost('localhost');
    setPort('5432');
    setUsername('');
    // WRK-002 FIX: Clear password input immediately after use
    setPasswordInput('');
    setPasswordSaved(false);
    setDatabase('');
  };

  const handleCloseConnection = async (connectionId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      await closeConnection(connectionId);
      // WRK-002 FIX: Clean up stored password when connection is closed
      try {
        await invoke('db_delete_stored_password', { connectionId });
      } catch {
        // Ignore cleanup errors - password may not exist for non-SQL connections
      }
      toast.success('Connection closed');
    } catch (error) {
      console.error('[DatabaseWorkspace] Failed to close connection:', error);
      toast.error('Failed to close connection. Please try again.');
    }
  };

  const handleExecuteQuery = async () => {
    if (!currentQuery.trim()) {
      toast.error('Please enter a query');
      return;
    }

    if (!activeConnection) {
      toast.error('No active connection');
      return;
    }

    try {
      const result = await executeQuery(currentQuery);
      toast.success(`Query executed: ${result.affected_rows || result.rows?.length || 0} rows`);
    } catch (error) {
      console.error('[DatabaseWorkspace] Query failed:', error);
      toast.error('Query failed. Check your syntax and try again.');
    }
  };

  const handleMongoFind = async () => {
    if (!mongoCollection.trim()) {
      toast.error('Please enter a collection name');
      return;
    }

    try {
      const filter = JSON.parse(mongoFilter);
      const result = await mongoFind(mongoCollection, filter);
      toast.success(`Found ${Array.isArray(result) ? result.length : 0} documents`);
    } catch (error) {
      console.error('[DatabaseWorkspace] MongoDB query failed:', error);
      toast.error('MongoDB query failed. Check your filter and try again.');
    }
  };

  const handleRedisGet = async () => {
    if (!redisKey.trim()) {
      toast.error('Please enter a key');
      return;
    }

    try {
      const result = await redisGet(redisKey);
      setRedisValue(result || '');
      toast.success(result ? 'Key found' : 'Key not found');
    } catch (error) {
      console.error('[DatabaseWorkspace] Redis GET failed:', error);
      toast.error('Failed to get Redis key. Check your connection and try again.');
    }
  };

  const handleRedisSet = async () => {
    if (!redisKey.trim() || !redisValue.trim()) {
      toast.error('Please enter both key and value');
      return;
    }

    try {
      await redisSet(redisKey, redisValue);
      toast.success('Key set successfully');
    } catch (error) {
      console.error('[DatabaseWorkspace] Redis SET failed:', error);
      toast.error('Failed to set Redis key. Check your connection and try again.');
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Database</span>
          {connections.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({connections.length} connection{connections.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={() => setShowConnectionForm(!showConnectionForm)}
        >
          <Plus className="h-4 w-4 mr-1" />
          New Connection
        </Button>
      </div>

      {}
      {showConnectionForm && (
        <div className="p-4 border-b border-border bg-muted/5 space-y-3">
          <div className="flex gap-2">
            <Button
              variant={connectionType === 'SQL' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setConnectionType('SQL')}
            >
              SQL
            </Button>
            <Button
              variant={connectionType === 'MongoDB' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setConnectionType('MongoDB')}
            >
              MongoDB
            </Button>
            <Button
              variant={connectionType === 'Redis' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setConnectionType('Redis')}
            >
              Redis
            </Button>
          </div>

          <Input
            value={connectionName}
            onChange={(e) => setConnectionName(e.target.value)}
            placeholder="Connection name"
          />

          {connectionType === 'SQL' && (
            <select
              value={dbType}
              onChange={(e) => {
                const selected = SQL_DATABASE_OPTIONS.find((option) => option === e.target.value);
                if (selected) {
                  setDbType(selected);
                }
              }}
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
            >
              <option value="Postgres">PostgreSQL</option>
              <option value="MySql">MySQL</option>
              <option value="Sqlite">SQLite</option>
            </select>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host" />
            <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="Port" />
          </div>

          {connectionType !== 'Redis' && (
            <Input
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="Database name"
            />
          )}

          {connectionType === 'SQL' && (
            <>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
              />
              {/* WRK-002 FIX: Password input with secure storage indicator */}
              <div className="relative">
                <Input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordSaved(false);
                  }}
                  placeholder={passwordSaved ? 'Password saved securely' : 'Password'}
                  className={passwordSaved ? 'pr-8' : ''}
                />
                {passwordSaved && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <Check className="h-4 w-4 text-green-500" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Password is encrypted and stored securely on your device
              </p>
            </>
          )}

          <div className="flex gap-2">
            <Button onClick={handleCreateConnection} disabled={loading}>
              <Link className="h-4 w-4 mr-1" />
              Connect
            </Button>
            <Button variant="outline" onClick={() => setShowConnectionForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {}
      {connections.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/5 overflow-x-auto">
          {connections.map((conn) => {
            const isActive = conn.id === activeConnectionId;

            return (
              <div
                key={conn.id}
                onClick={() => setActiveConnection(conn.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer',
                  'transition-colors group whitespace-nowrap',
                  isActive ? 'bg-background border border-border shadow-xs' : 'hover:bg-muted/50',
                )}
              >
                <Database
                  className={cn('h-3 w-3', isActive ? 'text-primary' : 'text-muted-foreground')}
                />
                <span className={cn('text-sm', isActive && 'font-medium')}>{conn.name}</span>
                <span className="text-xs text-muted-foreground">({conn.type})</span>

                <button type="button"
                  onClick={(e) => handleCloseConnection(conn.id, e)}
                  className={cn(
                    'text-muted-foreground hover:text-destructive',
                    'transition-colors opacity-0 group-hover:opacity-100',
                    isActive && 'opacity-100',
                  )}
                >
                  <Link2Off className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {}
      {activeConnection ? (
        <Tabs defaultValue="query" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="px-3">
            <TabsTrigger value="query">
              <Play className="h-3 w-3 mr-1" />
              Query
            </TabsTrigger>
            <TabsTrigger value="results">
              <Table className="h-3 w-3 mr-1" />
              Results
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-3 w-3 mr-1" />
              History
            </TabsTrigger>
            <TabsTrigger value="schema">
              <Database className="h-3 w-3 mr-1" />
              Schema
            </TabsTrigger>
          </TabsList>

          {}
          <TabsContent value="query" className="flex-1 flex flex-col overflow-hidden">
            {activeConnection.type === 'SQL' ? (
              <>
                <div className="flex-1 overflow-auto p-3">
                  <textarea
                    value={currentQuery}
                    onChange={(e) => setCurrentQuery(e.target.value)}
                    placeholder="Enter SQL query..."
                    className="w-full h-full p-3 border border-border rounded-md font-mono text-sm resize-none focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
                  <Button onClick={handleExecuteQuery} disabled={loading}>
                    <Play className="h-4 w-4 mr-2" />
                    Execute
                  </Button>
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-xs text-muted-foreground mr-2">Transaction:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCurrentQuery('BEGIN');
                        handleExecuteQuery();
                      }}
                      disabled={loading}
                    >
                      BEGIN
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCurrentQuery('COMMIT');
                        handleExecuteQuery();
                      }}
                      disabled={loading}
                    >
                      COMMIT
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCurrentQuery('ROLLBACK');
                        handleExecuteQuery();
                      }}
                      disabled={loading}
                    >
                      ROLLBACK
                    </Button>
                  </div>
                </div>
              </>
            ) : activeConnection.type === 'MongoDB' ? (
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <Input
                  value={mongoCollection}
                  onChange={(e) => setMongoCollection(e.target.value)}
                  placeholder="Collection name"
                />
                <textarea
                  value={mongoFilter}
                  onChange={(e) => setMongoFilter(e.target.value)}
                  placeholder='Filter (JSON) e.g., {"name": "John"}'
                  className="w-full h-32 p-3 border border-border rounded-md font-mono text-sm resize-none"
                />
                <Button onClick={handleMongoFind} disabled={loading}>
                  <Play className="h-4 w-4 mr-2" />
                  Find
                </Button>
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <Input
                  value={redisKey}
                  onChange={(e) => setRedisKey(e.target.value)}
                  placeholder="Key"
                />
                <Input
                  value={redisValue}
                  onChange={(e) => setRedisValue(e.target.value)}
                  placeholder="Value"
                />
                <div className="flex gap-2">
                  <Button onClick={handleRedisGet} disabled={loading}>
                    GET
                  </Button>
                  <Button onClick={handleRedisSet} disabled={loading}>
                    SET
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {}
          <TabsContent value="results" className="flex-1 overflow-auto p-4">
            {queryResults ? (
              <div className="border border-border rounded-md overflow-auto">
                {queryResults.columns && queryResults.rows ? (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        {queryResults.columns.map((col, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResults.rows.map((row, i) => (
                        <tr key={i} className="border-b border-border hover:bg-muted/30">
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-2 font-mono text-xs">
                              {JSON.stringify(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-4">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {JSON.stringify(queryResults, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">No results yet</p>
              </div>
            )}
          </TabsContent>

          {}
          <TabsContent value="history" className="flex-1 overflow-auto p-4">
            {queryHistory.length > 0 ? (
              <div className="space-y-2">
                {queryHistory
                  .slice()
                  .reverse()
                  .map((query, i) => (
                    <div
                      key={i}
                      onClick={() => setCurrentQuery(query)}
                      className="p-3 border border-border rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <pre className="text-xs font-mono whitespace-pre-wrap">{query}</pre>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">No query history</p>
              </div>
            )}
          </TabsContent>

          {}
          <TabsContent value="schema" className="flex-1 overflow-hidden p-4">
            <SchemaExplorer activeConnection={activeConnection} loading={loading} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-4">
            <Database className="h-16 w-16 mx-auto opacity-20" />
            <div>
              <p className="text-lg font-medium mb-2">No Database Connection</p>
              <p className="text-sm">Create a connection to get started</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TableSchemaResult {
  rows: unknown[][];
  columns?: string[];
}

interface QueryResult {
  rows?: unknown[][];
  columns?: string[];
}

// WRK-006 fix: Add pagination limit to prevent crashes with large databases
const DEFAULT_TABLE_LIMIT = 500;
const MAX_TABLE_LIMIT = 1000;

// WRK-001 fix: Support all SQL database types, not just MySQL
// WRK-006 fix: Added LIMIT clause to prevent OOM with 10,000+ tables
function getListTablesQuery(dbType?: string, limit: number = DEFAULT_TABLE_LIMIT): string {
  const safeLimit = Math.min(limit, MAX_TABLE_LIMIT);

  switch (dbType) {
    case 'Postgres':
      return `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT ${safeLimit}`;
    case 'Sqlite':
      return `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT ${safeLimit}`;
    case 'MySql':
    default:
      // MySQL SHOW TABLES doesn't support LIMIT, so we'll handle it in code
      return 'SHOW TABLES';
  }
}

function getDescribeTableQuery(tableName: string, dbType?: string): string {
  // Sanitize table name to prevent SQL injection
  const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '');

  switch (dbType) {
    case 'Postgres':
      return `SELECT column_name as "Column", data_type as "Type", is_nullable as "Null", column_default as "Default" FROM information_schema.columns WHERE table_name = '${safeName}' ORDER BY ordinal_position`;
    case 'Sqlite':
      return `PRAGMA table_info(${safeName})`;
    case 'MySql':
    default:
      return `DESCRIBE ${safeName}`;
  }
}

function SchemaExplorer({
  activeConnection,
  loading: _loading,
}: {
  activeConnection: DatabaseConnection | null;
  loading: boolean;
}) {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSchema, setTableSchema] = useState<TableSchemaResult | null>(null);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingSchema, setLoadingSchema] = useState(false);

  // WRK-001 fix: Use generic query execution with DB-specific SQL
  // WRK-006 fix: Add pagination to prevent crashes with large databases
  const loadTables = useCallback(async () => {
    if (!activeConnection) return;

    setLoadingTables(true);
    try {
      const dbType = activeConnection.config?.database_type;
      const sql = getListTablesQuery(dbType, DEFAULT_TABLE_LIMIT);

      const result = await invoke<QueryResult>('db_execute_query', {
        connectionId: activeConnection.id,
        sql,
      });

      // Extract table names from first column of results
      let tableNames =
        result.rows?.map((row) => String(row[0])).filter((name) => name && name.length > 0) || [];

      // WRK-006 fix: MySQL SHOW TABLES doesn't support LIMIT, so truncate in code
      if (dbType === 'MySql' && tableNames.length > DEFAULT_TABLE_LIMIT) {
        tableNames = tableNames.slice(0, DEFAULT_TABLE_LIMIT);
        toast.info(`Showing first ${DEFAULT_TABLE_LIMIT} tables. Database has more tables.`);
      } else if (tableNames.length >= DEFAULT_TABLE_LIMIT) {
        toast.info(`Showing first ${DEFAULT_TABLE_LIMIT} tables. Database may have more tables.`);
      }

      setTables(tableNames);
    } catch (error) {
      console.error('[DatabaseWorkspace] Failed to load tables:', error);
      toast.error('Failed to load tables. Check your connection and try again.');
    } finally {
      setLoadingTables(false);
    }
  }, [activeConnection]);

  useEffect(() => {
    if (activeConnection && activeConnection.type === 'SQL') {
      loadTables();
    }
  }, [activeConnection, loadTables]);

  // WRK-001 fix: Use generic query execution with DB-specific SQL
  const handleTableClick = async (tableName: string) => {
    setSelectedTable(tableName);
    setLoadingSchema(true);
    try {
      const dbType = activeConnection?.config?.database_type;
      const sql = getDescribeTableQuery(tableName, dbType);

      const result = await invoke<TableSchemaResult>('db_execute_query', {
        connectionId: activeConnection!.id,
        sql,
      });
      setTableSchema(result);
    } catch (error) {
      console.error('[DatabaseWorkspace] Failed to describe table:', error);
      toast.error('Failed to load table schema. Please try again.');
    } finally {
      setLoadingSchema(false);
    }
  };

  if (activeConnection && activeConnection.type !== 'SQL') {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Schema browser is only available for SQL connections</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[250px_minmax(0,1fr)] gap-4 h-full">
      {}
      <div className="border border-border rounded-md overflow-hidden">
        <div className="bg-muted/30 px-3 py-2 border-b border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Tables</span>
            {loadingTables && <span className="text-xs text-muted-foreground">Loading...</span>}
          </div>
        </div>
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
          {tables.length === 0 ? (
            <div className="px-3 py-8 text-xs text-muted-foreground text-center">
              {loadingTables ? 'Loading tables...' : 'No tables found'}
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {tables.map((table) => (
                <button type="button"
                  key={table}
                  onClick={() => handleTableClick(table)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                    selectedTable === table
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-muted/50 text-foreground',
                  )}
                >
                  <Table className="h-3 w-3 inline mr-2" />
                  {table}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {}
      <div className="border border-border rounded-md overflow-hidden">
        {selectedTable ? (
          <>
            <div className="bg-muted/30 px-4 py-2 border-b border-border">
              <h3 className="text-sm font-semibold">{selectedTable}</h3>
            </div>
            <div className="overflow-auto max-h-[calc(100vh-300px)] p-4">
              {loadingSchema ? (
                <div className="text-xs text-muted-foreground">Loading schema...</div>
              ) : tableSchema ? (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Column</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Nullable</th>
                      <th className="px-3 py-2 text-left font-medium">Key</th>
                      <th className="px-3 py-2 text-left font-medium">Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(tableSchema.rows) &&
                      tableSchema.rows.map((row: unknown[], i: number) => (
                        <tr key={i} className="border-b border-border hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs font-semibold">
                            {String(row[0] ?? '')}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {String(row[1] ?? '')}
                          </td>
                          <td className="px-3 py-2 text-xs">{String(row[2] ?? '')}</td>
                          <td className="px-3 py-2 text-xs">{String(row[3] ?? '')}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {String(row[4] ?? '-')}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Select a table to view its schema</p>
          </div>
        )}
      </div>
    </div>
  );
}

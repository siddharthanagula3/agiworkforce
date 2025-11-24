import { Database, History, Link, Link2Off, Play, Plus, Table } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useDatabaseStore, type ConnectionConfig } from '../../stores/databaseStore';
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

  // Connection form state
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connectionType, setConnectionType] = useState<'SQL' | 'MongoDB' | 'Redis'>('SQL');
  const [connectionName, setConnectionName] = useState('');
  const [dbType, setDbType] = useState<'Postgres' | 'MySql' | 'Sqlite'>('Postgres');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');

  // MongoDB specific
  const [mongoCollection, setMongoCollection] = useState('');
  const [mongoFilter, setMongoFilter] = useState('{}');

  // Redis specific
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

    try {
      if (connectionType === 'SQL') {
        const config: ConnectionConfig = {
          database_type: dbType,
          host,
          port: parseInt(port),
          username,
          password,
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
      toast.error(`Connection failed: ${error}`);
    }
  };

  const resetConnectionForm = () => {
    setConnectionName('');
    setHost('localhost');
    setPort('5432');
    setUsername('');
    setPassword('');
    setDatabase('');
  };

  const handleCloseConnection = async (connectionId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      await closeConnection(connectionId);
      toast.success('Connection closed');
    } catch (error) {
      toast.error(`Failed to close connection: ${error}`);
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
      toast.error(`Query failed: ${error}`);
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
      toast.error(`MongoDB query failed: ${error}`);
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
      toast.error(`Redis GET failed: ${error}`);
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
      toast.error(`Redis SET failed: ${error}`);
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Toolbar */}
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

      {/* Connection Form */}
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
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
              />
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

      {/* Connections List */}
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
                  isActive ? 'bg-background border border-border shadow-sm' : 'hover:bg-muted/50',
                )}
              >
                <Database
                  className={cn('h-3 w-3', isActive ? 'text-primary' : 'text-muted-foreground')}
                />
                <span className={cn('text-sm', isActive && 'font-medium')}>{conn.name}</span>
                <span className="text-xs text-muted-foreground">({conn.type})</span>

                <button
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

      {/* Main Content */}
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

          {/* Query Tab */}
          <TabsContent value="query" className="flex-1 flex flex-col overflow-hidden">
            {activeConnection.type === 'SQL' ? (
              <>
                <div className="flex-1 overflow-auto p-3">
                  <textarea
                    value={currentQuery}
                    onChange={(e) => setCurrentQuery(e.target.value)}
                    placeholder="Enter SQL query..."
                    className="w-full h-full p-3 border border-border rounded-md font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
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

          {/* Results Tab */}
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

          {/* History Tab */}
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

          {/* Schema Tab */}
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

// Schema Explorer Component
function SchemaExplorer({
  activeConnection,
  loading: _loading,
}: {
  activeConnection: any;
  loading: boolean;
}) {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSchema, setTableSchema] = useState<any>(null);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingSchema, setLoadingSchema] = useState(false);

  const loadTables = useCallback(async () => {
    if (!activeConnection) return;

    setLoadingTables(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<string[]>('db_mysql_list_tables', {
        connectionId: activeConnection.id,
      });
      setTables(result);
    } catch (error) {
      toast.error(`Failed to load tables: ${error}`);
    } finally {
      setLoadingTables(false);
    }
  }, [activeConnection]);

  useEffect(() => {
    if (activeConnection && activeConnection.type === 'SQL') {
      loadTables();
    }
  }, [activeConnection, loadTables]);

  const handleTableClick = async (tableName: string) => {
    setSelectedTable(tableName);
    setLoadingSchema(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('db_mysql_describe_table', {
        connectionId: activeConnection.id,
        tableName,
      });
      setTableSchema(result);
    } catch (error) {
      toast.error(`Failed to describe table: ${error}`);
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
      {/* Tables List */}
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
                <button
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

      {/* Table Schema */}
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
                      tableSchema.rows.map((row: any[], i: number) => (
                        <tr key={i} className="border-b border-border hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs font-semibold">{row[0]}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {row[1]}
                          </td>
                          <td className="px-3 py-2 text-xs">{row[2]}</td>
                          <td className="px-3 py-2 text-xs">{row[3]}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {row[4] ?? '-'}
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

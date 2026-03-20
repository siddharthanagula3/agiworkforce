import { AlertCircle, FileCode2, FolderOpen, RefreshCw, Server, Wrench } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import MCPConfigEditor from '../MCP/MCPConfigEditor';
import MCPCredentialManager from '../MCP/MCPCredentialManager';
import MCPConnectionStatus from '../MCP/MCPConnectionStatus';
import MCPServerCard from '../MCP/MCPServerCard';
import MCPToolBrowser from '../MCP/MCPToolBrowser';
import { Alert, AlertDescription } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { useShallow } from 'zustand/react/shallow';
import { useMcpStore } from '../../stores/mcpStore';

export function MCPToolsSettings() {
  const {
    servers,
    tools,
    configLocation,
    isInitialized,
    isLoading,
    error,
    searchQuery,
    initialize,
    refreshServers,
    refreshTools,
    refreshRuntimeTelemetry,
    refreshConfigLocation,
    searchTools,
    setSearchQuery,
    clearError,
  } = useMcpStore(
    useShallow((s) => ({
      servers: s.servers,
      tools: s.tools,
      configLocation: s.configLocation,
      isInitialized: s.isInitialized,
      isLoading: s.isLoading,
      error: s.error,
      searchQuery: s.searchQuery,
      initialize: s.initialize,
      refreshServers: s.refreshServers,
      refreshTools: s.refreshTools,
      refreshRuntimeTelemetry: s.refreshRuntimeTelemetry,
      refreshConfigLocation: s.refreshConfigLocation,
      searchTools: s.searchTools,
      setSearchQuery: s.setSearchQuery,
      clearError: s.clearError,
    })),
  );

  useEffect(() => {
    if (!isInitialized) {
      void initialize();
      return;
    }

    void refreshConfigLocation();
  }, [initialize, isInitialized, refreshConfigLocation]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshServers(),
        refreshTools(),
        refreshRuntimeTelemetry(),
        refreshConfigLocation(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshConfigLocation, refreshRuntimeTelemetry, refreshServers, refreshTools]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (value.trim()) {
        void searchTools(value);
      } else {
        void refreshTools();
      }
    },
    [refreshTools, searchTools, setSearchQuery],
  );

  const enabledServers = servers.filter((server) => server.enabled).length;
  const sourceLabel =
    configLocation?.source === 'project' ? 'Project MCP config' : 'Global MCP config';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">MCP Tools</h3>
          <p className="text-sm text-muted-foreground">
            Configure and manage Model Context Protocol servers, tools, and credentials.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void handleRefreshAll()}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isRefreshing || isLoading ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span className="truncate">{error}</span>
            <Button size="sm" variant="ghost" onClick={clearError}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">MCP Config Source</CardTitle>
            </div>
            <Badge variant={configLocation?.source === 'project' ? 'default' : 'secondary'}>
              {sourceLabel}
            </Badge>
          </div>
          <CardDescription>
            Uses project-level config with this precedence when a project folder is active:
            <code> .mcp.json </code>, <code>mcp.json</code>, <code>.vscode/mcp.json</code>. Falls
            back to global desktop config when no project folder is active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-card px-3 py-2 font-mono text-xs break-all">
            {configLocation?.path || 'Resolving MCP config path...'}
          </div>
          {configLocation?.source !== 'project' && (
            <p className="text-xs text-muted-foreground">
              Select a project folder in the chat composer to activate project-scoped MCP config.
            </p>
          )}
          {configLocation?.projectFolder && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="truncate">{configLocation.projectFolder}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">Configured Servers</span>
            <span className="font-semibold">{servers.length}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">Enabled</span>
            <span className="font-semibold">{enabledServers}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">Available Tools</span>
            <span className="font-semibold">{tools.length}</span>
          </CardContent>
        </Card>
      </div>

      <MCPConnectionStatus />

      <Tabs defaultValue="servers" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="servers" className="gap-2">
            <Server className="h-4 w-4" />
            Servers
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-2">
            <Wrench className="h-4 w-4" />
            Tools
          </TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="servers">
          {servers.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No MCP servers configured.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {servers.map((server) => (
                <MCPServerCard key={server.name} server={server} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <Input
            value={searchQuery}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Search MCP tools..."
          />
          <MCPToolBrowser tools={tools} />
        </TabsContent>

        <TabsContent value="credentials">
          <MCPCredentialManager servers={servers} />
        </TabsContent>

        <TabsContent value="config">
          <MCPConfigEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}

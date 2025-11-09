import { useEffect } from 'react';
import { useMcpStore } from '../../stores/mcpStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Alert, AlertDescription } from '../ui/Alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { RefreshCw, Search, Server, Wrench, Settings, Key } from 'lucide-react';
import type { McpServerInfo } from '../../types/mcp';
import MCPServerCard from './MCPServerCard';
import MCPToolBrowser from './MCPToolBrowser';
import MCPCredentialManager from './MCPCredentialManager';
import MCPConfigEditor from './MCPConfigEditor';

export default function MCPWorkspace() {
  const {
    servers,
    tools,
    isInitialized,
    isLoading,
    error,
    searchQuery,
    initialize,
    refreshServers,
    refreshTools,
    searchTools,
    setSearchQuery,
    clearError,
  } = useMcpStore();

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  const handleRefreshAll = async () => {
    await Promise.all([refreshServers(), refreshTools()]);
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      searchTools(value);
    } else {
      refreshTools();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">MCP Management</h1>
          <span className="text-sm text-muted-foreground">Model Context Protocol</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Bar */}
      <div className="flex items-center gap-4 p-4 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{servers.length} Servers</span>
          <span className="text-xs text-muted-foreground">
            ({servers.filter((s: McpServerInfo) => s.connected).length} connected)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{tools.length} Tools</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="servers" className="h-full flex flex-col">
          <TabsList className="w-full justify-start border-b rounded-none px-4">
            <TabsTrigger value="servers" className="gap-2">
              <Server className="w-4 h-4" />
              Servers
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-2">
              <Wrench className="w-4 h-4" />
              Tools
            </TabsTrigger>
            <TabsTrigger value="credentials" className="gap-2">
              <Key className="w-4 h-4" />
              Credentials
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2">
              <Settings className="w-4 h-4" />
              Configuration
            </TabsTrigger>
          </TabsList>

          {/* Servers Tab */}
          <TabsContent value="servers" className="flex-1 overflow-auto p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">MCP Servers</h2>
                <span className="text-sm text-muted-foreground">
                  {servers.filter((s: McpServerInfo) => s.enabled).length} enabled
                </span>
              </div>

              {servers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Server className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No servers configured</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add servers in the Configuration tab
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {servers.map((server: McpServerInfo) => (
                    <MCPServerCard key={server.name} server={server} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="flex-1 overflow-auto p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tools..."
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleSearch(e.target.value)
                    }
                    className="pl-10"
                  />
                </div>
              </div>

              <MCPToolBrowser tools={tools} />
            </div>
          </TabsContent>

          {/* Credentials Tab */}
          <TabsContent value="credentials" className="flex-1 overflow-auto p-4">
            <MCPCredentialManager servers={servers} />
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config" className="flex-1 overflow-auto p-4">
            <MCPConfigEditor />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

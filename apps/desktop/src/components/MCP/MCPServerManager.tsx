import { useEffect, useState } from 'react';
import { useMcpStore } from '../../stores/mcpStore';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Dialog } from '../ui/Dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { Spinner } from '../ui/Spinner';
import { ScrollArea } from '../ui/ScrollArea';
import { Switch } from '../ui/Switch';
import {
  Server,
  Power,
  PowerOff,
  Settings,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Activity,
  Download,
} from 'lucide-react';
import type { McpServerInfo } from '../../types/mcp';

interface ServerConfigDialogProps {
  server: McpServerInfo | null;
  open: boolean;
  onClose: () => void;
  onSave: (serverName: string, config: any) => void;
}

const curatedCatalog = [
  {
    name: 'filesystem',
    title: 'Filesystem',
    description: 'Read and write local project files safely.',
  },
  {
    name: 'git',
    title: 'Git',
    description: 'Inspect branches, diffs, and repo history.',
  },
  {
    name: 'github',
    title: 'GitHub',
    description: 'Open pull requests, issues, and reviews with tokens.',
  },
  {
    name: 'terminal',
    title: 'Terminal',
    description: 'Shell access for scripted workflows.',
  },
  {
    name: 'windows_ui',
    title: 'Windows UI',
    description: 'Interact with native apps via the Windows automation harness.',
  },
] as const;

function ServerConfigDialog({ server, open, onClose, onSave }: ServerConfigDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const { storeCredential } = useMcpStore();

  const handleSave = async () => {
    if (server && apiKey) {
      await storeCredential(server.name, 'API_KEY', apiKey);
      onSave(server.name, { endpoint });
    }
    onClose();
  };

  if (!server) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">Configure {server.name}</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">API Key</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key"
            />
            <p className="text-xs text-gray-500 mt-1">
              Stored securely in Windows Credential Manager
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Endpoint (Optional)</label>
            <Input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.example.com"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Configuration</Button>
        </div>
      </div>
    </Dialog>
  );
}

interface ServerCardProps {
  server: McpServerInfo;
  onStart: (name: string) => void;
  onStop: (name: string) => void;
  onConfigure: (server: McpServerInfo) => void;
  onViewLogs: (name: string) => void;
  onUninstall: (name: string) => void;
  onToggleEnabled: (name: string, enabled: boolean) => void;
  isLoading: boolean;
}

function ServerCard({
  server,
  onStart,
  onStop,
  onConfigure,
  onViewLogs,
  onUninstall,
  onToggleEnabled,
  isLoading,
}: ServerCardProps) {
  const getStatusBadge = () => {
    if (server.connected) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1 bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3" />
          Running
        </Badge>
      );
    } else if (server.enabled) {
      return (
        <Badge
          variant="secondary"
          className="flex items-center gap-1 bg-yellow-100 text-yellow-800"
        >
          <AlertCircle className="w-3 h-3" />
          Stopped
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          Disabled
        </Badge>
      );
    }
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-lg">{server.name}</h3>
            {getStatusBadge()}
          </div>

          <p className="text-sm text-gray-600 mb-3">{server.tool_count} tools available</p>
        </div>

        <div className="flex flex-col items-end gap-1 pl-4">
          <Switch
            checked={server.enabled}
            disabled={isLoading}
            onCheckedChange={(checked) => onToggleEnabled(server.name, checked)}
            aria-label={`Toggle ${server.name}`}
          />
          <span className="text-xs text-gray-500">
            {server.enabled ? 'Auto-start on' : 'Auto-start off'}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {server.connected ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStop(server.name)}
            disabled={isLoading}
            className="flex items-center gap-1"
          >
            <PowerOff className="w-3 h-3" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStart(server.name)}
            disabled={isLoading || !server.enabled}
            className="flex items-center gap-1"
          >
            <Power className="w-3 h-3" />
            Start
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          onClick={() => onConfigure(server)}
          disabled={isLoading}
          className="flex items-center gap-1"
        >
          <Settings className="w-3 h-3" />
          Configure
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onViewLogs(server.name)}
          disabled={isLoading}
          className="flex items-center gap-1"
        >
          <Activity className="w-3 h-3" />
          Logs
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => onUninstall(server.name)}
          disabled={isLoading}
          className="flex items-center gap-1 text-red-600 hover:text-red-700"
        >
          <Trash2 className="w-3 h-3" />
          Uninstall
        </Button>
      </div>
    </Card>
  );
}

export function MCPServerManager() {
  const {
    servers,
    isLoading,
    error,
    initialize,
    refreshServers,
    connectServer,
    disconnectServer,
    enableServer,
    disableServer,
    clearError,
  } = useMcpStore();

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<McpServerInfo | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleStart = async (serverName: string) => {
    setActionLoading(serverName);
    try {
      await connectServer(serverName);
      await refreshServers();
    } catch (err) {
      console.error('Failed to start server:', err);
    }
    setActionLoading(null);
  };

  const handleStop = async (serverName: string) => {
    setActionLoading(serverName);
    try {
      await disconnectServer(serverName);
      await refreshServers();
    } catch (err) {
      console.error('Failed to stop server:', err);
    }
    setActionLoading(null);
  };

  const handleToggleEnabled = async (serverName: string, nextEnabled: boolean) => {
    setActionLoading(serverName);
    try {
      if (nextEnabled) {
        await enableServer(serverName);
      } else {
        await disableServer(serverName);
      }
      await refreshServers();
    } catch (err) {
      console.error('Failed to update server toggle:', err);
    }
    setActionLoading(null);
  };

  const handleConfigure = (server: McpServerInfo) => {
    setSelectedServer(server);
    setConfigDialogOpen(true);
  };

  const handleSaveConfig = async (_serverName: string, _config: any) => {
    // Configuration is saved through the dialog
    await refreshServers();
  };

  const handleViewLogs = (serverName: string) => {
    // TODO: Implement logs viewer
    console.log('View logs for', serverName);
  };

  const handleUninstall = async (serverName: string) => {
    if (confirm(`Are you sure you want to uninstall ${serverName}?`)) {
      // TODO: Implement uninstall
      console.log('Uninstall', serverName);
    }
  };

  const handleRefresh = async () => {
    await refreshServers();
  };

  const connectedServers = servers.filter((s) => s.connected);
  const availableServers = servers.filter((s) => !s.connected);
  const curatedEntries = curatedCatalog.map((meta) => ({
    meta,
    info: servers.find((server) => server.name === meta.name) ?? null,
  }));

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">MCP Server Manager</h1>
            <p className="text-gray-600 mt-1">
              Manage Model Context Protocol servers and integrate external tools
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700">
            <AlertCircle className="w-4 h-4" />
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="text-red-700 hover:text-red-900">
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="mb-8">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Curated Tool Marketplace</h2>
          <p className="text-sm text-gray-600">
            Flip on the core MCP servers we recommend for developer automation.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {curatedEntries.map(({ meta, info }) => (
            <Card key={meta.name} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-medium">{meta.title}</p>
                  <p className="text-sm text-gray-600">{meta.description}</p>
                </div>
                <Switch
                  checked={Boolean(info?.enabled)}
                  disabled={!info || isLoading || actionLoading === info?.name}
                  onCheckedChange={(checked) => info && handleToggleEnabled(info.name, checked)}
                  aria-label={`Toggle ${meta.title}`}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{info?.connected ? 'Connected' : 'Not connected'}</span>
                <span>{info ? `${info.tool_count} tools` : 'Not installed'}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Tabs defaultValue="installed">
        <TabsList>
          <TabsTrigger value="installed">Installed Servers ({servers.length})</TabsTrigger>
          <TabsTrigger value="running">Running ({connectedServers.length})</TabsTrigger>
          <TabsTrigger value="available">Available ({availableServers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="installed">
          {isLoading && servers.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : servers.length === 0 ? (
            <div className="text-center py-12">
              <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No MCP Servers</h3>
              <p className="text-gray-600 mb-4">Get started by browsing the server registry</p>
              <Button className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Browse Registry
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4">
                {servers.map((server) => (
                  <ServerCard
                    key={server.name}
                    server={server}
                    onStart={handleStart}
                    onStop={handleStop}
                    onConfigure={handleConfigure}
                    onViewLogs={handleViewLogs}
                    onUninstall={handleUninstall}
                    onToggleEnabled={handleToggleEnabled}
                    isLoading={actionLoading === server.name}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="running">
          {connectedServers.length === 0 ? (
            <div className="text-center py-12">
              <PowerOff className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Running Servers</h3>
              <p className="text-gray-600">Start a server from the Installed Servers tab</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4">
                {connectedServers.map((server) => (
                  <ServerCard
                    key={server.name}
                    server={server}
                    onStart={handleStart}
                    onStop={handleStop}
                    onConfigure={handleConfigure}
                    onViewLogs={handleViewLogs}
                    onUninstall={handleUninstall}
                    onToggleEnabled={handleToggleEnabled}
                    isLoading={actionLoading === server.name}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="available">
          {availableServers.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">All Servers Running</h3>
              <p className="text-gray-600">All installed servers are currently running</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-4">
                {availableServers.map((server) => (
                  <ServerCard
                    key={server.name}
                    server={server}
                    onStart={handleStart}
                    onStop={handleStop}
                    onConfigure={handleConfigure}
                    onViewLogs={handleViewLogs}
                    onUninstall={handleUninstall}
                    onToggleEnabled={handleToggleEnabled}
                    isLoading={actionLoading === server.name}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      <ServerConfigDialog
        server={selectedServer}
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        onSave={handleSaveConfig}
      />
    </div>
  );
}

export default MCPServerManager;

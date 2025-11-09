import { useState, useEffect } from 'react';
import { useMcpStore } from '../../stores/mcpStore';
import { Button } from '../ui/Button';
import { Alert, AlertDescription } from '../ui/Alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Switch } from '../ui/Switch';
import { Label } from '../ui/Label';
import { Save, AlertCircle, FileJson, RotateCcw } from 'lucide-react';
import type { McpServersConfig } from '../../types/mcp';

export default function MCPConfigEditor() {
  const { config, loadConfig, updateConfig, isLoading } = useMcpStore();
  const [localConfig, setLocalConfig] = useState(config);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!config) {
      loadConfig();
    }
  }, [config, loadConfig]);

  useEffect(() => {
    setLocalConfig(config);
    setHasChanges(false);
  }, [config]);

  const handleToggleServer = (serverName: string) => {
    if (!localConfig) return;

    const currentServer = localConfig.mcpServers[serverName];
    if (!currentServer) return;

    const newConfig: McpServersConfig = {
      ...localConfig,
      mcpServers: {
        ...localConfig.mcpServers,
        [serverName]: {
          ...currentServer,
          enabled: !currentServer.enabled,
        },
      },
    };

    setLocalConfig(newConfig);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!localConfig) return;

    await updateConfig(localConfig);
    setHasChanges(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleReset = () => {
    setLocalConfig(config);
    setHasChanges(false);
  };

  if (!localConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading configuration...</p>
      </div>
    );
  }

  const serverNames = Object.keys(localConfig.mcpServers).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">MCP Configuration</h2>
          <p className="text-sm text-muted-foreground mt-1">Enable or disable MCP servers</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          )}
          <Button
            variant={saveSuccess ? 'default' : 'default'}
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isLoading}
          >
            {saveSuccess ? (
              'Saved!'
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Alert for changes */}
      {hasChanges && (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            You have unsaved changes. Click "Save Changes" to apply them.
          </AlertDescription>
        </Alert>
      )}

      {/* Server List */}
      <div className="space-y-4">
        {serverNames.map((serverName) => {
          const server = localConfig.mcpServers[serverName];

          if (!server) return null;

          return (
            <Card key={serverName}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{serverName}</CardTitle>
                      {server.enabled ? (
                        <Badge variant="default">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs mt-1">
                      Command:{' '}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {server.command} {server.args.join(' ')}
                      </code>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`toggle-${serverName}`} className="text-sm">
                      {server.enabled ? 'Enabled' : 'Disabled'}
                    </Label>
                    <Switch
                      id={`toggle-${serverName}`}
                      checked={server.enabled}
                      onCheckedChange={() => handleToggleServer(serverName)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {/* Command Details */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Command</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded block">
                      {server.command}
                    </code>
                  </div>

                  {/* Arguments */}
                  {server.args.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Arguments</p>
                      <div className="flex flex-wrap gap-1">
                        {server.args.map((arg: string, index: number) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {arg}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Environment Variables */}
                  {Object.keys(server.env).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Environment Variables
                      </p>
                      <div className="space-y-1">
                        {Object.entries(server.env).map(([key, value]: [string, string]) => (
                          <div key={key} className="text-xs">
                            <code className="bg-muted px-1 py-0.5 rounded">{key}</code>
                            {': '}
                            <span className="text-muted-foreground">
                              {value.includes('credential_manager')
                                ? '(from credential manager)'
                                : value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* JSON View */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4" />
            <CardTitle className="text-base">Raw Configuration</CardTitle>
          </div>
          <CardDescription className="text-xs">View the raw JSON configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
            {JSON.stringify(localConfig, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

import { useMcpStore } from '../../stores/mcpStore';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Server, Plug, PlugZap, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { McpServerInfo } from '../../types/mcp';

interface MCPServerCardProps {
  server: McpServerInfo;
}

export default function MCPServerCard({ server }: MCPServerCardProps) {
  const { connectServer, disconnectServer, isLoading, stats } = useMcpStore();

  const handleToggleConnection = async () => {
    if (server.connected) {
      await disconnectServer(server.name);
    } else {
      await connectServer(server.name);
    }
  };

  const getStatusIcon = () => {
    if (server.connected) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    if (!server.enabled) {
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
    return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
  };

  const getStatusBadge = () => {
    if (server.connected) {
      return (
        <Badge variant="default" className="bg-green-500">
          Connected
        </Badge>
      );
    }
    if (!server.enabled) {
      return <Badge variant="secondary">Disabled</Badge>;
    }
    return <Badge variant="outline">Disconnected</Badge>;
  };

  const toolCount = stats[server.name] || server.tool_count || 0;

  return (
    <Card className={`${!server.enabled ? 'opacity-60' : ''}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-base">{server.name}</CardTitle>
              <CardDescription className="text-xs mt-1">MCP Server</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            {getStatusBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Stats */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Available Tools:</span>
            <span className="font-medium">{toolCount}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {server.enabled && (
              <Button
                variant={server.connected ? 'destructive' : 'default'}
                size="sm"
                onClick={handleToggleConnection}
                disabled={isLoading}
                className="flex-1"
              >
                {server.connected ? (
                  <>
                    <Plug className="w-4 h-4 mr-2" />
                    Disconnect
                  </>
                ) : (
                  <>
                    <PlugZap className="w-4 h-4 mr-2" />
                    Connect
                  </>
                )}
              </Button>
            )}
            {!server.enabled && (
              <div className="flex-1 text-center text-sm text-muted-foreground py-2">
                Server disabled in configuration
              </div>
            )}
          </div>

          {/* Server Info */}
          {server.connected && toolCount > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                This server provides {toolCount} tool{toolCount !== 1 ? 's' : ''} for automation
                tasks
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { mcp } from '@agiworkforce/desktop-command-client';
import { useMcpStore } from '../../stores/mcpStore';
import { Button } from '@/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Switch } from '@/ui/Switch';
import { Server, Plug, PlugZap, AlertCircle, CheckCircle2, ScrollText } from 'lucide-react';
import type { McpServerInfo } from '../../types/mcp';
import { MCPLogsViewer } from './MCPLogsViewer';
import { receivedSecretsNotice } from './receivedSecrets';

interface MCPServerCardProps {
  server: McpServerInfo;
  setSandbox?: (name: string, sandboxed: boolean) => Promise<void>;
}

function ServerSandboxSetting({
  server,
  setSandbox,
  onChanged,
}: {
  server: McpServerInfo;
  setSandbox: (name: string, sandboxed: boolean) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sandboxed = server.sandboxed !== false;
  const switchId = `sandbox-${server.name}`;

  const change = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await setSandbox(server.name, next);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1 border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={switchId} className="text-sm font-medium text-foreground">
          Run in sandbox
        </label>
        <Switch
          id={switchId}
          checked={sandboxed}
          disabled={saving}
          onCheckedChange={(next) => void change(next)}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {sandboxed
          ? 'Can read your files but only write to its workspace and package caches.'
          : 'Runs with your full user rights and can change any file you can.'}
      </p>
      {server.sandboxNotice ? (
        <p role="status" className="text-sm text-foreground">
          {server.sandboxNotice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function approvalCoverageNotice(files: readonly string[] | undefined): string | null {
  if (!files || files.length === 0) return null;
  return `Turning this on approves this project's server as it is now, including the content of ${files.join(', ')}. If one of them changes, the server turns off and asks again. What those files load is not checked.`;
}

export default function MCPServerCard({
  server,
  setSandbox = mcp.mcpSetServerSandbox,
}: MCPServerCardProps) {
  const {
    connectServer,
    disconnectServer,
    enableServer,
    disableServer,
    refreshServers,
    isLoading,
    stats,
  } = useMcpStore(
    useShallow((s) => ({
      connectServer: s.connectServer,
      disconnectServer: s.disconnectServer,
      enableServer: s.enableServer,
      disableServer: s.disableServer,
      refreshServers: s.refreshServers,
      isLoading: s.isLoading,
      stats: s.stats,
    })),
  );
  const [logsOpen, setLogsOpen] = useState(false);
  const enabledId = `enabled-${server.name}`;
  const secretsNoticeId = `secrets-${server.name}`;
  const secretsNotice = receivedSecretsNotice(server.receivesSecrets, server.enabled);
  const coverageNoticeId = `approval-${server.name}`;
  const coverageNotice =
    server.approvalNotice ?? approvalCoverageNotice(server.approvalCoversFiles);
  const enabledDescription = [
    secretsNotice ? secretsNoticeId : null,
    coverageNotice ? coverageNoticeId : null,
  ]
    .filter(Boolean)
    .join(' ');

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

  const toolCount = stats[server.name] ?? server.toolCount ?? 0;

  return (
    <Card className={`${!server.enabled ? 'opacity-60' : ''}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-base">{server.name}</CardTitle>
              <CardDescription className="text-xs mt-1">Integration</CardDescription>
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
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Available Tools:</span>
            <span className="font-medium">{toolCount}</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={enabledId} className="text-sm font-medium text-foreground">
                Enabled
              </label>
              <Switch
                id={enabledId}
                checked={server.enabled}
                disabled={isLoading}
                aria-describedby={enabledDescription || undefined}
                onCheckedChange={(next) =>
                  void (next ? enableServer(server.name) : disableServer(server.name))
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {server.enabled
                ? 'Chat can use this server once it is connected.'
                : 'Chat cannot use this server. Turning it off also stops it if it is running.'}
            </p>
            {secretsNotice ? (
              <p id={secretsNoticeId} className="text-sm text-foreground">
                {secretsNotice}
              </p>
            ) : null}
            {coverageNotice ? (
              <p id={coverageNoticeId} className="break-words text-sm text-foreground">
                {coverageNotice}
              </p>
            ) : null}
          </div>

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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={server.enabled ? undefined : 'flex-1'}
              onClick={() => setLogsOpen(true)}
            >
              <ScrollText className="w-4 h-4 mr-2" aria-hidden="true" />
              View logs
            </Button>
          </div>

          {server.local !== false && (
            <ServerSandboxSetting
              server={server}
              setSandbox={setSandbox}
              onChanged={refreshServers}
            />
          )}

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
      {logsOpen ? (
        <MCPLogsViewer serverName={server.name} open onClose={() => setLogsOpen(false)} />
      ) : null}
    </Card>
  );
}

/**
 * ConnectorHealthDashboard Component
 *
 * Shows all currently connected MCP servers from mcpStore with live status,
 * tool counts, last ping times, and reconnect/disconnect actions.
 */

import { useCallback, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  RefreshCw,
  ServerCrash,
  WifiOff,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { invoke } from '../../lib/tauri-mock';
import {
  useMcpStore,
  selectMcpServers,
  selectMcpHealth,
  selectMcpIsLoading,
} from '../../stores/mcpStore';
import { Button } from '../ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { cn } from '../../lib/utils';
import type { McpServerHealth } from '../../types/mcp';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type HealthStatus = McpServerHealth['status'] | 'disconnected';

interface StatusConfig {
  icon: React.ReactNode;
  label: string;
  className: string;
}

function getStatusConfig(status: HealthStatus): StatusConfig {
  switch (status) {
    case 'healthy':
      return {
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        label: 'Healthy',
        className: 'text-green-500',
      };
    case 'degraded':
      return {
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        label: 'Degraded',
        className: 'text-amber-500',
      };
    case 'unhealthy':
      return {
        icon: <ServerCrash className="h-3.5 w-3.5" />,
        label: 'Unhealthy',
        className: 'text-destructive',
      };
    case 'disconnected':
      return {
        icon: <WifiOff className="h-3.5 w-3.5" />,
        label: 'Disconnected',
        className: 'text-muted-foreground',
      };
    default:
      return {
        icon: <HelpCircle className="h-3.5 w-3.5" />,
        label: 'Unknown',
        className: 'text-muted-foreground',
      };
  }
}

function formatLastPing(lastCheck: string | null | undefined): string {
  if (!lastCheck) return 'Never';
  try {
    const date = new Date(lastCheck);
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  } catch {
    return 'Unknown';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ConnectorHealthDashboardProps {
  className?: string;
}

export function ConnectorHealthDashboard({ className }: ConnectorHealthDashboardProps) {
  const servers = useMcpStore(selectMcpServers);
  const health = useMcpStore(selectMcpHealth);
  const isLoading = useMcpStore(selectMcpIsLoading);
  const refreshServers = useMcpStore((s) => s.refreshServers);
  const refreshHealth = useMcpStore((s) => s.refreshHealth);

  // Auto-refresh on mount
  useEffect(() => {
    void refreshServers();
    void refreshHealth();
  }, [refreshServers, refreshHealth]);

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([refreshServers(), refreshHealth()]);
  }, [refreshServers, refreshHealth]);

  const handleReconnect = useCallback(
    async (name: string) => {
      try {
        await invoke<string>('mcp_connect_server', { name });
        toast.success(`Reconnected to ${name}`);
        await Promise.all([refreshServers(), refreshHealth()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Reconnect failed';
        toast.error(`Failed to reconnect: ${message}`);
      }
    },
    [refreshServers, refreshHealth],
  );

  const handleDisconnect = useCallback(
    async (name: string) => {
      try {
        await invoke<void>('mcp_disconnect_server', { name });
        toast.success(`Disconnected from ${name}`);
        await Promise.all([refreshServers(), refreshHealth()]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Disconnect failed';
        toast.error(`Failed to disconnect: ${message}`);
      }
    },
    [refreshServers, refreshHealth],
  );

  // Build a lookup map from server name → health entry
  const healthByName = new Map<string, McpServerHealth>();
  for (const h of health) {
    healthByName.set(h.server_name, h);
  }

  const connectedServers = servers.filter((s) => s.connected);
  const allServers = servers;

  if (allServers.length === 0) {
    return (
      <div className={cn('flex flex-col gap-4', className)}>
        <DashboardHeader
          serverCount={0}
          connectedCount={0}
          isLoading={isLoading}
          onRefresh={handleRefreshAll}
        />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <DashboardHeader
        serverCount={allServers.length}
        connectedCount={connectedServers.length}
        isLoading={isLoading}
        onRefresh={handleRefreshAll}
      />

      <div className="flex flex-col gap-2">
        {allServers.map((server) => {
          const healthEntry = healthByName.get(server.name);
          const effectiveStatus: HealthStatus = !server.connected
            ? 'disconnected'
            : (healthEntry?.status ?? 'unknown');

          const statusConfig = getStatusConfig(effectiveStatus);

          return (
            <div
              key={server.name}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3
                transition-colors hover:bg-muted/50"
            >
              {/* Status indicator dot */}
              <div
                className={cn(
                  'h-2 w-2 rounded-full shrink-0',
                  effectiveStatus === 'healthy' && 'bg-green-500',
                  effectiveStatus === 'degraded' && 'bg-amber-500',
                  effectiveStatus === 'unhealthy' && 'bg-destructive',
                  effectiveStatus === 'disconnected' && 'bg-muted-foreground/40',
                  effectiveStatus === 'unknown' && 'bg-muted-foreground/40',
                )}
              />

              {/* Server name + status */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{server.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn('flex items-center gap-1 text-xs', statusConfig.className)}>
                    {statusConfig.icon}
                    {statusConfig.label}
                  </span>
                  {healthEntry?.error_message && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-destructive truncate max-w-[120px] cursor-help">
                          — {healthEntry.error_message}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{healthEntry.error_message}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Meta: tool count */}
              <div className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
                <Zap className="h-3 w-3" />
                <span>{server.tool_count} tools</span>
              </div>

              {/* Meta: last ping */}
              <div className="shrink-0 text-xs text-muted-foreground hidden sm:block min-w-[70px] text-right">
                {formatLastPing(healthEntry?.last_check)}
              </div>

              {/* Meta: response time */}
              {healthEntry?.response_time_ms != null && (
                <div className="shrink-0 text-xs text-muted-foreground hidden sm:block min-w-[50px] text-right">
                  {healthEntry.response_time_ms}ms
                </div>
              )}

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1.5">
                {server.connected ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDisconnect(server.name)}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    aria-label={`Disconnect ${server.name}`}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleReconnect(server.name)}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    aria-label={`Reconnect ${server.name}`}
                  >
                    <Activity className="h-3 w-3 mr-1" />
                    Reconnect
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface DashboardHeaderProps {
  serverCount: number;
  connectedCount: number;
  isLoading: boolean;
  onRefresh: () => void;
}

function DashboardHeader({
  serverCount,
  connectedCount,
  isLoading,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold">Server Health</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          {connectedCount} of {serverCount} server{serverCount !== 1 ? 's' : ''} connected
        </p>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-7 w-7 p-0"
            aria-label="Refresh server health"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh health status</TooltipContent>
      </Tooltip>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Loader2 className="h-8 w-8 mb-3 opacity-30" />
      <p className="text-sm font-medium">No MCP servers configured</p>
      <p className="text-xs mt-1 opacity-70">
        Add servers via the MCP configuration to see their health here.
      </p>
    </div>
  );
}

import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMcpToolDisplayName } from '../../hooks/agenticEventUtils';
import { useShallow } from 'zustand/react/shallow';
import { useMcpStore } from '../../stores/mcpStore';
import type {
  McpExecutionHistoryEntry,
  McpServerHealth,
  McpToolExecutionStats,
} from '../../types/mcp';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ScrollArea } from '../ui/ScrollArea';

const DEFAULT_HISTORY_LIMIT = 10;

function formatResponseTime(ms: number | null) {
  if (ms === null) return 'N/A';
  return `${ms}ms`;
}

function getResponseTimeColor(ms: number | null) {
  if (ms === null) return 'text-muted-foreground';
  if (ms < 100) return 'text-green-600';
  if (ms < 500) return 'text-yellow-600';
  return 'text-red-600';
}

function getResponseTimeLabel(ms: number | null): string {
  if (ms === null) return '';
  if (ms < 100) return 'Fast';
  if (ms < 500) return 'Slow';
  return 'Critical';
}

function getStatusBadge(status: McpServerHealth['status']) {
  switch (status) {
    case 'healthy':
      return (
        <Badge variant="secondary" className="flex items-center gap-1 bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3" />
          Healthy
        </Badge>
      );
    case 'degraded':
      return (
        <Badge
          variant="secondary"
          className="flex items-center gap-1 bg-yellow-100 text-yellow-800"
        >
          <AlertTriangle className="h-3 w-3" />
          Degraded
        </Badge>
      );
    case 'unhealthy':
      return (
        <Badge variant="secondary" className="flex items-center gap-1 bg-red-100 text-red-800">
          <XCircle className="h-3 w-3" />
          Unhealthy
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Unknown
        </Badge>
      );
  }
}

function formatExecutionTime(timestamp: number | null | undefined) {
  if (!timestamp) return 'Never';
  return new Date(timestamp * 1000).toLocaleTimeString();
}

function getResultPreview(entry: McpExecutionHistoryEntry): string | null {
  if (!entry.success) {
    return entry.error ?? null;
  }

  if (entry.result === null || entry.result === undefined) {
    return null;
  }

  try {
    const serialized = JSON.stringify(entry.result, null, 2);
    return serialized.length > 500 ? `${serialized.slice(0, 500)}…` : serialized;
  } catch {
    return String(entry.result);
  }
}

function ToolStatRow({ stat }: { stat: McpToolExecutionStats }) {
  const successRate =
    stat.total_executions === 0
      ? 0
      : Math.round((stat.successful_executions / stat.total_executions) * 100);
  const toolName = getMcpToolDisplayName(stat.tool_id);

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="truncate font-medium">{toolName}</div>
        <div className="text-xs text-muted-foreground">{stat.tool_id}</div>
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-4 text-right text-sm">
        <div>
          <div className="font-semibold">{stat.total_executions}</div>
          <div className="text-xs text-muted-foreground">Runs</div>
        </div>
        <div>
          <div className="font-semibold">{successRate}%</div>
          <div className="text-xs text-muted-foreground">Success</div>
        </div>
        <div>
          <div className="font-semibold">{Math.round(stat.avg_duration_ms)}ms</div>
          <div className="text-xs text-muted-foreground">Avg</div>
        </div>
      </div>
    </div>
  );
}

export function MCPConnectionStatus() {
  const {
    health,
    executionHistory,
    toolExecutionStats,
    refreshServers,
    refreshHealth,
    checkServerHealth,
    refreshExecutionHistory,
    refreshToolExecutionStats,
    connectServer,
  } = useMcpStore(
    useShallow((s) => ({
      health: s.health,
      executionHistory: s.executionHistory,
      toolExecutionStats: s.toolExecutionStats,
      refreshServers: s.refreshServers,
      refreshHealth: s.refreshHealth,
      checkServerHealth: s.checkServerHealth,
      refreshExecutionHistory: s.refreshExecutionHistory,
      refreshToolExecutionStats: s.refreshToolExecutionStats,
      connectServer: s.connectServer,
    })),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refreshRuntime = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshServers(),
        refreshHealth(),
        refreshExecutionHistory(DEFAULT_HISTORY_LIMIT),
        refreshToolExecutionStats(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshExecutionHistory, refreshHealth, refreshServers, refreshToolExecutionStats]);

  useEffect(() => {
    void refreshRuntime();
  }, [refreshRuntime]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = window.setInterval(() => {
      void refreshRuntime();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [autoRefresh, refreshRuntime]);

  const healthyCount = useMemo(
    () => health.filter((serverHealth) => serverHealth.status === 'healthy').length,
    [health],
  );
  const unhealthyCount = useMemo(
    () =>
      health.filter(
        (serverHealth) => serverHealth.status === 'unhealthy' || serverHealth.status === 'degraded',
      ).length,
    [health],
  );
  const totalTools = useMemo(
    () => health.reduce((sum, serverHealth) => sum + serverHealth.tool_count, 0),
    [health],
  );
  const totalExecutions = useMemo(
    () => toolExecutionStats.reduce((sum, stat) => sum + stat.total_executions, 0),
    [toolExecutionStats],
  );
  const totalFailures = useMemo(
    () => toolExecutionStats.reduce((sum, stat) => sum + stat.failed_executions, 0),
    [toolExecutionStats],
  );
  const slowestTools = useMemo(
    () =>
      [...toolExecutionStats]
        .sort((left, right) => right.avg_duration_ms - left.avg_duration_ms)
        .slice(0, 5),
    [toolExecutionStats],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Runtime Health</h2>
          <p className="text-sm text-muted-foreground">
            Live MCP server health, recent executions, and tool performance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshRuntime()}
            disabled={isRefreshing}
            className="flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            <span className="text-sm text-muted-foreground">Servers</span>
          </div>
          <div className="text-2xl font-bold">{health.length}</div>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-sm text-muted-foreground">Healthy</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{healthyCount}</div>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm text-muted-foreground">Issues</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{unhealthyCount}</div>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-500" />
            <span className="text-sm text-muted-foreground">Tools</span>
          </div>
          <div className="text-2xl font-bold">{totalTools}</div>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            <span className="text-sm text-muted-foreground">Executions</span>
          </div>
          <div className="text-2xl font-bold">{totalExecutions}</div>
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="text-sm text-muted-foreground">Failures</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{totalFailures}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <div className="border-b p-4">
            <h3 className="font-semibold">Server Health</h3>
          </div>

          <ScrollArea className="h-[360px]">
            {health.length === 0 ? (
              <div className="py-12 text-center">
                <Activity className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">No connected MCP servers</h3>
                <p className="text-sm text-muted-foreground">
                  Enable and connect MCP servers to see live health.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {health.map((serverHealth) => (
                  <div key={serverHealth.server_name} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <h4 className="font-semibold">{serverHealth.server_name}</h4>
                          {getStatusBadge(serverHealth.status)}
                        </div>
                        {serverHealth.error_message && (
                          <div className="mt-2 flex items-start gap-1 text-sm text-red-600">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{serverHealth.error_message}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                          <Zap className="h-3 w-3" />
                          Response Time
                        </div>
                        <div
                          className={`font-semibold ${getResponseTimeColor(serverHealth.response_time_ms)}`}
                        >
                          {formatResponseTime(serverHealth.response_time_ms)}
                          {serverHealth.response_time_ms !== null && (
                            <> · {getResponseTimeLabel(serverHealth.response_time_ms)}</>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                          <TrendingUp className="h-3 w-3" />
                          Tools
                        </div>
                        <div className="font-semibold">{serverHealth.tool_count}</div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                          <AlertTriangle className="h-3 w-3" />
                          Failures
                        </div>
                        <div
                          className={`font-semibold ${serverHealth.consecutive_failures > 0 ? 'text-red-600' : 'text-green-600'}`}
                        >
                          {serverHealth.consecutive_failures}
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Last Check
                        </div>
                        <div className="text-xs font-semibold">
                          {new Date(serverHealth.last_check).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    {(serverHealth.status === 'unhealthy' ||
                      serverHealth.status === 'degraded') && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void checkServerHealth(serverHealth.server_name)}
                        >
                          Test Connection
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void connectServer(serverHealth.server_name)}
                        >
                          Reconnect
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        <Card>
          <div className="border-b p-4">
            <h3 className="font-semibold">Recent Tool Executions</h3>
          </div>

          <ScrollArea className="h-[360px]">
            {executionHistory.length === 0 ? (
              <div className="py-12 text-center">
                <Zap className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">No MCP executions yet</h3>
                <p className="text-sm text-muted-foreground">
                  Tool execution history appears here after MCP tools run.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {executionHistory.map((entry, index) => {
                  const preview = getResultPreview(entry);
                  const toolName = getMcpToolDisplayName(entry.tool_id);

                  return (
                    <div
                      key={`${entry.tool_id}-${entry.timestamp}-${index}`}
                      className="space-y-3 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{toolName}</div>
                          <div className="text-xs text-muted-foreground">
                            {entry.server_name} · {entry.tool_id}
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            entry.success
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }
                        >
                          {entry.success ? 'Success' : 'Failed'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Duration</div>
                          <div className="font-semibold">{entry.duration_ms}ms</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Executed</div>
                          <div className="font-semibold">
                            {formatExecutionTime(entry.timestamp)}
                          </div>
                        </div>
                      </div>

                      {preview && (
                        <details className="rounded-md border bg-muted/20 p-3">
                          <summary className="cursor-pointer text-sm font-medium">
                            {entry.success ? 'Result' : 'Error'}
                          </summary>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
                            {preview}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>

      <Card>
        <div className="border-b p-4">
          <h3 className="font-semibold">Tool Performance</h3>
        </div>
        <div className="p-4">
          {slowestTools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No MCP tool stats collected yet.</p>
          ) : (
            <div className="divide-y">
              {slowestTools.map((stat) => (
                <ToolStatRow key={stat.tool_id} stat={stat} />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default MCPConnectionStatus;

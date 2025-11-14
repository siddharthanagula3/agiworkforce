import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ScrollArea } from '../ui/ScrollArea';
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Zap,
  TrendingUp
} from 'lucide-react';

interface ServerHealth {
  server_name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  last_check: number;
  error_message: string | null;
  latency_ms: number | null;
  uptime_seconds: number | null;
  requests_handled: number;
}

export function MCPConnectionStatus() {
  const [healthData, setHealthData] = useState<ServerHealth[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = async () => {
    setIsLoading(true);
    try {
      const health = await invoke<ServerHealth[]>('mcp_get_health');
      setHealthData(health);
    } catch (error) {
      console.error('Failed to fetch health data:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHealth();

    if (!autoRefresh) {
      return;
    }

    const interval = setInterval(fetchHealth, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getStatusBadge = (status: 'healthy' | 'unhealthy' | 'unknown') => {
    switch (status) {
      case 'healthy':
        return (
          <Badge variant="secondary" className="flex items-center gap-1 bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            Healthy
          </Badge>
        );
      case 'unhealthy':
        return (
          <Badge variant="secondary" className="flex items-center gap-1 bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" />
            Unhealthy
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Unknown
          </Badge>
        );
    }
  };

  const formatUptime = (seconds: number | null) => {
    if (seconds === null) return 'N/A';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const formatLatency = (latency: number | null) => {
    if (latency === null) return 'N/A';
    return `${latency}ms`;
  };

  const getLatencyColor = (latency: number | null) => {
    if (latency === null) return 'text-gray-500';
    if (latency < 100) return 'text-green-600';
    if (latency < 500) return 'text-yellow-600';
    return 'text-red-600';
  };

  const healthyCount = healthData.filter(h => h.status === 'healthy').length;
  const unhealthyCount = healthData.filter(h => h.status === 'unhealthy').length;
  const totalRequests = healthData.reduce((sum, h) => sum + h.requests_handled, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Connection Status</h2>
          <p className="text-sm text-gray-600">
            Real-time monitoring of MCP server connections
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>

          <Button
            size="sm"
            variant="outline"
            onClick={fetchHealth}
            disabled={isLoading}
            className="flex items-center gap-1"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-gray-600">Total Servers</span>
          </div>
          <div className="text-2xl font-bold">{healthData.length}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm text-gray-600">Healthy</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{healthyCount}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm text-gray-600">Unhealthy</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{unhealthyCount}</div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-500" />
            <span className="text-sm text-gray-600">Total Requests</span>
          </div>
          <div className="text-2xl font-bold">{totalRequests.toLocaleString()}</div>
        </Card>
      </div>

      {/* Server Health List */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="font-semibold">Server Health Details</h3>
        </div>

        <ScrollArea className="h-[400px]">
          {healthData.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Servers Connected</h3>
              <p className="text-gray-600">
                Connect to MCP servers to see their health status
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {healthData.map((health) => (
                <div key={health.server_name} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{health.server_name}</h4>
                        {getStatusBadge(health.status)}
                      </div>

                      {health.error_message && (
                        <div className="text-sm text-red-600 mt-2 flex items-start gap-1">
                          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>{health.error_message}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600 mb-1 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        Latency
                      </div>
                      <div className={`font-semibold ${getLatencyColor(health.latency_ms)}`}>
                        {formatLatency(health.latency_ms)}
                      </div>
                    </div>

                    <div>
                      <div className="text-gray-600 mb-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Uptime
                      </div>
                      <div className="font-semibold">
                        {formatUptime(health.uptime_seconds)}
                      </div>
                    </div>

                    <div>
                      <div className="text-gray-600 mb-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        Requests
                      </div>
                      <div className="font-semibold">
                        {health.requests_handled.toLocaleString()}
                      </div>
                    </div>

                    <div>
                      <div className="text-gray-600 mb-1">Last Check</div>
                      <div className="font-semibold text-xs">
                        {new Date(health.last_check * 1000).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  {health.status === 'unhealthy' && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          invoke('mcp_check_server_health', {
                            serverName: health.server_name
                          }).then(fetchHealth);
                        }}
                      >
                        Test Connection
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          invoke('mcp_connect_server', {
                            name: health.server_name
                          }).then(fetchHealth);
                        }}
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
    </div>
  );
}

export default MCPConnectionStatus;

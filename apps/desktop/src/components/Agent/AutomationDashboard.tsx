import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Play,
  Pause,
  Square,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  TrendingUp,
  BarChart3,
  List,
  Grid,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { ScrollArea } from '../ui/ScrollArea';
import { cn } from '../../lib/utils';

interface AutomationSession {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  started_at: number;
  completed_at?: number;
  steps_total: number;
  steps_completed: number;
  current_step?: string;
  error?: string;
}

interface ResourceMetrics {
  cpu_usage: number;
  memory_usage: number;
  memory_total: number;
  disk_usage: number;
  disk_total: number;
  network_rx: number;
  network_tx: number;
}

interface ExecutionHistory {
  id: string;
  goal: string;
  status: string;
  started_at: number;
  completed_at?: number;
  steps_count: number;
  success: boolean;
}

export function AutomationDashboard() {
  const [sessions, setSessions] = useState<AutomationSession[]>([]);
  const [resources, setResources] = useState<ResourceMetrics | null>(null);
  const [history, setHistory] = useState<ExecutionHistory[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
    loadResources();
    loadHistory();

    // Refresh every 2 seconds
    const interval = setInterval(() => {
      loadSessions();
      loadResources();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    try {
      const result = await invoke<AutomationSession[]>('computer_use_list_sessions');
      setSessions(result);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadResources = async () => {
    try {
      const result = await invoke<ResourceMetrics>('agi_get_resource_status');
      setResources(result);
    } catch (error) {
      console.error('Failed to load resources:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const result = await invoke<ExecutionHistory[]>('agi_get_execution_history', {
        limit: 10,
      });
      setHistory(result);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleStopSession = async (sessionId: string) => {
    try {
      await invoke('computer_use_stop_session', { sessionId });
      await loadSessions();
    } catch (error) {
      console.error('Failed to stop session:', error);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Play className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      running: 'default',
      completed: 'secondary',
      failed: 'destructive',
      paused: 'outline',
    };
    return (
      <Badge variant={variants[status] || 'outline'} className="capitalize">
        {status}
      </Badge>
    );
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automation Dashboard</h1>
          <p className="text-muted-foreground">Monitor and manage autonomous workflows</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Resource Metrics */}
      {resources && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resources.cpu_usage.toFixed(1)}%</div>
              <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn('h-full transition-all', {
                    'bg-green-500': resources.cpu_usage < 50,
                    'bg-yellow-500': resources.cpu_usage >= 50 && resources.cpu_usage < 80,
                    'bg-red-500': resources.cpu_usage >= 80,
                  })}
                  style={{ width: `${resources.cpu_usage}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Memory</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatBytes(resources.memory_usage)}
              </div>
              <p className="text-xs text-muted-foreground">
                of {formatBytes(resources.memory_total)}
              </p>
              <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{
                    width: `${(resources.memory_usage / resources.memory_total) * 100}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Disk</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatBytes(resources.disk_usage)}
              </div>
              <p className="text-xs text-muted-foreground">
                of {formatBytes(resources.disk_total)}
              </p>
              <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${(resources.disk_usage / resources.disk_total) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Network</CardTitle>
              <Wifi className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">RX</div>
                  <div className="font-medium">{formatBytes(resources.network_rx)}/s</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">TX</div>
                  <div className="font-medium">{formatBytes(resources.network_tx)}/s</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="active" className="flex-1 flex flex-col min-h-0">
        <TabsList>
          <TabsTrigger value="active">Active Sessions</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Activity className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No active sessions</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Start a new automation workflow to see it here
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                {sessions.map((session) => (
                  <Card key={session.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="truncate text-lg">{session.name}</CardTitle>
                          <CardDescription className="mt-1">
                            {session.current_step || 'Initializing...'}
                          </CardDescription>
                        </div>
                        <div className="ml-2">{getStatusIcon(session.status)}</div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">
                          {session.steps_completed}/{session.steps_total}
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{
                            width: `${(session.steps_completed / session.steps_total) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          {formatDuration(Date.now() - session.started_at)}
                        </div>
                        {getStatusBadge(session.status)}
                      </div>
                      {session.status === 'running' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleStopSession(session.id)}
                        >
                          <Square className="h-4 w-4 mr-2" />
                          Stop
                        </Button>
                      )}
                      {session.error && (
                        <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
                          {session.error}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-2 p-4">
                {sessions.map((session) => (
                  <Card key={session.id} className="p-4 hover:bg-accent transition-colors">
                    <div className="flex items-center gap-4">
                      {getStatusIcon(session.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium truncate">{session.name}</h3>
                          {getStatusBadge(session.status)}
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-1">
                          {session.current_step || 'Initializing...'}
                        </p>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {session.steps_completed}/{session.steps_total}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDuration(Date.now() - session.started_at)}
                      </div>
                      {session.status === 'running' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStopSession(session.id)}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="space-y-2 p-4">
              {history.map((item) => (
                <Card key={item.id} className="p-4 hover:bg-accent transition-colors">
                  <div className="flex items-center gap-4">
                    {item.success ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{item.goal}</h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span>{item.steps_count} steps</span>
                        <span>
                          {formatDuration(
                            (item.completed_at || Date.now()) - item.started_at
                          )}
                        </span>
                        <span>
                          {new Date(item.started_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                    <Badge variant={item.success ? 'secondary' : 'destructive'}>
                      {item.status}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="analytics" className="flex-1 min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            <Card>
              <CardHeader>
                <CardTitle>Success Rate</CardTitle>
                <CardDescription>Last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center h-32">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-green-500">
                      {history.length > 0
                        ? ((history.filter((h) => h.success).length / history.length) * 100).toFixed(
                            0
                          )
                        : 0}
                      %
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {history.filter((h) => h.success).length} of {history.length} successful
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Average Duration</CardTitle>
                <CardDescription>Per automation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center h-32">
                  <div className="text-center">
                    <div className="text-4xl font-bold">
                      {history.length > 0
                        ? formatDuration(
                            history.reduce(
                              (acc, h) => acc + ((h.completed_at || Date.now()) - h.started_at),
                              0
                            ) / history.length
                          )
                        : '0s'}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Based on {history.length} executions
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total Executions</CardTitle>
                <CardDescription>All time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center h-32">
                  <div className="text-center">
                    <div className="text-4xl font-bold">{history.length}</div>
                    <p className="text-sm text-muted-foreground mt-2">
                      <TrendingUp className="h-4 w-4 inline mr-1" />
                      Automations executed
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Average Steps</CardTitle>
                <CardDescription>Per automation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center h-32">
                  <div className="text-center">
                    <div className="text-4xl font-bold">
                      {history.length > 0
                        ? (
                            history.reduce((acc, h) => acc + h.steps_count, 0) / history.length
                          ).toFixed(1)
                        : 0}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      <BarChart3 className="h-4 w-4 inline mr-1" />
                      Steps per execution
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

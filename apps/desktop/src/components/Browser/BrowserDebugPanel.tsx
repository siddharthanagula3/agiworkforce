import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBrowserStore } from '../../stores/browserStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { ScrollArea } from '../ui/ScrollArea';
import { Badge } from '../ui/Badge';
import {
  Code,
  Terminal,
  Network,
  Cookie,
  Gauge,
  RefreshCw,
  Copy,
  Search,
  Info,
  AlertTriangle,
  XCircle,
  Trash2,
  Database,
  Key,
} from 'lucide-react';
import { toast } from 'sonner';

interface BrowserDebugPanelProps {
  className?: string;
  tabId?: string;
}

const LOG_LEVEL_ICONS = {
  log: Info,
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
};

const LOG_LEVEL_COLORS = {
  log: 'text-muted-foreground',
  info: 'text-blue-600',
  warn: 'text-yellow-600',
  error: 'text-red-600',
};

// Storage item interface
interface StorageItem {
  key: string;
  value: string;
  size: number;
}

// Performance metric interface
interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  status: 'good' | 'warning' | 'poor';
}

export function BrowserDebugPanel({ className, tabId }: BrowserDebugPanelProps) {
  const {
    consoleLogs,
    networkRequests,
    domSnapshots,
    sessions,
    activeSessionId,
    getDOMSnapshot,
    getConsoleLogs,
    getNetworkActivity,
  } = useBrowserStore();

  const [selectedTab, setSelectedTab] = useState('dom');
  const [selectorSearch, setSelectorSearch] = useState('');
  const [consoleFilter, setConsoleFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeTab = activeSession?.tabs.find((t) => t.active);
  const currentTabId = tabId || activeTab?.id;

  const latestSnapshot = domSnapshots[domSnapshots.length - 1];

  const refreshData = useCallback(async () => {
    if (!currentTabId) return;

    setIsLoading(true);
    try {
      await Promise.all([
        getDOMSnapshot(currentTabId),
        getConsoleLogs(currentTabId),
        getNetworkActivity(currentTabId),
      ]);
    } catch (error) {
      console.error('Failed to refresh debug data:', error);
      toast.error('Failed to refresh debug data');
    } finally {
      setIsLoading(false);
    }
  }, [currentTabId, getDOMSnapshot, getConsoleLogs, getNetworkActivity]);

  useEffect(() => {
    if (currentTabId) {
      refreshData();
    }
  }, [currentTabId, refreshData]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const filteredConsoleLogs = consoleLogs.filter((log) => {
    if (consoleFilter !== 'all' && log.level !== consoleFilter) {
      return false;
    }
    return true;
  });

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 300 && status < 400) return 'text-blue-600';
    if (status >= 400 && status < 500) return 'text-yellow-600';
    if (status >= 500) return 'text-red-600';
    return 'text-muted-foreground';
  };

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-background border border-border rounded-lg',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Debug Panel</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={refreshData}
          disabled={isLoading || !currentTabId}
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="px-4">
          <TabsTrigger value="dom">
            <Code className="h-3 w-3 mr-1" />
            DOM
          </TabsTrigger>
          <TabsTrigger value="console">
            <Terminal className="h-3 w-3 mr-1" />
            Console
            {consoleLogs.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {consoleLogs.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="network">
            <Network className="h-3 w-3 mr-1" />
            Network
            {networkRequests.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {networkRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="storage">
            <Cookie className="h-3 w-3 mr-1" />
            Storage
          </TabsTrigger>
          <TabsTrigger value="performance">
            <Gauge className="h-3 w-3 mr-1" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* DOM Tab */}
        <TabsContent value="dom" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={selectorSearch}
                onChange={(e) => setSelectorSearch(e.target.value)}
                placeholder="Search HTML elements..."
                className="flex-1"
              />
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {latestSnapshot ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    Snapshot from {new Date(latestSnapshot.timestamp).toLocaleTimeString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(latestSnapshot.html)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy HTML
                  </Button>
                </div>

                <pre className="text-xs font-mono bg-muted/5 p-4 rounded-lg overflow-x-auto border border-border">
                  <code>{latestSnapshot.html}</code>
                </pre>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center space-y-2">
                  <Code className="h-12 w-12 mx-auto opacity-20" />
                  <div className="text-sm">No DOM snapshot available</div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={refreshData}
                    disabled={!currentTabId}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Capture Snapshot
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Console Tab */}
        <TabsContent value="console" className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
            {(['all', 'log', 'info', 'warn', 'error'] as const).map((level) => (
              <Button
                key={level}
                variant={consoleFilter === level ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setConsoleFilter(level)}
              >
                {level === 'all' ? 'All' : level}
                {level !== 'all' && (
                  <Badge variant="secondary" className="ml-2">
                    {consoleLogs.filter((log) => log.level === level).length}
                  </Badge>
                )}
              </Button>
            ))}
          </div>

          <ScrollArea className="flex-1">
            {filteredConsoleLogs.length > 0 ? (
              <div className="divide-y divide-border">
                {filteredConsoleLogs.map((log, index) => {
                  const Icon = LOG_LEVEL_ICONS[log.level];
                  return (
                    <div key={index} className="px-4 py-2 hover:bg-muted/50">
                      <div className="flex items-start gap-2">
                        <Icon className={cn('h-4 w-4 mt-0.5', LOG_LEVEL_COLORS[log.level])} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {log.level}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                            {log.message}
                          </pre>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(log.message)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Terminal className="h-12 w-12 mx-auto opacity-20 mb-2" />
                  <div className="text-sm">No console logs</div>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Network Tab */}
        <TabsContent value="network" className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            {networkRequests.length > 0 ? (
              <div className="divide-y divide-border">
                {networkRequests.map((request, index) => (
                  <div key={index} className="px-4 py-3 hover:bg-muted/50">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="text-xs">
                        {request.method}
                      </Badge>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono truncate mb-1">{request.url}</div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className={cn('font-medium', getStatusColor(request.status))}>
                            {request.status}
                          </span>
                          <span>{request.duration_ms}ms</span>
                          <span>{new Date(request.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(request.url)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Network className="h-12 w-12 mx-auto opacity-20 mb-2" />
                  <div className="text-sm">No network activity</div>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Storage Tab */}
        <TabsContent value="storage" className="flex-1 flex flex-col overflow-hidden">
          <StorageViewer tabId={currentTabId} />
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="flex-1 flex flex-col overflow-hidden">
          <PerformanceMetrics tabId={currentTabId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Storage Viewer Component
function StorageViewer({ tabId: _tabId }: { tabId?: string }) {
  const [storageType, setStorageType] = useState<'localStorage' | 'sessionStorage' | 'cookies'>(
    'localStorage',
  );
  const [storageItems, setStorageItems] = useState<StorageItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Simulated storage data (in real app, this would come from browser context)
  const mockStorageData: Record<string, StorageItem[]> = useMemo(
    () => ({
      localStorage: [
        { key: 'theme', value: 'dark', size: 4 },
        { key: 'user_preferences', value: '{"sidebar":true,"compact":false}', size: 35 },
        { key: 'recent_searches', value: '["react","typescript","zustand"]', size: 32 },
      ],
      sessionStorage: [
        { key: 'session_id', value: 'abc123xyz', size: 9 },
        { key: 'tab_state', value: '{"activeTab":"home"}', size: 22 },
      ],
      cookies: [
        { key: 'auth_token', value: '***hidden***', size: 128 },
        { key: 'preferences', value: 'lang=en', size: 7 },
      ],
    }),
    [],
  );

  useEffect(() => {
    setIsLoading(true);
    // Simulate loading storage data
    const timer = setTimeout(() => {
      setStorageItems(mockStorageData[storageType] || []);
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [storageType, mockStorageData]);

  const filteredItems = storageItems.filter(
    (item) =>
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.value.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const totalSize = filteredItems.reduce((acc, item) => acc + item.size, 0);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Storage Type Selector */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        {(['localStorage', 'sessionStorage', 'cookies'] as const).map((type) => (
          <Button
            key={type}
            variant={storageType === type ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setStorageType(type)}
          >
            {type === 'localStorage' && <Database className="h-3 w-3 mr-1" />}
            {type === 'sessionStorage' && <Key className="h-3 w-3 mr-1" />}
            {type === 'cookies' && <Cookie className="h-3 w-3 mr-1" />}
            {type === 'localStorage' ? 'Local' : type === 'sessionStorage' ? 'Session' : 'Cookies'}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search storage..."
            className="flex-1"
          />
        </div>
      </div>

      {/* Storage Items */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="divide-y divide-border">
            {filteredItems.map((item, index) => (
              <div key={index} className="px-4 py-3 hover:bg-muted/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-primary">{item.key}</span>
                      <Badge variant="secondary" className="text-xs">
                        {item.size} bytes
                      </Badge>
                    </div>
                    <pre className="text-xs font-mono text-muted-foreground truncate">
                      {item.value}
                    </pre>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(item.value)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Cookie className="h-12 w-12 mx-auto opacity-20 mb-2" />
              <div className="text-sm">No storage data</div>
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex justify-between">
        <span>{filteredItems.length} items</span>
        <span>Total: {totalSize} bytes</span>
      </div>
    </div>
  );
}

// Performance Metrics Component
function PerformanceMetrics({ tabId: _tabId }: { tabId?: string }) {
  const [isLoading, setIsLoading] = useState(false);

  // Simulated performance metrics
  const metrics: PerformanceMetric[] = useMemo(
    () => [
      { name: 'First Contentful Paint', value: 1.2, unit: 's', status: 'good' },
      { name: 'Largest Contentful Paint', value: 2.5, unit: 's', status: 'good' },
      { name: 'Time to Interactive', value: 3.1, unit: 's', status: 'warning' },
      { name: 'Cumulative Layout Shift', value: 0.05, unit: '', status: 'good' },
      { name: 'First Input Delay', value: 45, unit: 'ms', status: 'good' },
      { name: 'Total Blocking Time', value: 180, unit: 'ms', status: 'warning' },
      { name: 'DOM Content Loaded', value: 1.8, unit: 's', status: 'good' },
      { name: 'Page Load Time', value: 4.2, unit: 's', status: 'warning' },
    ],
    [],
  );

  const memoryMetrics = useMemo(
    () => ({
      usedJSHeapSize: 45.2,
      totalJSHeapSize: 128,
      jsHeapSizeLimit: 512,
    }),
    [],
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return 'text-green-500 bg-green-500/10';
      case 'warning':
        return 'text-yellow-500 bg-yellow-500/10';
      case 'poor':
        return 'text-red-500 bg-red-500/10';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsLoading(false);
    toast.success('Performance metrics refreshed');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-sm font-medium">Core Web Vitals & Metrics</span>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Performance Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric, index) => (
              <div key={index} className="p-3 rounded-lg border border-border bg-muted/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{metric.name}</span>
                  <Badge className={cn('text-xs', getStatusColor(metric.status))}>
                    {metric.status}
                  </Badge>
                </div>
                <div className="text-lg font-semibold">
                  {metric.value}
                  <span className="text-sm text-muted-foreground ml-1">{metric.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Memory Usage */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Memory Usage</h4>
            <div className="p-4 rounded-lg border border-border bg-muted/5">
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">JS Heap Usage</span>
                    <span>
                      {memoryMetrics.usedJSHeapSize} / {memoryMetrics.totalJSHeapSize} MB
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{
                        width: `${(memoryMetrics.usedJSHeapSize / memoryMetrics.totalJSHeapSize) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Heap Size Limit</span>
                  <span>{memoryMetrics.jsHeapSizeLimit} MB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Quick Actions</h4>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Clear Cache
              </Button>
              <Button variant="outline" size="sm">
                Force GC
              </Button>
              <Button variant="outline" size="sm">
                Export Report
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

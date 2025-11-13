import { useState, useEffect } from 'react';
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

  useEffect(() => {
    // Auto-load debug data when panel opens
    if (currentTabId) {
      refreshData();
    }
  }, [currentTabId]);

  const refreshData = async () => {
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
  };

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
    <div className={cn('flex flex-col h-full bg-background border border-border rounded-lg', className)}>
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
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col overflow-hidden">
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

        {/* DOM Inspector */}
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
                  <Button variant="default" size="sm" onClick={refreshData} disabled={!currentTabId}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Capture Snapshot
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Console Logs */}
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

        {/* Network Activity */}
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

        {/* Storage (Cookies/LocalStorage) */}
        <TabsContent value="storage" className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Cookie className="h-12 w-12 mx-auto opacity-20 mb-2" />
            <div className="text-sm">Storage viewer coming soon</div>
          </div>
        </TabsContent>

        {/* Performance Metrics */}
        <TabsContent value="performance" className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Gauge className="h-12 w-12 mx-auto opacity-20 mb-2" />
            <div className="text-sm">Performance metrics coming soon</div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { invoke } from '@/lib/tauri-mock';
import { Download, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui/Dialog';
import { ScrollArea } from '../ui/ScrollArea';

interface MCPLogsViewerProps {
  serverName: string;
  open: boolean;
  onClose: () => void;
}

export function MCPLogsViewer({ serverName, open, onClose }: MCPLogsViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const logLines = await invoke<string[]>('mcp_get_server_logs', {
        serverName,
        lines: 200,
      });
      setLogs(logLines);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [serverName]);

  useEffect(() => {
    if (!open || !serverName) return undefined;
    
    void fetchLogs();
    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      void fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [open, serverName, fetchLogs]);

  const handleExport = async () => {
    const logText = logs.join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${serverName}-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Logs: {serverName}</DialogTitle>
          <DialogDescription>Server logs and debug information</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2">
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded">
            {error}
          </div>
        )}

        <ScrollArea className="flex-1 border rounded-md bg-muted/30 p-4">
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No logs available for this server
            </div>
          ) : (
            <div className="font-mono text-xs space-y-1">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={cn(
                    'px-2 py-1 rounded',
                    log.includes('ERROR') || log.includes('error')
                      ? 'bg-destructive/10 text-destructive'
                      : log.includes('WARN') || log.includes('warn')
                        ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                        : log.includes('INFO') || log.includes('info')
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'text-foreground/80',
                  )}
                >
                  {log}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}


import { McpClient } from '../../api/mcp';
import { Download, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { cn } from '../../lib/utils';
import { Button } from '@/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/Dialog';
import { ScrollArea } from '@/ui/ScrollArea';
import { Spinner } from '@/ui/Spinner';

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
      const logLines = await McpClient.getServerLogs(serverName, 200);
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

    const interval = setInterval(() => {
      void fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [open, serverName, fetchLogs]);

  const handleExport = async () => {
    setError(null);
    try {
      const path = await save({
        defaultPath: `${serverName}-logs.txt`,
        filters: [{ name: 'Text', extensions: ['txt'] }],
      });
      if (path) await writeTextFile(path, logs.join('\n'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export logs');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Logs: {serverName}</DialogTitle>
          <DialogDescription>
            The most recent lines this server wrote to standard error, refreshed every five seconds.
          </DialogDescription>
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
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={logs.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2">
            <X className="h-4 w-4" aria-hidden="true" />
            Close
          </Button>
        </div>

        {error && (
          <p role="alert" className="mb-4 text-sm text-danger-text">
            {error}
          </p>
        )}

        <ScrollArea className="flex-1 border rounded-md bg-muted p-4">
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              This server has written nothing to standard error since the app started.
            </p>
          ) : (
            <div className="space-y-1 font-mono text-sm">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={cn(
                    'break-all px-2 py-1',
                    /error/i.test(log) ? 'text-danger-text' : 'text-foreground',
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

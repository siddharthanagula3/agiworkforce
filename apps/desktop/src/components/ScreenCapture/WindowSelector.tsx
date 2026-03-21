import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Monitor, RefreshCw, Search } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { useScreenCapture } from '../../hooks/useScreenCapture';
import type { WindowInfo } from '../../types/capture';
import { cn } from '../../lib/utils';

interface WindowSelectorProps {
  onConfirm: (window: WindowInfo) => void;
  onCancel: () => void;
}

export function WindowSelector({ onConfirm, onCancel }: WindowSelectorProps) {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { getAvailableWindows } = useScreenCapture();

  const loadWindows = useCallback(async () => {
    setIsLoading(true);
    try {
      const availableWindows = await getAvailableWindows();
      setWindows(availableWindows);
    } catch (error) {
      console.error('Failed to load windows:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getAvailableWindows]);

  useEffect(() => {
    loadWindows();
  }, [loadWindows]);

  const filteredWindows = windows.filter((window) => {
    const query = searchQuery.toLowerCase();
    return (
      window.title.toLowerCase().includes(query) || window.process.toLowerCase().includes(query)
    );
  });

  const handleConfirm = useCallback(() => {
    if (selectedWindow) {
      onConfirm(selectedWindow);
    }
  }, [selectedWindow, onConfirm]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter' && selectedWindow) {
        handleConfirm();
      }
    },
    [onCancel, handleConfirm, selectedWindow],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Select Window to Capture</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search and Refresh */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search windows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon" onClick={loadWindows} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>

        {/* Window List */}
        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <RefreshCw className="h-8 w-8 animate-spin" />
                <p className="text-sm">Loading windows...</p>
              </div>
            </div>
          ) : filteredWindows.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Monitor className="h-8 w-8 opacity-50" />
                <p className="text-sm">
                  {searchQuery ? 'No windows match your search' : 'No windows available'}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-2">
              {filteredWindows.map((window) => (
                <button
                  type="button"
                  key={window.handle}
                  onClick={() => setSelectedWindow(window)}
                  className={cn(
                    'w-full rounded-lg p-3 text-left transition-colors',
                    'hover:bg-muted/50',
                    selectedWindow?.handle === window.handle &&
                      'bg-primary/10 border border-primary',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-muted p-2">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {window.title || 'Untitled Window'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{window.process}</p>
                      {window.bounds && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {window.bounds.width} x {window.bounds.height}
                        </p>
                      )}
                    </div>
                    {selectedWindow?.handle === window.handle && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {filteredWindows.length} window{filteredWindows.length !== 1 ? 's' : ''} available
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel (Esc)
            </Button>
            <Button onClick={handleConfirm} disabled={!selectedWindow}>
              <Check className="mr-2 h-4 w-4" />
              Capture (Enter)
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

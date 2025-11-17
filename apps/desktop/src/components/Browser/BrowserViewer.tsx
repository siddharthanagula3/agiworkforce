import { useState, useEffect, useRef } from 'react';
import { useBrowserStore } from '../../stores/browserStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  Play,
  Pause,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
} from 'lucide-react';

interface BrowserViewerProps {
  className?: string;
  tabId?: string;
}

export function BrowserViewer({ className, tabId }: BrowserViewerProps) {
  const {
    screenshots,
    highlightedElement,
    isStreaming,
    startStreaming,
    stopStreaming,
    sessions,
    activeSessionId,
  } = useBrowserStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeTab = activeSession?.tabs.find((t) => t.active);
  const currentTabId = tabId || activeTab?.id;

  // Get latest screenshot for current tab
  const latestScreenshot = screenshots
    .filter((s) => s.tabId === currentTabId)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  useEffect(() => {
    // Auto-start streaming when tab is active
    if (currentTabId && !isStreaming) {
      startStreaming(currentTabId);
    }

    // Cleanup on unmount
    return () => {
      if (isStreaming) {
        stopStreaming();
      }
    };
  }, [currentTabId, isStreaming, startStreaming, stopStreaming]);

  const toggleStreaming = () => {
    if (isStreaming) {
      stopStreaming();
    } else if (currentTabId) {
      startStreaming(currentTabId);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const toggleFullscreen = () => {
    if (!isFullscreen && containerRef.current) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col h-full bg-background border border-border rounded-lg overflow-hidden',
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleStreaming}
            className={cn(isStreaming && 'text-green-600')}
          >
            {isStreaming ? (
              <>
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Resume
              </>
            )}
          </Button>

          <div className="h-4 w-px bg-border" />

          <Button variant="ghost" size="sm" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[60px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="sm" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="sm" onClick={handleResetView}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {isStreaming && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-green-600 animate-pulse" />
              Live
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Viewport */}
      <div
        className="flex-1 relative overflow-hidden bg-muted/5 cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {latestScreenshot ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center',
              transition: isPanning ? 'none' : 'transform 0.2s ease-out',
            }}
          >
            <img
              ref={imageRef}
              src={`data:image/png;base64,${latestScreenshot.data}`}
              alt="Browser screenshot"
              className="max-w-full max-h-full object-contain pointer-events-none"
              draggable={false}
            />

            {/* Element highlight overlay */}
            {highlightedElement && (
              <div
                className="absolute border-2 border-yellow-400 bg-yellow-400/10 pointer-events-none animate-pulse"
                style={{
                  left: highlightedElement.x,
                  top: highlightedElement.y,
                  width: highlightedElement.width,
                  height: highlightedElement.height,
                }}
              >
                <div className="absolute -top-6 left-0 bg-yellow-400 text-black text-xs px-2 py-1 rounded">
                  Target Element
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <div className="text-sm">No screenshot available</div>
              {!isStreaming && currentTabId && (
                <Button variant="default" size="sm" onClick={toggleStreaming}>
                  <Play className="h-4 w-4 mr-2" />
                  Start Live View
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-muted/10 text-xs text-muted-foreground">
        <div>
          {latestScreenshot && (
            <span>
              Last updated:{' '}
              {new Date(latestScreenshot.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div>
          {screenshots.length > 0 && (
            <span>{screenshots.length} screenshot(s) in history</span>
          )}
        </div>
      </div>
    </div>
  );
}

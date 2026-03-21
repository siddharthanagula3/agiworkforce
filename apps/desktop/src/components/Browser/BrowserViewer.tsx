import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
  ArrowLeft,
  ArrowRight,
  Globe,
  Copy,
  Search,
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
    goBack,
    goForward,
    reloadTab,
    navigateTab,
    getUrl,
    getTitle,
  } = useBrowserStore(
    useShallow((s) => ({
      screenshots: s.screenshots,
      highlightedElement: s.highlightedElement,
      isStreaming: s.isStreaming,
      startStreaming: s.startStreaming,
      stopStreaming: s.stopStreaming,
      sessions: s.sessions,
      activeSessionId: s.activeSessionId,
      goBack: s.goBack,
      goForward: s.goForward,
      reloadTab: s.reloadTab,
      navigateTab: s.navigateTab,
      getUrl: s.getUrl,
      getTitle: s.getTitle,
    })),
  );

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  } | null>(null);
  const [urlBarValue, setUrlBarValue] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeTab = activeSession?.tabs.find((t) => t.active);
  const currentTabId = tabId || activeTab?.id;

  const latestScreenshot = screenshots
    .filter((s) => s.tabId === currentTabId)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  // Sync URL bar with active tab
  useEffect(() => {
    if (activeTab) {
      setUrlBarValue(activeTab.url);
    }
  }, [activeTab?.url, activeTab]);

  // Fetch real title from backend when tab changes
  useEffect(() => {
    if (!currentTabId) return;
    let cancelled = false;

    async function fetchTitle() {
      try {
        const title = await getTitle(currentTabId);
        if (!cancelled) {
          setPageTitle(title);
        }
      } catch {
        // Non-critical: title is cosmetic
      }
    }

    fetchTitle();
    return () => {
      cancelled = true;
    };
  }, [currentTabId, getTitle]);

  const updateImageDims = useCallback(() => {
    if (imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      setImageDims({
        width: rect.width,
        height: rect.height,
        naturalWidth: imageRef.current.naturalWidth,
        naturalHeight: imageRef.current.naturalHeight,
      });
    }
  }, []);

  useEffect(() => {
    if (currentTabId && !isStreaming) {
      startStreaming(currentTabId);
    }

    const observer = new ResizeObserver(updateImageDims);
    const containerEl = containerRef.current;
    if (containerEl) observer.observe(containerEl);

    return () => {
      if (isStreaming) {
        stopStreaming();
      }
      observer.disconnect();
    };
  }, [currentTabId, isStreaming, startStreaming, stopStreaming, updateImageDims]);

  // Calculate scaled bounds for the highlight overlay
  const scaledBounds = useMemo(() => {
    if (!highlightedElement || !imageDims || imageDims.naturalWidth === 0) return null;

    const scaleX = imageDims.width / imageDims.naturalWidth;
    const scaleY = imageDims.height / imageDims.naturalHeight;

    return {
      x: highlightedElement.x * scaleX,
      y: highlightedElement.y * scaleY,
      width: highlightedElement.width * scaleX,
      height: highlightedElement.height * scaleY,
    };
  }, [highlightedElement, imageDims]);

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

  const handleGoBack = async () => {
    if (!currentTabId) return;
    try {
      await goBack(currentTabId);
    } catch (error) {
      console.error('Navigation back failed:', error);
    }
  };

  const handleGoForward = async () => {
    if (!currentTabId) return;
    try {
      await goForward(currentTabId);
    } catch (error) {
      console.error('Navigation forward failed:', error);
    }
  };

  const handleReload = async () => {
    if (!currentTabId) return;
    try {
      await reloadTab(currentTabId);
    } catch (error) {
      console.error('Reload failed:', error);
    }
  };

  const handleNavigate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTabId || !urlBarValue.trim() || isNavigating) return;

    let targetUrl = urlBarValue.trim();
    // Auto-prefix https:// if no protocol
    if (!/^https?:\/\//i.test(targetUrl)) {
      // If it looks like a domain (has a dot), add protocol
      if (targetUrl.includes('.')) {
        targetUrl = `https://${targetUrl}`;
      } else {
        // Otherwise treat as search (navigate to a search URL)
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
      }
    }

    setIsNavigating(true);
    try {
      await navigateTab(currentTabId, targetUrl);
      setUrlBarValue(targetUrl);

      // Refresh the URL from backend after navigation settles
      try {
        const realUrl = await getUrl(currentTabId);
        setUrlBarValue(realUrl);
      } catch {
        // Non-critical
      }
    } catch (error) {
      console.error('Navigation failed:', error);
    } finally {
      setIsNavigating(false);
    }
  };

  const handleCopyUrl = () => {
    if (urlBarValue) {
      navigator.clipboard.writeText(urlBarValue);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col h-full bg-background border border-border rounded-lg overflow-hidden',
        className,
      )}
    >
      {/* Navigation bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-muted/10">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoBack}
            disabled={!currentTabId}
            className="h-7 w-7 p-0"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoForward}
            disabled={!currentTabId}
            className="h-7 w-7 p-0"
            title="Forward"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReload}
            disabled={!currentTabId}
            className="h-7 w-7 p-0"
            title="Reload"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isNavigating && 'animate-spin')} />
          </Button>
        </div>

        {/* URL bar */}
        <form onSubmit={handleNavigate} className="flex-1 flex items-center gap-1">
          <div className="flex-1 relative">
            <Globe className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={urlInputRef}
              type="text"
              value={urlBarValue}
              onChange={(e) => setUrlBarValue(e.target.value)}
              placeholder="Enter URL or search..."
              disabled={!currentTabId}
              className="w-full h-7 pl-7 pr-8 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
              title="Copy URL"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={!currentTabId || isNavigating}
            className="h-7 w-7 p-0"
            title="Go"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>

      {/* Viewer controls toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-muted/5">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleStreaming}
            className={cn('h-7', isStreaming && 'text-green-600')}
          >
            {isStreaming ? (
              <>
                <Pause className="h-3.5 w-3.5 mr-1" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1" />
                Resume
              </>
            )}
          </Button>

          <div className="h-4 w-px bg-border" />

          <Button variant="ghost" size="sm" onClick={handleZoomOut} className="h-7 w-7 p-0">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground min-w-[48px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="sm" onClick={handleZoomIn} className="h-7 w-7 p-0">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>

          <Button variant="ghost" size="sm" onClick={handleResetView} className="h-7 w-7 p-0">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {pageTitle && (
            <span
              className="text-xs text-muted-foreground truncate max-w-[200px]"
              title={pageTitle}
            >
              {pageTitle}
            </span>
          )}

          {isStreaming && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-green-600 animate-pulse" />
              Live
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={toggleFullscreen} className="h-7 w-7 p-0">
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Screenshot viewport */}
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
            <div className="relative inline-block">
              <img
                ref={imageRef}
                src={`data:image/png;base64,${latestScreenshot.data}`}
                alt="Browser screenshot"
                className="max-w-full max-h-full object-contain pointer-events-none"
                draggable={false}
                onLoad={updateImageDims}
              />

              {/* Highlight Overlay - scaled to rendered image size */}
              {scaledBounds && (
                <div
                  className="absolute border-2 border-yellow-400 bg-yellow-400/10 pointer-events-none animate-pulse z-10"
                  style={{
                    left: scaledBounds.x,
                    top: scaledBounds.y,
                    width: scaledBounds.width,
                    height: scaledBounds.height,
                  }}
                >
                  <div className="absolute -top-6 left-0 bg-yellow-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                    Target Element
                  </div>
                </div>
              )}
            </div>
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
            <span>Last updated: {new Date(latestScreenshot.timestamp).toLocaleTimeString()}</span>
          )}
        </div>
        <div>
          {screenshots.length > 0 && <span>{screenshots.length} screenshot(s) in history</span>}
        </div>
      </div>
    </div>
  );
}

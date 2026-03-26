import { useState, useRef, useCallback } from 'react';
import { Monitor, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useComputerUseStore } from '../../stores/computerUseStore';
import { useBrowserStore } from '../../stores/browserStore';
import { useExecutionSidecarStore } from '../../stores/executionSidecarStore';
import { ComputerUseOverlay } from './ComputerUseOverlay';

export function ExecutionSidecarScreenView() {
  const [isExpanded, setIsExpanded] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const computerUseActive = useComputerUseStore((s) => s.isActive);
  const computerUseScreenshot = useComputerUseStore((s) => s.currentScreenshot);
  const actionLog = useComputerUseStore((s) => s.actionLog);
  const screenWidth = useComputerUseStore((s) => s.screenWidth);
  const screenHeight = useComputerUseStore((s) => s.screenHeight);

  // Derive last action from action log for overlay positioning
  const lastAction = actionLog.length > 0 ? actionLog[actionLog.length - 1] : undefined;

  const handleImageLoad = useCallback(() => {
    if (imageContainerRef.current) {
      setContainerSize({
        width: imageContainerRef.current.clientWidth,
        height: imageContainerRef.current.clientHeight,
      });
    }
  }, []);

  const browserSessions = useBrowserStore((s) => s.sessions);
  const browserScreenshots = useBrowserStore((s) => s.screenshots);
  const latestBrowserScreenshot = browserScreenshots[browserScreenshots.length - 1];

  const filmstripScreenshots = useExecutionSidecarStore((s) => s.filmstripScreenshots);
  const latestFilmstrip = filmstripScreenshots[filmstripScreenshots.length - 1];

  // Determine which image to show, in priority order
  const imageData =
    computerUseActive && computerUseScreenshot
      ? `data:image/png;base64,${computerUseScreenshot}`
      : latestBrowserScreenshot?.data
        ? `data:image/png;base64,${latestBrowserScreenshot.data}`
        : (latestFilmstrip?.url ?? null);

  const sourceLabel =
    computerUseActive && computerUseScreenshot
      ? 'Computer Use'
      : latestBrowserScreenshot?.data
        ? 'Browser Capture'
        : latestFilmstrip?.url
          ? 'Screenshot'
          : null;

  const hasBrowserSession = browserSessions.length > 0;

  if (!imageData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 text-xs gap-2 px-4">
        <Monitor className="w-5 h-5" />
        <span>No active screen capture</span>
        {hasBrowserSession && (
          <span className="text-[10px]">Browser session active but no screenshots taken</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Source label and controls */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
        <span className="text-[10px] text-muted-foreground font-medium">{sourceLabel}</span>
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          aria-label={isExpanded ? 'Collapse view' : 'Expand view'}
        >
          {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </button>
      </div>

      {/* Image display with computer use overlay */}
      <div
        ref={imageContainerRef}
        className={cn(
          'relative flex-1 overflow-auto flex items-center justify-center p-2 bg-black/20',
          isExpanded && 'p-0',
        )}
      >
        <img
          src={imageData}
          alt={sourceLabel ?? 'Screen capture'}
          className={cn(
            'rounded border border-white/10 object-contain',
            isExpanded ? 'w-full h-full' : 'max-w-full max-h-full',
          )}
          onLoad={handleImageLoad}
        />
        {computerUseActive && lastAction && containerSize.width > 0 && (
          <ComputerUseOverlay
            lastAction={{
              type: lastAction.action_type,
              x: lastAction.coordinates?.[0],
              y: lastAction.coordinates?.[1],
              text: lastAction.text ?? undefined,
            }}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            displayWidth={screenWidth ?? 1920}
            displayHeight={screenHeight ?? 1080}
          />
        )}
      </div>
    </div>
  );
}

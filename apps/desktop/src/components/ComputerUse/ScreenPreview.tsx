import { useEffect, useRef } from 'react';
import { Monitor } from 'lucide-react';
import {
  useComputerUseStore,
  selectCurrentScreenshot,
  selectIsActive,
  selectScreenDimensions,
  selectLastClickPosition,
} from '../../stores/computerUseStore';
import { cn } from '../../lib/utils';

export function ScreenPreview() {
  const screenshot = useComputerUseStore(selectCurrentScreenshot);
  const isActive = useComputerUseStore(selectIsActive);
  const dimensions = useComputerUseStore(selectScreenDimensions);
  const lastClick = useComputerUseStore(selectLastClickPosition);
  const captureScreen = useComputerUseStore((s) => s.captureScreen);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh every 2s when session is active
  useEffect(() => {
    if (isActive) {
      captureScreen();
      intervalRef.current = setInterval(() => {
        captureScreen();
      }, 2000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, captureScreen]);

  if (!screenshot) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-900/50 rounded-lg border border-zinc-800">
        <Monitor className="w-12 h-12 text-zinc-600 mb-3" />
        <p className="text-sm text-zinc-500 font-medium">No active session</p>
        <p className="text-xs text-zinc-600 mt-1">Start a session to see the live screen</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden rounded-lg border border-zinc-800 bg-black">
      <img
        src={`data:image/png;base64,${screenshot}`}
        alt="Screen capture"
        className="w-full h-full object-contain"
        draggable={false}
      />

      {/* Last click position overlay */}
      {lastClick && dimensions.width && dimensions.height && containerRef.current && (
        <ClickIndicator
          x={lastClick[0]}
          y={lastClick[1]}
          screenWidth={dimensions.width}
          screenHeight={dimensions.height}
          containerWidth={containerRef.current.clientWidth}
          containerHeight={containerRef.current.clientHeight}
        />
      )}

      {/* Resolution + status badge */}
      <div className="absolute bottom-2 right-2 flex items-center gap-2">
        {dimensions.width && dimensions.height && (
          <span className="px-2 py-0.5 bg-black/70 text-zinc-400 text-xs rounded-md backdrop-blur-sm">
            {dimensions.width} x {dimensions.height}
          </span>
        )}
        {isActive && (
          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-md backdrop-blur-sm flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        )}
      </div>
    </div>
  );
}

function ClickIndicator({
  x,
  y,
  screenWidth,
  screenHeight,
  containerWidth,
  containerHeight,
}: {
  x: number;
  y: number;
  screenWidth: number;
  screenHeight: number;
  containerWidth: number;
  containerHeight: number;
}) {
  // Calculate the position relative to the container, accounting for object-contain
  const screenAspect = screenWidth / screenHeight;
  const containerAspect = containerWidth / containerHeight;

  let renderWidth: number;
  let renderHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (screenAspect > containerAspect) {
    renderWidth = containerWidth;
    renderHeight = containerWidth / screenAspect;
    offsetX = 0;
    offsetY = (containerHeight - renderHeight) / 2;
  } else {
    renderHeight = containerHeight;
    renderWidth = containerHeight * screenAspect;
    offsetX = (containerWidth - renderWidth) / 2;
    offsetY = 0;
  }

  const displayX = offsetX + (x / screenWidth) * renderWidth;
  const displayY = offsetY + (y / screenHeight) * renderHeight;

  return (
    <div
      className={cn(
        'absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none',
        'rounded-full border-2 border-red-500',
        'animate-ping',
      )}
      style={{ left: displayX, top: displayY }}
    />
  );
}

/**
 * ComputerUseOverlay
 *
 * Renders action indicators over the screenshot in the ExecutionSidecar
 * when a computer use session is active. Coordinates are scaled from
 * display space to container space for accurate positioning.
 */
import { Keyboard, ArrowUp, ArrowDown, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComputerUseOverlayProps {
  lastAction?: {
    type: string;
    x?: number;
    y?: number;
    text?: string;
  };
  containerWidth: number;
  containerHeight: number;
  displayWidth: number;
  displayHeight: number;
}

function scaleCoordinates(
  x: number,
  y: number,
  displayWidth: number,
  displayHeight: number,
  containerWidth: number,
  containerHeight: number,
): { scaledX: number; scaledY: number } {
  return {
    scaledX: (x / displayWidth) * containerWidth,
    scaledY: (y / displayHeight) * containerHeight,
  };
}

function ClickIndicator({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      {/* Ping ring */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-red-500 animate-ping" />
      </div>
      {/* Solid center dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
      </div>
    </div>
  );
}

function TypeIndicator({ x, y }: { x: number; y: number }) {
  return (
    <div
      className={cn(
        'absolute pointer-events-none flex items-center gap-1 rounded bg-black/70 px-1.5 py-1',
        'animate-in fade-in duration-300',
      )}
      style={{ left: x + 12, top: y - 12, transform: 'translate(0, -50%)' }}
    >
      <Keyboard className="h-3 w-3 text-blue-400" />
      <span className="text-[10px] text-blue-300">typing</span>
    </div>
  );
}

function ScrollIndicator({ x, y, direction }: { x: number; y: number; direction: 'up' | 'down' }) {
  const Icon = direction === 'up' ? ArrowUp : ArrowDown;
  return (
    <div
      className="absolute pointer-events-none flex items-center justify-center"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      <div className="rounded-full bg-black/60 p-1">
        <Icon className="h-4 w-4 text-white" />
      </div>
    </div>
  );
}

function MoveIndicator({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      <Crosshair className="h-5 w-5 text-white/70" />
    </div>
  );
}

export function ComputerUseOverlay({
  lastAction,
  containerWidth,
  containerHeight,
  displayWidth,
  displayHeight,
}: ComputerUseOverlayProps) {
  if (!lastAction) {
    return null;
  }

  // Screenshot actions have no visual overlay
  if (lastAction.type === 'screenshot') {
    return null;
  }

  // If there are no coordinates, we cannot position an indicator
  if (lastAction.x === undefined || lastAction.y === undefined) {
    return null;
  }

  // Guard against zero-size displays to avoid division by zero
  if (displayWidth <= 0 || displayHeight <= 0) {
    return null;
  }

  const { scaledX, scaledY } = scaleCoordinates(
    lastAction.x,
    lastAction.y,
    displayWidth,
    displayHeight,
    containerWidth,
    containerHeight,
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {lastAction.type === 'click' && <ClickIndicator x={scaledX} y={scaledY} />}
      {lastAction.type === 'type' && <TypeIndicator x={scaledX} y={scaledY} />}
      {lastAction.type === 'scroll' && (
        <ScrollIndicator x={scaledX} y={scaledY} direction="down" />
      )}
      {lastAction.type === 'scroll_up' && (
        <ScrollIndicator x={scaledX} y={scaledY} direction="up" />
      )}
      {lastAction.type === 'scroll_down' && (
        <ScrollIndicator x={scaledX} y={scaledY} direction="down" />
      )}
      {lastAction.type === 'move' && <MoveIndicator x={scaledX} y={scaledY} />}
    </div>
  );
}

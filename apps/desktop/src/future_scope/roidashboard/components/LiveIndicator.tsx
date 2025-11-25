/**
 * LiveIndicator Component
 * Shows connection status and last update time
 */

import { formatDistanceToNow } from 'date-fns';
import { cn } from '../../lib/utils';

interface LiveIndicatorProps {
  connected: boolean;
  lastUpdate: number;
  updateCount?: number;
}

export function LiveIndicator({ connected, lastUpdate, updateCount }: LiveIndicatorProps) {
  const formatRelativeTime = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    return formatDistanceToNow(timestamp, { addSuffix: true });
  };

  return (
    <div className="flex items-center gap-4 mb-6 px-1">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'h-2 w-2 rounded-full transition-colors',
            connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          )}
        />
        <span className="text-sm font-medium text-muted-foreground">
          {connected ? 'Live updates active' : 'Reconnecting...'}
        </span>
      </div>

      {lastUpdate > 0 && (
        <>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs text-muted-foreground">
            Last update: {formatRelativeTime(lastUpdate)}
          </span>
        </>
      )}

      {updateCount !== undefined && updateCount > 0 && (
        <>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs text-muted-foreground">{updateCount} updates today</span>
        </>
      )}
    </div>
  );
}

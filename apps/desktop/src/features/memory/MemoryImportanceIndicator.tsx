/**
 * MemoryImportanceIndicator Component
 *
 * Displays the importance level of a memory with visual indicators including:
 * - Star rating (1-10)
 * - Decay timeline
 * - Last access date
 * - Importance trend
 *
 * Useful for understanding memory freshness and relevance.
 */
import { memo } from 'react';
import { Star, TrendingDown, TrendingUp, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';

export interface MemoryImportanceIndicatorProps {
  /** Importance level (1-10) */
  importance: number;
  /** Date memory was created */
  createdAt: string;
  /** Date memory was last accessed or updated */
  lastAccessedAt?: string;
  /** Show decay warning if memory hasn't been accessed */
  showDecayWarning?: boolean;
  /** Decay decay threshold in days */
  decayThresholdDays?: number;
  /** Size of the indicator (small, medium, large) */
  size?: 'sm' | 'md' | 'lg';
  /** Show trend indicator */
  showTrend?: boolean;
  /** Whether this is in a compact view */
  compact?: boolean;
}

/**
 * Get color for importance level
 */
function getImportanceColor(importance: number): string {
  if (importance >= 9) return 'text-red-400';
  if (importance >= 7) return 'text-orange-400';
  if (importance >= 5) return 'text-yellow-400';
  if (importance >= 3) return 'text-blue-400';
  return 'text-zinc-400';
}

/**
 * Get background color for importance level
 */
function getImportanceBgColor(importance: number): string {
  if (importance >= 9) return 'bg-red-500/10';
  if (importance >= 7) return 'bg-orange-500/10';
  if (importance >= 5) return 'bg-yellow-500/10';
  if (importance >= 3) return 'bg-blue-500/10';
  return 'bg-zinc-800/50';
}

/**
 * Calculate days since last access
 */
function getDaysSinceAccess(dateString: string): number {
  const lastAccess = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - lastAccess.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if memory is decaying
 */
function isMemoryDecaying(lastAccess: string, threshold: number): boolean {
  return getDaysSinceAccess(lastAccess) >= threshold;
}

export const MemoryImportanceIndicator = memo(function MemoryImportanceIndicator({
  importance,
  createdAt,
  lastAccessedAt,
  showDecayWarning = true,
  decayThresholdDays = 30,
  size = 'md',
  showTrend = false,
  compact = false,
}: MemoryImportanceIndicatorProps) {
  const lastAccess = lastAccessedAt || createdAt;
  const daysSinceAccess = getDaysSinceAccess(lastAccess);
  const isDecaying = isMemoryDecaying(lastAccess, decayThresholdDays);

  const starSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  const importanceColor = getImportanceColor(importance);
  const bgColor = getImportanceBgColor(importance);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
            <Star
              key={value}
              className={cn(
                starSize,
                value <= importance
                  ? `fill-yellow-400 ${importanceColor}`
                  : 'fill-transparent text-zinc-600',
              )}
            />
          ))}
        </div>
        {isDecaying && showDecayWarning && (
          <div className="h-2 w-2 rounded-full bg-orange-500" title="Memory may be decaying" />
        )}
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg p-3', bgColor, 'border border-zinc-700')}>
      {/* Importance Stars */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <Star
                key={value}
                className={cn(
                  starSize,
                  value <= importance
                    ? `fill-yellow-400 ${importanceColor}`
                    : 'fill-transparent text-zinc-600',
                )}
              />
            ))}
          </div>
          <span className={cn('text-sm font-medium', importanceColor)}>{importance}/10</span>
        </div>

        {showTrend && isDecaying && (
          <div title="Memory importance declining">
            <TrendingDown className="h-4 w-4 text-orange-400" />
          </div>
        )}
        {showTrend && !isDecaying && (
          <div title="Memory importance stable">
            <TrendingUp className="h-4 w-4 text-green-400" />
          </div>
        )}
      </div>

      {/* Timeline Information */}
      <div className="space-y-2 text-sm">
        {/* Created Date */}
        <div className="flex items-center gap-2 text-zinc-400">
          <Clock className="h-3 w-3 flex-shrink-0" />
          <span className="text-xs">Created {formatRelativeTime(new Date(createdAt))}</span>
        </div>

        {/* Last Access */}
        <div className="flex items-center gap-2 text-zinc-400">
          <Clock className="h-3 w-3 flex-shrink-0" />
          <span className="text-xs">
            Last accessed {daysSinceAccess === 0 ? 'today' : `${daysSinceAccess}d ago`}
          </span>
        </div>

        {/* Decay Warning */}
        {isDecaying && showDecayWarning && (
          <div className="mt-2 p-2 rounded bg-orange-500/10 border border-orange-500/30">
            <p className="text-xs text-orange-300">
              This memory hasn't been accessed in {daysSinceAccess} days and may be decaying. Access
              it to refresh its importance.
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Compact version for inline display
 */
export const CompactMemoryImportanceIndicator = memo(function CompactMemoryImportanceIndicator({
  importance,
  lastAccessedAt,
  createdAt,
  showDecayWarning = true,
  decayThresholdDays = 30,
}: Omit<MemoryImportanceIndicatorProps, 'size' | 'compact'>) {
  return (
    <MemoryImportanceIndicator
      importance={importance}
      createdAt={createdAt}
      lastAccessedAt={lastAccessedAt}
      showDecayWarning={showDecayWarning}
      decayThresholdDays={decayThresholdDays}
      size="sm"
      compact
    />
  );
});

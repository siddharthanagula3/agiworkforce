/**
 * TimeoutWarningBanner Component
 *
 * A compact banner that displays when a task is approaching timeout.
 * Shows remaining time and quick action buttons.
 */
import { useMemo, type FC } from 'react';
import { AlertTriangle, Clock, Zap, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export interface TimeoutWarningBannerProps {
  taskName: string;
  remainingSeconds: number;
  maxTimeoutMinutes: number;
  onExtend?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Format remaining time in human-readable format
 */
function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return 'Time expired';

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
}

/**
 * Get visual urgency level based on remaining time
 */
function getUrgencyLevel(seconds: number): 'critical' | 'warning' | 'info' {
  if (seconds <= 300) return 'critical'; // < 5 minutes
  if (seconds <= 1800) return 'warning'; // < 30 minutes
  return 'info';
}

/**
 * Get colors based on urgency
 */
function getColors(urgency: 'critical' | 'warning' | 'info') {
  switch (urgency) {
    case 'critical':
      return {
        bg: 'bg-red-950/40',
        border: 'border-red-500/50',
        icon: 'text-red-400',
        text: 'text-red-200',
      };
    case 'warning':
      return {
        bg: 'bg-yellow-950/40',
        border: 'border-yellow-500/50',
        icon: 'text-yellow-400',
        text: 'text-yellow-200',
      };
    default:
      return {
        bg: 'bg-blue-950/40',
        border: 'border-blue-500/50',
        icon: 'text-blue-400',
        text: 'text-blue-200',
      };
  }
}

export const TimeoutWarningBanner: FC<TimeoutWarningBannerProps> = ({
  taskName,
  remainingSeconds,
  maxTimeoutMinutes,
  onExtend,
  onDismiss,
  className,
}) => {
  const urgency = useMemo(() => getUrgencyLevel(remainingSeconds), [remainingSeconds]);
  const colors = useMemo(() => getColors(urgency), [urgency]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'border rounded-lg p-3 flex items-center gap-3',
        colors.bg,
        colors.border,
        className,
      )}
    >
      {/* Icon */}
      <AlertTriangle className={cn('h-4 w-4 flex-shrink-0', colors.icon)} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className={cn('text-sm font-medium', colors.text)}>Task timeout approaching</p>
          <Badge variant="secondary" className="text-xs">
            {taskName}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Clock className="h-3 w-3" />
          <span>{formatRemainingTime(remainingSeconds)} remaining</span>
          <span className="text-zinc-600">({maxTimeoutMinutes}m max)</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {onExtend && (
          <Button
            onClick={onExtend}
            size="xs"
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
          >
            <Zap className="h-3 w-3" />
            Extend
          </Button>
        )}
        {onDismiss && (
          <Button
            onClick={onDismiss}
            size="xs"
            variant="ghost"
            className="text-zinc-400 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </motion.div>
  );
};

export default TimeoutWarningBanner;

/**
 * TimeoutWarningDialog Component
 *
 * Displays a timeout warning when a background task is approaching its timeout limit.
 * Provides options to extend the timeout, continue, pause, or abort the task.
 */
import { useState, useCallback, useMemo, type FC } from 'react';
import { AlertTriangle, Clock, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '../../lib/tauri-mock';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import { toast } from '../../hooks/useToast';
import { getSimpleErrorMessage } from '../../lib/errorMessages';

export interface TimeoutWarningData {
  taskId: string;
  taskName: string;
  remainingSeconds: number;
  maxTimeoutMinutes: number;
  executedSteps: number;
  totalEstimatedSteps?: number;
  currentStep?: string;
}

interface TimeoutWarningDialogProps {
  warning: TimeoutWarningData | null;
  onDismiss: () => void;
  isOpen: boolean;
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
 * Get progress color based on urgency
 */
function getProgressColor(urgency: 'critical' | 'warning' | 'info'): string {
  switch (urgency) {
    case 'critical':
      return 'bg-red-500';
    case 'warning':
      return 'bg-yellow-500';
    default:
      return 'bg-blue-500';
  }
}

/**
 * Get badge variant based on urgency
 */
function getBadgeVariant(
  urgency: 'critical' | 'warning' | 'info',
): 'default' | 'destructive' | 'secondary' {
  switch (urgency) {
    case 'critical':
      return 'destructive';
    case 'warning':
      return 'secondary';
    default:
      return 'default';
  }
}

export const TimeoutWarningDialog: FC<TimeoutWarningDialogProps> = ({
  warning,
  onDismiss,
  isOpen,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'extend' | 'pause' | 'abort' | null>(null);

  // Calculate urgency level and progress percentage
  const urgency = useMemo(
    () => (warning ? getUrgencyLevel(warning.remainingSeconds) : 'info'),
    [warning],
  );

  const progressPercent = useMemo(() => {
    if (!warning) return 0;
    const max = warning.maxTimeoutMinutes * 60;
    return Math.min(100, (warning.remainingSeconds / max) * 100);
  }, [warning]);

  /**
   * Handle extending timeout by 30 minutes
   */
  const handleExtendTimeout = useCallback(async () => {
    if (!warning) return;

    setIsLoading(true);
    setSelectedAction('extend');

    try {
      await invoke<void>('agi_extend_timeout', {
        taskId: warning.taskId,
        additionalMinutes: 30,
      });

      toast({
        title: 'Timeout extended',
        description: 'Task timeout has been extended by 30 minutes.',
      });

      onDismiss();
    } catch (error) {
      const errorMessage = getSimpleErrorMessage(error);
      console.error('[TimeoutWarningDialog] Failed to extend timeout:', errorMessage);

      toast({
        variant: 'destructive',
        title: 'Failed to extend timeout',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
      setSelectedAction(null);
    }
  }, [warning, onDismiss]);

  /**
   * Handle pausing the task
   */
  const handlePauseTask = useCallback(async () => {
    if (!warning) return;

    setIsLoading(true);
    setSelectedAction('pause');

    try {
      await invoke<void>('agi_pause_task', {
        taskId: warning.taskId,
      });

      toast({
        title: 'Task paused',
        description: 'The task has been paused. You can resume it later.',
      });

      onDismiss();
    } catch (error) {
      const errorMessage = getSimpleErrorMessage(error);
      console.error('[TimeoutWarningDialog] Failed to pause task:', errorMessage);

      toast({
        variant: 'destructive',
        title: 'Failed to pause task',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
      setSelectedAction(null);
    }
  }, [warning, onDismiss]);

  /**
   * Handle aborting the task
   */
  const handleAbortTask = useCallback(async () => {
    if (!warning) return;

    // Confirm abort
    const shouldAbort = confirm(
      `Are you sure you want to abort "${warning.taskName}"? This action cannot be undone.`,
    );

    if (!shouldAbort) return;

    setIsLoading(true);
    setSelectedAction('abort');

    try {
      await invoke<void>('agi_abort_task', {
        taskId: warning.taskId,
      });

      toast({
        title: 'Task aborted',
        description: 'The task has been cancelled.',
        variant: 'destructive',
      });

      onDismiss();
    } catch (error) {
      const errorMessage = getSimpleErrorMessage(error);
      console.error('[TimeoutWarningDialog] Failed to abort task:', errorMessage);

      toast({
        variant: 'destructive',
        title: 'Failed to abort task',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
      setSelectedAction(null);
    }
  }, [warning, onDismiss]);

  /**
   * Handle continuing without action (dismiss warning)
   */
  const handleContinue = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  if (!warning || !isOpen) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="timeout-warning"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      >
        <motion.div
          className={cn(
            'relative w-full max-w-md rounded-lg border shadow-2xl',
            urgency === 'critical'
              ? 'border-red-500/50 bg-red-950/10'
              : urgency === 'warning'
                ? 'border-yellow-500/50 bg-yellow-950/10'
                : 'border-blue-500/50 bg-blue-950/10',
          )}
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-200 transition-colors"
            aria-label="Close dialog"
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </button>

          <div className="p-6">
            {/* Header with icon and title */}
            <div className="flex items-start gap-4 mb-4">
              <div
                className={cn(
                  'rounded-lg p-2',
                  urgency === 'critical'
                    ? 'bg-red-500/20'
                    : urgency === 'warning'
                      ? 'bg-yellow-500/20'
                      : 'bg-blue-500/20',
                )}
              >
                <AlertTriangle
                  className={cn(
                    'h-6 w-6',
                    urgency === 'critical'
                      ? 'text-red-500'
                      : urgency === 'warning'
                        ? 'text-yellow-500'
                        : 'text-blue-500',
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-zinc-100 mb-1">
                  {urgency === 'critical'
                    ? 'Time Running Out'
                    : urgency === 'warning'
                      ? 'Timeout Approaching'
                      : 'Timeout Notice'}
                </h2>
                <p className="text-sm text-zinc-400 truncate">Task: {warning.taskName}</p>
              </div>
            </div>

            {/* Task info */}
            <div className="space-y-3 mb-6">
              {/* Remaining time display */}
              <div className="rounded-lg bg-zinc-800/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-zinc-400" />
                    <span className="text-zinc-300">Remaining time</span>
                  </div>
                  <Badge
                    variant={getBadgeVariant(urgency)}
                    className="text-lg font-mono font-semibold"
                  >
                    {formatRemainingTime(warning.remainingSeconds)}
                  </Badge>
                </div>

                {/* Progress bar */}
                <div className="relative h-2 rounded-full bg-zinc-700/50 overflow-hidden">
                  <motion.div
                    className={cn('h-full rounded-full', getProgressColor(urgency))}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Task progress info */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-zinc-800/50 p-2">
                  <p className="text-zinc-400 mb-0.5">Executed Steps</p>
                  <p className="text-base font-semibold text-zinc-100">
                    {warning.executedSteps}
                    {warning.totalEstimatedSteps && ` / ${warning.totalEstimatedSteps}`}
                  </p>
                </div>

                <div className="rounded-lg bg-zinc-800/50 p-2">
                  <p className="text-zinc-400 mb-0.5">Max Timeout</p>
                  <p className="text-base font-semibold text-zinc-100">
                    {warning.maxTimeoutMinutes}m
                  </p>
                </div>
              </div>

              {/* Current step info */}
              {warning.currentStep && (
                <div className="rounded-lg bg-zinc-800/50 p-2.5">
                  <p className="text-xs text-zinc-400 mb-1">Current step</p>
                  <p className="text-sm text-zinc-100 truncate">{warning.currentStep}</p>
                </div>
              )}
            </div>

            {/* Warning message */}
            <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-3 mb-6">
              <p className="text-sm text-zinc-300">
                {urgency === 'critical'
                  ? 'Your task is about to timeout. Extend the timeout or save your progress.'
                  : 'Your task is approaching its timeout limit. Consider extending the timeout if more time is needed.'}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {/* Primary: Extend button */}
              <Button
                onClick={handleExtendTimeout}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Extend Timeout (+30m)
              </Button>

              {/* Secondary row: Pause and Abort */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={handlePauseTask}
                  disabled={isLoading || selectedAction === 'extend' || selectedAction === 'abort'}
                  variant="outline"
                  className="w-full"
                >
                  Pause
                </Button>
                <Button
                  onClick={handleAbortTask}
                  disabled={isLoading}
                  variant="ghost"
                  className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/20"
                >
                  Abort
                </Button>
              </div>

              {/* Tertiary: Continue button */}
              <Button
                onClick={handleContinue}
                disabled={isLoading}
                variant="ghost"
                className="w-full text-zinc-400 hover:text-zinc-200"
              >
                Continue
              </Button>
            </div>

            {/* Loading indicator for actions */}
            {isLoading && (
              <div className="absolute inset-0 rounded-lg bg-black/20 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TimeoutWarningDialog;

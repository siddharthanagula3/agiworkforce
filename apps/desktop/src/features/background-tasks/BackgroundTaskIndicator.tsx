import { useState, useCallback } from 'react';
import { Loader2, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useBackgroundTasks } from '../../hooks/useBackgroundTasks';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/Popover';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { BackgroundTasksPanel } from './BackgroundTasksPanel';

interface BackgroundTaskIndicatorProps {
  className?: string;
  popoverSide?: 'top' | 'right' | 'bottom' | 'left';
  popoverAlign?: 'start' | 'center' | 'end';
  panelMaxHeight?: string;
  showWhenEmpty?: boolean;
  compact?: boolean;
}

export function BackgroundTaskIndicator({
  className,
  popoverSide = 'bottom',
  popoverAlign = 'end',
  panelMaxHeight = '400px',
  showWhenEmpty = false,
  compact = false,
}: BackgroundTaskIndicatorProps) {
  const { activeCount, activeTasks, isLoading } = useBackgroundTasks();
  const [isOpen, setIsOpen] = useState(false);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (activeCount === 0 && !showWhenEmpty) {
    return null;
  }

  const hasRunningTask = activeTasks.some((t) => t.status === 'running');

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'xs' : 'sm'}
          className={cn(
            'relative gap-1.5 transition-colors',
            activeCount > 0
              ? 'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
            className,
          )}
          aria-label={`${activeCount} background tasks${activeCount === 1 ? '' : ''}`}
        >
          {/* Icon with animation for running tasks */}
          {hasRunningTask ? (
            <Loader2 className={cn('h-4 w-4', hasRunningTask && 'animate-spin')} />
          ) : (
            <Activity className="h-4 w-4" />
          )}

          {/* Count badge */}
          {activeCount > 0 && (
            <Badge
              variant="default"
              className={cn(
                'h-5 min-w-[20px] px-1.5 text-xs font-semibold',
                hasRunningTask ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-500 hover:bg-gray-600',
              )}
            >
              {activeCount}
            </Badge>
          )}

          {/* Label for non-compact mode */}
          {!compact && activeCount > 0 && (
            <span className="hidden sm:inline text-xs">{activeCount === 1 ? 'Task' : 'Tasks'}</span>
          )}

          {/* Loading indicator overlay */}
          {isLoading && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side={popoverSide}
        align={popoverAlign}
        className="w-80 p-0 border-0 shadow-xl"
        sideOffset={8}
      >
        <BackgroundTasksPanel onClose={handleClose} maxHeight={panelMaxHeight} />
      </PopoverContent>
    </Popover>
  );
}

export default BackgroundTaskIndicator;

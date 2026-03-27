import { Activity, Loader2, PanelRightOpen } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { cn } from '@/lib/utils';
import { useUnifiedChatStore } from '@/stores/unified/unifiedChatStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { BackgroundTasksPanel } from './BackgroundTasksPanel';

interface BackgroundTaskIndicatorProps {
  className?: string;
  popoverSide?: 'top' | 'right' | 'bottom' | 'left';
  popoverAlign?: 'start' | 'center' | 'end';
  panelMaxHeight?: string;
  showWhenEmpty?: boolean;
  compact?: boolean;
}

const ACTIVE_ACTION_TYPES = new Set(['thinking', 'searching', 'coding', 'running']);

export function BackgroundTaskIndicator({
  className,
  popoverSide = 'bottom',
  popoverAlign = 'end',
  panelMaxHeight = '400px',
  showWhenEmpty = false,
  compact = false,
}: BackgroundTaskIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { backgroundTasks, actionTrail, openSidecar } = useUnifiedChatStore(
    useShallow((state) => ({
      backgroundTasks: state.backgroundTasks,
      actionTrail: state.actionTrail,
      openSidecar: state.openSidecar,
    })),
  );

  const activeTaskCount = useMemo(
    () =>
      backgroundTasks.filter(
        (task) => task.status === 'running' || task.status === 'queued' || task.status === 'paused',
      ).length,
    [backgroundTasks],
  );
  const liveActionCount = useMemo(
    () => actionTrail.filter((entry) => ACTIVE_ACTION_TYPES.has(entry.type)).length,
    [actionTrail],
  );
  const activeCount = activeTaskCount + liveActionCount;
  const hasRunningWork = activeCount > 0;

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  if (!showWhenEmpty && activeCount === 0) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? 'xs' : 'sm'}
          className={cn(
            'relative gap-1.5 rounded-full border border-border/50 bg-background/60 backdrop-blur-sm',
            hasRunningWork
              ? 'text-primary hover:bg-primary/10 hover:text-primary'
              : 'text-muted-foreground hover:text-foreground',
            className,
          )}
          aria-label={`${activeCount} live activity items`}
        >
          {hasRunningWork ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Activity className="h-4 w-4" />
          )}

          <Badge
            variant={hasRunningWork ? 'default' : 'outline'}
            className={cn(
              'h-5 min-w-[20px] px-1.5 text-[11px] font-semibold tabular-nums',
              !hasRunningWork && 'text-muted-foreground',
            )}
          >
            {activeCount}
          </Badge>

          {!compact ? (
            <span className="hidden text-xs sm:inline">{hasRunningWork ? 'Activity' : 'Idle'}</span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side={popoverSide}
        align={popoverAlign}
        className="w-[420px] max-w-[calc(100vw-2rem)] border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur-xl"
        sideOffset={10}
      >
        <BackgroundTasksPanel onClose={handleClose} maxHeight={panelMaxHeight} />
        <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-surface-elevated/60 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            Open the full side panel to monitor longer runs.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              openSidecar('tasks');
              setIsOpen(false);
            }}
            className="gap-1.5"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
            Open panel
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { BackgroundTasksPanel } from './BackgroundTasksPanel';

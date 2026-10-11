'use client';

import { useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@agiworkforce/ui';
import type { Message } from '@shared/stores/web-chat-store';
import { cn } from '@shared/lib/utils';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { TASK_DOCK_OUTPUTS_LABEL } from '../../lib/agi-work';
import { OutputsList, useTaskDockSummary } from './OutputsList';

const SHOW_PANEL_ACTION = 'Show the artifacts panel';

/**
 * Claude's Outputs button: a file icon and the count of what this chat made,
 * opening a popover of thumbnails and file cards. Until the chat has made
 * something it shows `fallback` instead.
 */
export function OutputsPopoverButton({
  messages,
  fallback = null,
}: {
  messages: Message[];
  fallback?: ReactNode;
}) {
  const summary = useTaskDockSummary(messages);
  const setPanelOpen = useArtifactsStore((state) => state.setPanelOpen);
  const [open, setOpen] = useState(false);
  const count = summary.outputs.length;
  if (count === 0) return <>{fallback}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open
              ? 'bg-[var(--chat-surface-hover)] text-foreground'
              : 'text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground',
          )}
          aria-label={`${TASK_DOCK_OUTPUTS_LABEL}, ${count}`}
          title={TASK_DOCK_OUTPUTS_LABEL}
          data-testid="outputs-button"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          <span className="tabular-nums">{count}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        aria-label={TASK_DOCK_OUTPUTS_LABEL}
      >
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <h2 className="text-sm font-medium text-foreground">{TASK_DOCK_OUTPUTS_LABEL}</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        </div>
        <div className="max-h-[min(60vh,32rem)] overflow-y-auto px-3 pb-3 [scrollbar-width:thin]">
          <OutputsList outputs={summary.outputs} onOpened={() => setOpen(false)} />
        </div>
        <div className="border-t border-[var(--chat-border)] p-1.5">
          <button
            type="button"
            onClick={() => {
              setPanelOpen(true);
              setOpen(false);
            }}
            className="flex min-h-11 w-full items-center justify-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
          >
            {SHOW_PANEL_ACTION}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

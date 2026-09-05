'use client';

import { useEffect } from 'react';
import { X } from '@agiworkforce/icons';
import { AgentActivityTimeline } from '@agiworkforce/unified-chat';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

const LABEL = {
  panel: 'Activity',
  close: 'Close the activity panel',
  empty: 'This reply came back with nothing to trace.',
} as const;

const ESCAPE = 'Escape';

export interface VoiceActivityPanelProps {
  open: boolean;
  activity: AgentActivityState | null;
  onClose: () => void;
}

export function VoiceActivityPanel({ open, activity, onClose }: VoiceActivityPanelProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ESCAPE) return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      aria-label={LABEL.panel}
      data-testid="voice-activity-panel"
      className="flex w-[290px] shrink-0 flex-col overflow-hidden border-l border-[var(--chat-border-subtle)] bg-[var(--chat-surface-base)]"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--chat-border-subtle)] px-4">
        <h2 className="text-sm font-semibold text-[var(--chat-text-primary)]">{LABEL.panel}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={LABEL.close}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activity ? (
          <AgentActivityTimeline activity={activity} defaultExpanded />
        ) : (
          <p className="text-sm text-[var(--chat-text-muted)]">{LABEL.empty}</p>
        )}
      </div>
    </aside>
  );
}

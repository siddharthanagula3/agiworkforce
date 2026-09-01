'use client';

import React from 'react';
import type { Icon } from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';

export type TranscriptNoticeTone = 'danger' | 'neutral';
export type TranscriptNoticeSurface = 'framed' | 'bare';

export interface TranscriptNoticeAction {
  label: string;
  ariaLabel: string;
  icon?: Icon;
  onClick: () => void;
}

export interface TranscriptNoticeProps {
  icon: Icon;
  message: React.ReactNode;
  tone?: TranscriptNoticeTone;
  surface?: TranscriptNoticeSurface;
  action?: TranscriptNoticeAction;
  actionSlot?: React.ReactNode;
  role?: 'status' | 'alert';
  className?: string;
}

const SURFACE_CLASSES: Record<TranscriptNoticeSurface, string> = {
  framed: 'rounded-lg border px-3 py-1.5 text-xs',
  bare: 'text-sm',
};

const SURFACE_ICON_CLASSES: Record<TranscriptNoticeSurface, string> = {
  framed: 'h-3.5 w-3.5',
  bare: 'h-4 w-4',
};

const TONE_FRAME_CLASSES: Record<TranscriptNoticeTone, string> = {
  danger: 'border-destructive/30 bg-destructive/5',
  neutral: 'border-border/60 bg-muted/40',
};

const TONE_ICON_CLASSES: Record<TranscriptNoticeTone, string> = {
  danger: 'text-danger',
  neutral: '',
};

export function TranscriptNotice({
  icon: Icon,
  message,
  tone = 'neutral',
  surface = 'framed',
  action,
  actionSlot,
  role,
  className,
}: TranscriptNoticeProps) {
  const ActionIcon = action?.icon;
  const hasTrailing = Boolean(action || actionSlot);
  const Container = hasTrailing ? 'div' : 'p';

  return (
    <Container
      role={role}
      className={cn(
        'flex items-center gap-2 text-muted-foreground',
        SURFACE_CLASSES[surface],
        surface === 'framed' && TONE_FRAME_CLASSES[tone],
        className,
      )}
    >
      <Icon
        className={cn('shrink-0', SURFACE_ICON_CLASSES[surface], TONE_ICON_CLASSES[tone])}
        aria-hidden="true"
      />
      <span>{message}</span>
      {hasTrailing && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actionSlot}
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="flex min-h-6 min-w-6 shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted"
              aria-label={action.ariaLabel}
            >
              {ActionIcon && <ActionIcon className="h-3 w-3" aria-hidden="true" />}
              {action.label}
            </button>
          )}
        </div>
      )}
    </Container>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { CircleAlert, Square, X } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import {
  DICTATION_STATUS,
  waveformBarPercent,
  type DictationStatus,
} from '@features/chat/lib/dictation-machine';
import { SendButton } from './SendButton';

const LABEL = {
  group: 'Voice dictation',
  cancel: 'Discard recording',
  dismiss: 'Dismiss voice input error',
  stop: 'Stop recording and edit the transcript',
  transcribing: 'Transcribing',
  retry: 'Try again',
} as const;

const KEY = {
  escape: 'Escape',
  enter: 'Enter',
} as const;

const ROUND_CONTROL_CLASS =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--chat-border-strong)] text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] disabled:cursor-not-allowed disabled:opacity-50';

const MIDDLE_CLASS = 'flex min-w-0 flex-1 items-center';

export interface DictationStripProps {
  status: DictationStatus;
  bars: readonly number[];
  error: string | null;
  reducedMotion: boolean;
  emptyState?: boolean;
  onCancel: () => void;
  onStop: () => void;
  onSend: () => void;
  onRetry: () => void;
}

export function DictationStrip({
  status,
  bars,
  error,
  reducedMotion,
  emptyState = false,
  onCancel,
  onStop,
  onSend,
  onRetry,
}: DictationStripProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const recording = status === DICTATION_STATUS.recording;
  const transcribing = status === DICTATION_STATUS.transcribing;
  const failed = status === DICTATION_STATUS.error;

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === KEY.escape) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== KEY.enter) return;
    if (event.target instanceof HTMLElement && event.target.closest('button')) return;
    event.preventDefault();
    if (recording) onSend();
  };

  return (
    <div
      ref={containerRef}
      data-testid="dictation-strip"
      data-status={status}
      role="group"
      aria-label={LABEL.group}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={cn(
        'chat-dictation-strip flex min-h-9 min-w-0 flex-row items-center gap-1 outline-none sm:gap-2',
        emptyState ? 'sm:min-h-10' : 'sm:min-h-9',
      )}
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label={failed ? LABEL.dismiss : LABEL.cancel}
        className={cn(ROUND_CONTROL_CLASS, 'sm:h-9 sm:w-9')}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      {recording && (
        <div className={MIDDLE_CLASS} aria-hidden="true">
          {reducedMotion ? (
            <span className="h-0.5 w-full rounded-full bg-[var(--chat-accent-primary)]" />
          ) : (
            <div className="flex h-6 w-full items-center justify-end gap-0.5 overflow-hidden">
              {bars.map((level, index) => (
                <span
                  key={index}
                  className="w-0.5 shrink-0 rounded-full bg-[var(--chat-accent-primary)]"
                  style={{ height: `${waveformBarPercent(level)}%` }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {transcribing && (
        <div
          role="progressbar"
          aria-label={LABEL.transcribing}
          aria-busy="true"
          className={cn(MIDDLE_CLASS, 'gap-2')}
        >
          <Spinner size="sm" />
          <span className="truncate text-sm text-[var(--chat-text-muted)]">
            {LABEL.transcribing}
          </span>
        </div>
      )}

      {failed && (
        <div role="alert" className={cn(MIDDLE_CLASS, 'gap-2')}>
          <CircleAlert
            className="h-4 w-4 shrink-0 text-[var(--chat-destructive-text)]"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1 truncate text-sm text-[var(--chat-destructive-text)]">
            {error}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-full px-2 py-1 text-sm font-medium text-[var(--chat-accent-primary-text)] transition-colors hover:bg-[var(--chat-surface-hover)]"
          >
            {LABEL.retry}
          </button>
        </div>
      )}

      {!failed && (
        <>
          <button
            type="button"
            onClick={onStop}
            disabled={!recording}
            aria-label={LABEL.stop}
            className={ROUND_CONTROL_CLASS}
          >
            <Square className="h-3 w-3" fill="currentColor" aria-hidden="true" />
          </button>

          <SendButton
            mode="send"
            hasContent
            disabled={!recording}
            onClick={onSend}
            className="shrink-0"
          />
        </>
      )}
    </div>
  );
}

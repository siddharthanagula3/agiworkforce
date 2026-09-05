'use client';

import { useCallback, useRef } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Mic, MicOff, Plus, X } from '@agiworkforce/icons';

import { cn } from '@shared/lib/utils';

const LABEL = {
  group: 'Voice mode composer',
  add: 'Open this chat panel',
  placeholder: 'Type',
  field: 'Type a message to send as a normal turn',
  mute: 'Turn off microphone',
  unmute: 'Turn on microphone',
  exit: 'Leave voice mode',
} as const;

const KEY = {
  escape: 'Escape',
  enter: 'Enter',
  space: ' ',
} as const;

const ROUND_CONTROL_CLASS =
  'flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors';

export interface VoiceComposerProps {
  value: string;
  muted: boolean;
  deviceName: string;
  dockOpen: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onToggleMute: () => void;
  onToggleDock: () => void;
  onExit: () => void;
}

export function VoiceComposer({
  value,
  muted,
  deviceName,
  dockOpen,
  onChange,
  onSubmit,
  onToggleMute,
  onToggleDock,
  onExit,
}: VoiceComposerProps) {
  const fieldRef = useRef<HTMLInputElement | null>(null);
  const micLabel = muted ? LABEL.unmute : LABEL.mute;
  const micTitle = deviceName ? `${micLabel}, ${deviceName}` : micLabel;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === KEY.escape) {
        event.preventDefault();
        onExit();
        return;
      }
      if (event.key === KEY.enter) {
        if (event.target !== fieldRef.current) return;
        event.preventDefault();
        onSubmit();
        return;
      }
      if (event.key !== KEY.space) return;
      if (event.target instanceof HTMLElement && event.target.closest('button')) return;
      if (value.trim()) return;
      event.preventDefault();
      onToggleMute();
    },
    [onExit, onSubmit, onToggleMute, value],
  );

  return (
    <div
      role="group"
      aria-label={LABEL.group}
      data-testid="voice-composer"
      onKeyDown={handleKeyDown}
      className="mx-auto flex w-full max-w-3xl flex-row items-center gap-2 rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-input-bg)] px-2 py-1.5"
    >
      <button
        type="button"
        onClick={onToggleDock}
        aria-label={LABEL.add}
        aria-expanded={dockOpen}
        className={cn(
          ROUND_CONTROL_CLASS,
          'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
        )}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>

      <input
        ref={fieldRef}
        type="text"
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        placeholder={LABEL.placeholder}
        aria-label={LABEL.field}
        data-testid="voice-composer-field"
        className="min-w-0 flex-1 bg-transparent px-1 text-base text-[var(--chat-text-primary)] outline-none placeholder:text-[var(--chat-text-placeholder)]"
      />

      <button
        type="button"
        onClick={onToggleMute}
        aria-label={micLabel}
        aria-pressed={muted}
        title={micTitle}
        data-testid="voice-mute-toggle"
        className={cn(
          ROUND_CONTROL_CLASS,
          muted
            ? 'bg-[var(--chat-destructive)] text-[var(--chat-destructive-on-fill)] hover:opacity-90'
            : 'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
        )}
      >
        {muted ? (
          <MicOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Mic className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        onClick={onExit}
        aria-label={LABEL.exit}
        data-testid="voice-exit-button"
        className={cn(
          ROUND_CONTROL_CLASS,
          'bg-[var(--chat-text-primary)] text-[var(--chat-bg)] hover:opacity-90',
        )}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

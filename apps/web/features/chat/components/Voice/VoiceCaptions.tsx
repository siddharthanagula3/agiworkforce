'use client';

import { cn } from '@shared/lib/utils';

import type { VoiceCaptionLine } from './voice-captions';

const LABEL = {
  region: 'Voice captions',
  waiting: 'Captions will appear here as soon as someone speaks.',
  you: 'You',
  assistant: 'Assistant',
} as const;

export interface VoiceCaptionsProps {
  lines: readonly VoiceCaptionLine[];
}

export function VoiceCaptions({ lines }: VoiceCaptionsProps) {
  return (
    // The same words reach the transcript, so the panel is a visual aid and
    // must not announce every partial a second time.
    <div
      role="log"
      aria-live="off"
      aria-label={LABEL.region}
      data-testid="voice-captions"
      className="mx-auto flex w-full max-w-3xl flex-col gap-1.5 px-3 text-center"
    >
      {lines.length === 0 ? (
        <p className="text-sm text-[var(--chat-text-muted)]">{LABEL.waiting}</p>
      ) : (
        lines.map((line) => (
          <p
            key={line.turnId}
            data-testid="voice-caption-line"
            data-role={line.role}
            data-final={line.final}
            className={cn(
              'text-balance text-base leading-6',
              line.role === 'assistant'
                ? 'text-[var(--chat-text-primary)]'
                : 'text-[var(--chat-text-secondary)]',
            )}
          >
            <span className="mr-2 text-sm font-medium text-[var(--chat-text-muted)]">
              {line.role === 'assistant' ? LABEL.assistant : LABEL.you}
            </span>
            {line.text}
          </p>
        ))
      )}
    </div>
  );
}

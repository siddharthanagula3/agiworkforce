'use client';

import { AudioLines } from '@agiworkforce/icons';

import { cn } from '@shared/lib/utils';

const LABEL = 'Start voice mode';

export interface VoiceEntryButtonProps {
  onStart: () => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceEntryButton({ onStart, disabled = false, className }: VoiceEntryButtonProps) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      data-testid="voice-entry-button"
      title={LABEL}
      aria-label={LABEL}
      className={cn(
        'flex h-8 min-h-0 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors sm:h-9 sm:w-9',
        'bg-[var(--chat-text-primary)] text-[var(--chat-bg)] hover:opacity-90',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <AudioLines className="h-4.5 w-4.5 sm:h-5 sm:w-5" aria-hidden="true" />
    </button>
  );
}

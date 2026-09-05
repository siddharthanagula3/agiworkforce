'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mic } from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';

const LABEL = {
  start: 'Start voice input',
  unsupported: 'Voice input not supported in this browser',
  unsupportedHint: 'Voice input is not supported in this browser. Try Chrome or Edge.',
} as const;

const UNSUPPORTED_HINT_MS = 3000;

interface VoiceInputButtonProps {
  onStart: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

function detectVoiceInputSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices) &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export function VoiceInputButton({
  onStart,
  active = false,
  disabled,
  className,
}: VoiceInputButtonProps) {
  const [showHint, setShowHint] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    setIsSupported(detectVoiceInputSupport());
  }, []);

  const handleClick = useCallback(() => {
    if (!isSupported) {
      setShowHint(true);
      setTimeout(() => setShowHint(false), UNSUPPORTED_HINT_MS);
      return;
    }
    onStart();
  }, [isSupported, onStart]);

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={isSupported ? LABEL.start : LABEL.unsupported}
        aria-pressed={active}
        className={cn(
          'relative flex h-8 w-8 touch-manipulation items-center justify-center rounded-full transition-all duration-150 sm:h-9 sm:w-9',
          'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          !isSupported && 'cursor-not-allowed opacity-40',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onMouseEnter={() => !isSupported && setShowHint(true)}
        onMouseLeave={() => setShowHint(false)}
      >
        <Mic className="h-4 w-4" aria-hidden="true" />
      </button>

      {showHint && (
        <div
          role="tooltip"
          className={cn(
            'absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2',
            'w-max max-w-[220px] rounded-lg border border-border bg-popover px-3 py-2',
            'text-center text-xs text-popover-foreground shadow-md',
          )}
        >
          {LABEL.unsupportedHint}
          <span
            className="absolute left-1/2 top-full block h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

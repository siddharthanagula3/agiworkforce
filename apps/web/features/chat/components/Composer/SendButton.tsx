'use client';

import { ArrowUp, Square, Clock } from 'lucide-react';
import { cn } from '@shared/lib/utils';

export type SendButtonMode = 'send' | 'stop' | 'queue';

interface SendButtonProps {
  mode: SendButtonMode;
  onClick: () => void;
  disabled?: boolean;
}

export function SendButton({ mode, onClick, disabled = false }: SendButtonProps) {
  if (mode === 'stop') {
    return (
      <button
        onClick={onClick}
        className="rounded-lg p-2 bg-red-500 text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-all duration-200"
        aria-label="Stop generation"
      >
        <Square className="h-4 w-4" />
      </button>
    );
  }

  if (mode === 'queue') {
    return (
      <button
        onClick={onClick}
        className="rounded-lg p-2 bg-amber-500 text-white hover:bg-amber-600 transition-all duration-200"
        aria-label="Queue message"
      >
        <Clock className="h-4 w-4" />
      </button>
    );
  }

  // send mode
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg p-2 transition-all duration-200',
        disabled
          ? 'cursor-not-allowed bg-muted text-muted-foreground'
          : 'bg-primary text-primary-foreground hover:bg-primary/90',
      )}
      aria-label="Send message"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}

'use client';

import { ArrowUp, Clock, Loader2, Square } from 'lucide-react';
import { cn } from '@shared/lib/utils';

export type SendButtonMode = 'send' | 'stop' | 'queue';

export interface SendButtonProps {
  mode: SendButtonMode;
  isSending?: boolean;
  hasContent?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}

export function SendButton({
  mode,
  isSending = false,
  hasContent = false,
  disabled = false,
  onClick,
  className,
}: SendButtonProps) {
  if (mode === 'stop') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'rounded-full p-2 bg-red-500 text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-all duration-200',
          className,
        )}
        title="Stop generation"
        aria-label="Stop the current response"
      >
        <Square className="h-4 w-4" fill="currentColor" aria-hidden="true" />
      </button>
    );
  }

  if (mode === 'queue') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'rounded-full p-2 transition-all duration-200',
          disabled
            ? 'bg-terra-cotta-500/50 text-white/70 cursor-not-allowed'
            : 'bg-terra-cotta-500 text-white hover:bg-terra-cotta-600 shadow-md',
          className,
        )}
        title="Queue message · will send after current response finishes"
        aria-label="Add message to queue"
      >
        <Clock className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  const canSend = hasContent && !disabled && !isSending;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canSend}
      className={cn(
        'rounded-full p-2 transition-all duration-200',
        canSend
          ? 'bg-terra-cotta-500 hover:bg-terra-cotta-600 text-white shadow-md'
          : 'bg-muted text-muted-foreground cursor-not-allowed',
        className,
      )}
      title={isSending ? 'Sending…' : 'Send message'}
      aria-label={isSending ? 'Sending message…' : 'Send message'}
    >
      {isSending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

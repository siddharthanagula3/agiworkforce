'use client';

/**
 * SendButton Component
 *
 * 3-state send/stop/queue button for the chat composer.
 * - send    (idle): terra-cotta-500, ArrowUp icon — submits the message
 * - stop    (generating): red-500, Square icon — aborts the SSE stream
 * - queue   (queued): amber-500, Clock icon — message will send after current finishes
 *
 * Mirrors the desktop SendButton in
 * apps/desktop/src/components/UnifiedAgenticChat/SendButton.tsx.
 */

import { ArrowUp, Clock, Loader2, Square } from 'lucide-react';
import { cn } from '@shared/lib/utils';

export type SendButtonMode = 'send' | 'stop' | 'queue';

export interface SendButtonProps {
  /** Which of the 3 states to render. */
  mode: SendButtonMode;
  /** True while the send action itself is in-flight (shows spinner in send mode). */
  isSending?: boolean;
  /** True when there is content to send; disables the send button when false. */
  hasContent?: boolean;
  /** Whether the button is disabled externally (e.g. quota exhausted). */
  disabled?: boolean;
  /** Unified click handler — caller decides action based on mode. */
  onClick: () => void;
}

export function SendButton({
  mode,
  isSending = false,
  hasContent = false,
  disabled = false,
  onClick,
}: SendButtonProps) {
  // ── Stop state ──────────────────────────────────────────────────────────────
  if (mode === 'stop') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg p-2 bg-red-500 text-white shadow-lg shadow-red-500/25 hover:bg-red-600 transition-all duration-200"
        title="Stop generation"
        aria-label="Stop the current response"
      >
        <Square className="h-4 w-4" fill="currentColor" aria-hidden="true" />
      </button>
    );
  }

  // ── Queue state ──────────────────────────────────────────────────────────────
  if (mode === 'queue') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'rounded-lg p-2 transition-all duration-200',
          disabled
            ? 'bg-amber-500/50 text-white/70 cursor-not-allowed'
            : 'bg-amber-500 text-white hover:bg-amber-600 shadow-md',
        )}
        title="Queue message — will send after current response finishes"
        aria-label="Add message to queue"
      >
        <Clock className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  // ── Send state (default) ─────────────────────────────────────────────────────
  const canSend = hasContent && !disabled && !isSending;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canSend}
      className={cn(
        'rounded-lg p-2 transition-all duration-200',
        canSend
          ? 'bg-terra-cotta-500 hover:bg-terra-cotta-600 text-white shadow-md'
          : 'bg-muted text-muted-foreground cursor-not-allowed',
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

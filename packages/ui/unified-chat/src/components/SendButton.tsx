/**
 * SendButton — shared 3-state send/stop/queue button for the chat composer.
 *
 * Visual + behavioral mirror of the web composer's SendButton
 * (apps/web/features/chat/components/Composer/SendButton.tsx) so the desktop
 * app — which renders this via the shared ChatInput — matches web pixel-for-pixel:
 *
 *   - send  (idle):       accent-primary (terra-cotta), ArrowUp · submits
 *   - stop  (streaming):  red-500, Square · aborts the active stream
 *   - queue (generating): amber-500, Clock · message sends after current finishes
 *
 * The `queue` mode is part of the shared API for parity with web, but is only
 * reachable on surfaces whose store models a "generating but queueable" state.
 * The desktop chat store exposes only `isStreaming`, so ChatInput computes
 * `isStreaming ? 'stop' : 'send'` and never fabricates `queue` there — an unused
 * mode is not a dead rendered control.
 *
 * Uses the shared `--chat-*` CSS tokens (NOT web's `--chat-bg-elevated` /
 * terra-cotta Tailwind color, which are not defined in this package's theme).
 */

import { ArrowUp, Clock, Loader2, Square } from 'lucide-react';
import { cn } from '../lib/utils';

export type SendButtonMode = 'send' | 'stop' | 'queue';

export interface SendButtonProps {
  /** Which of the 3 states to render. */
  mode: SendButtonMode;
  /** True while the send action itself is in-flight (shows spinner in send mode). */
  isSending?: boolean;
  /** True when there is content to send; disables the send button when false. */
  hasContent?: boolean;
  /** Whether the button is disabled externally (e.g. no model selected). */
  disabled?: boolean;
  /** Unified click handler · caller decides the action based on mode. */
  onClick: () => void;
  /** Optional extra class names forwarded to the root button element. */
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
  // ── Stop state ──────────────────────────────────────────────────────────
  if (mode === 'stop') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,box-shadow,opacity] duration-200',
          'bg-red-500 text-white shadow-lg shadow-red-500/25 hover:bg-red-600',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
          className,
        )}
        title="Stop generation"
        aria-label="Stop the current response"
      >
        <Square className="h-4 w-4" fill="currentColor" aria-hidden="true" />
      </button>
    );
  }

  // ── Queue state ─────────────────────────────────────────────────────────
  if (mode === 'queue') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,box-shadow,opacity] duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
          disabled
            ? 'bg-amber-500/50 text-white/70 cursor-not-allowed'
            : 'bg-amber-500 text-white shadow-md hover:bg-amber-600',
          className,
        )}
        title="Queue message · will send after the current response finishes"
        aria-label="Add message to queue"
      >
        <Clock className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  // ── Send state (default) ─────────────────────────────────────────────────
  const canSend = hasContent && !disabled && !isSending;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canSend}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,box-shadow,opacity] duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
        canSend
          ? 'bg-[var(--chat-accent-primary)] text-white shadow-md hover:opacity-80'
          : 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)] cursor-not-allowed',
        className,
      )}
      title={isSending ? 'Sending…' : 'Send message (Enter)'}
      aria-label={isSending ? 'Sending message…' : 'Send message (Enter)'}
    >
      {isSending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}

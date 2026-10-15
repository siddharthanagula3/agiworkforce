import { RotateCcw, X } from 'lucide-react';
import { useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import type { InterruptedTurn } from '../lib/runtime';

export interface InterruptedTurnNoticeProps {
  turn: InterruptedTurn;
  disabled?: boolean;
  onRetry: (turn: InterruptedTurn) => void;
  onDismiss: (turn: InterruptedTurn) => void;
  className?: string;
}

const ACTION_BUTTON = cn(
  'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium',
  'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

export function InterruptedTurnNotice({
  turn,
  disabled = false,
  onRetry,
  onDismiss,
  className,
}: InterruptedTurnNoticeProps) {
  const { t } = useUiTranslation('chat');
  return (
    <div
      role="status"
      className={cn(
        'mb-2 flex items-center gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-3 py-1.5',
        className,
      )}
    >
      <p className="min-w-0 flex-1 text-sm text-[var(--chat-text-secondary)]">
        {t('interrupted.message', 'The app closed before this reply finished.')}
      </p>
      <button
        type="button"
        className={ACTION_BUTTON}
        disabled={disabled}
        onClick={() => onRetry(turn)}
      >
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
        {t('interrupted.retry', 'Retry')}
      </button>
      <button
        type="button"
        className={cn(ACTION_BUTTON, 'w-7 justify-center px-0')}
        aria-label={t('interrupted.dismiss', 'Dismiss')}
        onClick={() => onDismiss(turn)}
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}


import { ArrowUp, Clock, Loader2, Square } from 'lucide-react';
import { useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../lib/utils';

export type SendButtonMode = 'send' | 'stop' | 'queue';

export interface SendButtonProps {
  mode: SendButtonMode;
  isSending?: boolean;
  hasContent?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  sendShortcutLabel?: string;
}

export function SendButton({
  mode,
  isSending = false,
  hasContent = false,
  disabled = false,
  onClick,
  className,
  sendShortcutLabel = 'Enter',
}: SendButtonProps) {
  const { t } = useUiTranslation('chat');

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
        title={t('composer.stopGeneration', 'Stop generation')}
        aria-label={t('composer.stopCurrentResponse', 'Stop the current response')}
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
          'flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,box-shadow,opacity] duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
          disabled
            ? 'bg-amber-500/50 text-white/70 cursor-not-allowed'
            : 'bg-amber-500 text-white shadow-md hover:bg-amber-600',
          className,
        )}
        title={t(
          'composer.queueHint',
          'Queue message · will send after the current response finishes',
        )}
        aria-label={t('composer.queueMessage', 'Add message to queue')}
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
        'flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,box-shadow,opacity] duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
        canSend
          ? 'bg-[var(--chat-accent-primary)] text-white shadow-md hover:opacity-80'
          : 'bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)] cursor-not-allowed',
        className,
      )}
      title={
        isSending
          ? t('composer.sending', 'Sending…')
          : t('composer.sendWithShortcut', 'Send message ({{shortcut}})', {
              shortcut: sendShortcutLabel,
            })
      }
      aria-label={
        isSending
          ? t('composer.sendingMessage', 'Sending message…')
          : t('composer.sendWithShortcut', 'Send message ({{shortcut}})', {
              shortcut: sendShortcutLabel,
            })
      }
    >
      {isSending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}

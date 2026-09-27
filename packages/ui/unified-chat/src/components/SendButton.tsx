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
          'flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,box-shadow,opacity] duration-quick',
          'bg-foreground text-background hover:bg-foreground/90',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
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
          'flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,box-shadow,opacity] duration-quick',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
          disabled
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-[var(--chat-accent-primary)] text-[var(--chat-accent-on-primary)] shadow-md hover:opacity-80',
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
        'flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,box-shadow,opacity] duration-quick',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
        canSend
          ? 'bg-[var(--chat-accent-primary)] text-[var(--chat-accent-on-primary)] shadow-md hover:opacity-80'
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

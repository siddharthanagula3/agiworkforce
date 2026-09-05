'use client';

import { ArrowUp, Clock, Square } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';

export type SendButtonMode = 'send' | 'stop' | 'queue';

export interface SendButtonProps {
  mode: SendButtonMode;
  isSending?: boolean;
  hasContent?: boolean;
  disabled?: boolean;
  /** Messages waiting for the running response to finish. */
  queuedCount?: number;
  onClick: () => void;
  className?: string;
}

const QUEUED_CHIP_LABEL = 'Queued';
const QUEUED_CHIP_CLASS =
  'shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium leading-none text-muted-foreground';

function SendControl({
  mode,
  isSending = false,
  hasContent = false,
  disabled = false,
  onClick,
  className,
}: Omit<SendButtonProps, 'queuedCount'>) {
  if (mode === 'stop') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'rounded-full p-2 bg-foreground text-background hover:bg-foreground/90 transition-all duration-200',
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
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
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
      {isSending ? <Spinner size="sm" /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

export function SendButton({ queuedCount = 0, ...control }: SendButtonProps) {
  if (queuedCount <= 0) return <SendControl {...control} />;
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className={QUEUED_CHIP_CLASS} data-testid="composer-queued-chip">
        {queuedCount > 1 ? `${QUEUED_CHIP_LABEL} ${queuedCount}` : QUEUED_CHIP_LABEL}
      </span>
      <SendControl {...control} />
    </span>
  );
}

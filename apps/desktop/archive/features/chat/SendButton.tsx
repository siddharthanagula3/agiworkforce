
import React from 'react';
import { Clock, Loader2, Send, Square } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SendButtonProps {
  showStopButton: boolean;
  isSending: boolean;
  isQueueMode: boolean;
  disabled?: boolean;
  hasContent: boolean;
  isSimpleMode?: boolean;
  onSend: () => void;
  onStop?: () => void;
}

export const SendButton: React.FC<SendButtonProps> = ({
  showStopButton,
  isSending,
  isQueueMode,
  disabled = false,
  hasContent,
  isSimpleMode = false,
  onSend,
  onStop,
}) => {
  if (showStopButton) {
    return (
      <button
        type="button"
        onClick={onStop}
        disabled={!onStop}
        className={cn(
          'p-2 rounded-lg transition-all duration-200',
          'bg-red-500 text-white',
          'shadow-lg shadow-red-500/25',
          onStop ? 'hover:bg-red-600' : 'opacity-50 cursor-not-allowed',
        )}
        title="Stop generation"
        aria-label="Stop the current response"
      >
        <Square size={16} fill="currentColor" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSend}
      disabled={isSending || disabled || !hasContent}
      className={cn(
        'p-2 rounded-lg transition-all duration-200',
        hasContent && !disabled
          ? isQueueMode
            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md'
            : 'bg-terra-cotta-500 hover:bg-terra-cotta-600 text-white shadow-md'
          : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed',
      )}
      title={
        isQueueMode
          ? isSimpleMode
            ? 'Your message will be sent after the current task finishes'
            : 'Queue message'
          : 'Send message'
      }
      aria-label={
        isSending ? 'Sending message...' : isQueueMode ? 'Add message to queue' : 'Send message'
      }
    >
      {isSending ? (
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      ) : isQueueMode ? (
        <Clock size={16} aria-hidden="true" />
      ) : (
        <Send size={16} aria-hidden="true" />
      )}
    </button>
  );
};

export default SendButton;

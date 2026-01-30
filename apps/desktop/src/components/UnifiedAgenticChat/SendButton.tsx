/**
 * SendButton Component
 *
 * Send/stop/queue button for the chat input.
 * Changes appearance based on input state and AI processing status.
 */

import React from 'react';
import { Clock, Loader2, Send, Square } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SendButtonProps {
  /** Whether to show the stop button instead */
  showStopButton: boolean;
  /** Whether currently sending */
  isSending: boolean;
  /** Whether in queue mode (AI is processing) */
  isQueueMode: boolean;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Whether there is content to send */
  hasContent: boolean;
  /** Whether in simple mode */
  isSimpleMode?: boolean;
  /** Callback when send is clicked */
  onSend: () => void;
  /** Callback when stop is clicked */
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
  if (showStopButton && onStop) {
    return (
      <button
        type="button"
        onClick={onStop}
        className={cn(
          'p-2 rounded-lg transition-all duration-200',
          'bg-red-500 hover:bg-red-600 text-white',
          'shadow-lg shadow-red-500/25 animate-pulse',
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
      disabled={disabled || !hasContent}
      className={cn(
        'p-2 rounded-lg transition-all duration-200',
        hasContent && !disabled
          ? isQueueMode
            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md'
            : 'bg-terra-cotta-500 hover:bg-terra-cotta-600 text-white shadow-md'
          : 'bg-gray-100 dark:bg-charcoal-700 text-gray-500 dark:text-gray-400 cursor-not-allowed',
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

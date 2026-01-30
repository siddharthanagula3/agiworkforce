/**
 * PendingMessagesIndicator Component
 *
 * Shows the count of pending messages waiting to be sent.
 */

import React from 'react';
import { Clock } from 'lucide-react';

export interface PendingMessagesIndicatorProps {
  /** Number of pending messages */
  count: number;
  /** Whether in simple mode */
  isSimpleMode?: boolean;
}

export const PendingMessagesIndicator: React.FC<PendingMessagesIndicatorProps> = ({
  count,
  isSimpleMode = false,
}) => {
  if (count === 0) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium"
      title={
        isSimpleMode
          ? `${count} message${count > 1 ? 's' : ''} waiting to send`
          : `${count} message(s) queued`
      }
    >
      <Clock size={12} />
      <span>{isSimpleMode ? `${count} waiting` : count}</span>
    </div>
  );
};

export default PendingMessagesIndicator;

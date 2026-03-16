/**
 * MessageHeader Component
 *
 * Displays message header with avatar, name, timestamp, role badge,
 * model info, and status indicators.
 */

import React, { memo, useMemo } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { EnhancedMessage } from '@/stores/unified/unifiedChatStore';
import { useSimpleModeStore } from '@/stores/unified/ui';
import { useUnifiedChatStore } from '@/stores/unified/unifiedChatStore';

export interface MessageHeaderProps {
  message: EnhancedMessage;
  isUser: boolean;
  isSystem: boolean;
  isAssistant: boolean;
  showTimestamp: boolean;
  formattedTime: string;
}

const MessageHeaderComponent: React.FC<MessageHeaderProps> = ({
  message,
  isUser,
  isSystem,
  isAssistant,
  showTimestamp,
  formattedTime,
}) => {
  const isSimpleMode = useSimpleModeStore((state) => state.mode === 'simple');

  // Get live status from action trail for streaming messages
  const actionTrail = useUnifiedChatStore((state) => state.actionTrail);
  const lastActionTrailEntry = actionTrail.length > 0 ? actionTrail[actionTrail.length - 1] : null;

  const roleName = useMemo(() => {
    if (isUser) return 'You';
    if (isSystem) return 'System';
    return 'Assistant';
  }, [isUser, isSystem]);

  return (
    <div className="flex items-center gap-2 mb-1 flex-wrap">
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{roleName}</span>

      {showTimestamp && <span className="message-meta">{formattedTime}</span>}

      {/* Edited indicator */}
      {message.metadata?.edited && (
        <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400 italic">
          <Pencil size={10} />
          edited
        </span>
      )}

      {/* Model badge for assistant messages */}
      {isAssistant && message.metadata?.model && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
          {message.metadata.model
            .split('/')
            .pop()
            ?.replace(/-/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase())
            .slice(0, 20) || message.metadata.model}
        </span>
      )}

      {/* Pending indicator */}
      {message.pending && (
        <span className="inline-flex items-center gap-1 message-meta text-zinc-500">
          <Loader2 size={12} className="animate-spin" />
          Sending...
        </span>
      )}

      {/* Error indicator */}
      {message.error && (
        <span className="inline-flex items-center gap-1 message-meta text-red-500">
          <span className="font-medium">Failed</span>
          <span className="text-zinc-500">- {message.error}</span>
        </span>
      )}

      {/* Streaming indicator with live status */}
      {message.metadata?.streaming && !message.pending && (
        <span className="inline-flex items-center gap-1.5 message-meta text-amber-500 dark:text-amber-400">
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-amber-400 animate-bounce"
                style={{ animationDelay: `${i * 0.1}s`, animationDuration: '0.6s' }}
              />
            ))}
          </span>
          <span className="text-xs">
            {lastActionTrailEntry?.message || (isSimpleMode ? 'Writing response...' : 'Generating')}
          </span>
        </span>
      )}
    </div>
  );
};

MessageHeaderComponent.displayName = 'MessageHeader';

export const MessageHeader = memo(MessageHeaderComponent);

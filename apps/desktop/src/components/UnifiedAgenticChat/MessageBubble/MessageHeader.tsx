/**
 * MessageHeader Component
 *
 * Displays message header with avatar, name, timestamp, role badge,
 * model info, and status indicators.
 */

import React, { memo, useMemo, useState, useCallback } from 'react';
import { AlertCircle, Loader2, Pencil, RotateCw } from 'lucide-react';
import { EnhancedMessage } from '../../../stores/unifiedChatStore';
import { useSimpleModeStore } from '../../../stores/ui';
import { useUnifiedChatStore } from '../../../stores/unifiedChatStore';
import { QuickAnswerToggle } from '../QuickAnswerToggle';

export interface MessageHeaderProps {
  message: EnhancedMessage;
  isUser: boolean;
  isSystem: boolean;
  isAssistant: boolean;
  showTimestamp: boolean;
  formattedTime: string;
  onRetry?: () => void;
}

const MessageHeaderComponent: React.FC<MessageHeaderProps> = ({
  message,
  isUser,
  isSystem,
  isAssistant,
  showTimestamp,
  formattedTime,
  onRetry,
}) => {
  const isSimpleMode = useSimpleModeStore((state) => state.mode === 'simple');

  // Quick answer toggle state — local to each message header instance
  const [isQuickMode, setIsQuickMode] = useState(false);
  const handleQuickToggle = useCallback((quickMode: boolean) => {
    setIsQuickMode(quickMode);
  }, []);

  // Determine whether this assistant message used extended thinking
  const hasThinking = useMemo(() => {
    if (!isAssistant) return false;
    const meta = message.metadata as Record<string, unknown> | undefined;
    if (!meta) return false;
    // Covers Anthropic thinking, DeepSeek <think>, and explicit reasoning type
    if (meta['thinking'] || meta['type'] === 'reasoning') return true;
    const content = message.content;
    return (
      /<thinking>/i.test(content) ||
      /<antthinking>/i.test(content) ||
      /<think>/i.test(content) ||
      /\[THINKING\]/i.test(content) ||
      /<reasoning>/i.test(content) ||
      /<cot>/i.test(content)
    );
  }, [isAssistant, message.metadata, message.content]);

  // BUG-334: Select only the last action trail entry instead of the entire array
  // to prevent all MessageHeaders from re-rendering on every trail update.
  const lastActionTrailEntry = useUnifiedChatStore((state) =>
    state.actionTrail.length > 0 ? state.actionTrail[state.actionTrail.length - 1] : null,
  );

  const roleName = useMemo(() => {
    if (isUser) return 'You';
    if (isSystem) return 'System';
    return 'Assistant';
  }, [isUser, isSystem]);

  return (
    <div className="flex items-center gap-2 mb-1 flex-wrap">
      <span className="text-sm font-medium text-foreground">{roleName}</span>

      {showTimestamp && <span className="message-meta text-muted-foreground">{formattedTime}</span>}

      {/* Edited indicator */}
      {message.metadata?.edited && (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground italic">
          <Pencil size={10} />
          edited
        </span>
      )}

      {/* Model badge for assistant messages */}
      {isAssistant && message.metadata?.model && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-medium text-muted-foreground border border-border">
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
        <span className="inline-flex items-center gap-1 message-meta text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Sending...
        </span>
      )}

      {/* Error indicator */}
      {message.error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 mt-1">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <span className="text-xs text-red-400 flex-1">
            <span className="font-medium">Failed</span>
            <span className="text-red-400/70 ml-1">— {message.error}</span>
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-colors"
              aria-label="Retry message"
            >
              <RotateCw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
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

      {/* Quick answer toggle — only on completed assistant messages with thinking */}
      {!message.metadata?.streaming && (
        <QuickAnswerToggle
          messageId={message.id}
          hasThinking={hasThinking}
          isQuickMode={isQuickMode}
          onToggle={handleQuickToggle}
        />
      )}
    </div>
  );
};

MessageHeaderComponent.displayName = 'MessageHeader';

export const MessageHeader = memo(MessageHeaderComponent);

'use client';

/**
 * ChatMessageList · upgraded web equivalent of the desktop ChatMessageList.
 *
 * Improvements over MessageListNew:
 * - Feeds from useAdaptedMessages() store adapter hook instead of raw props
 * - Smart auto-scroll: follows new content but pauses when user scrolls up
 * - Message grouping: consecutive messages from the same role share a visual group
 * - Streaming fingerprint tracking so scroll fires on content appends
 * - Stable memoized callbacks to prevent child re-renders
 *
 * Props interface is a superset of the old MessageListNew so the page component
 * can be migrated by swapping import + component name.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import type { WebChatMessageMetadata } from '../../types/message-metadata';
import type { PaywallFeature, RequiredTier } from '../InlinePaywallCard';
import type { ImageAspectRatio } from '../Composer/ChatComposerNew';
import { MessageBubble } from './MessageBubble';
import { InlinePaywallCard } from '../InlinePaywallCard';
import { TypingIndicator } from './TypingIndicator';
import { FollowUpSuggestions } from '../FollowUpSuggestions';
import { GreetingBanner } from '../GreetingBanner/GreetingBanner';
import { ChevronDown, ArrowRight, AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import {
  isMessageContinuable,
  hasStreamError,
  getStreamErrorMessage,
} from '../../lib/continue-generation';

/**
 * A safety refusal: the provider's safety layer stopped the response.
 * Reaches this surface as `metadata.finishReason` 'refusal' (the canonical
 * StreamChunkStop member, emitted on the legacy web wire as the literal
 * reason) or 'content_filter' (the OpenAI wire vocabulary on the
 * passthrough path). Distinct from streamError (transport/provider failure)
 * and from continuable truncation — it gets its own honest notice, never a
 * generic error and never a silent stop.
 */
function isRefusalFinish(message: ChatMessage | undefined | null): boolean {
  const reason = (message?.metadata as { finishReason?: unknown } | undefined)?.finishReason;
  return reason === 'refusal' || reason === 'content_filter';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessageListProps {
  /**
   * Messages to display. When omitted the component pulls from
   * useAdaptedMessages() · pass messages explicitly in tests or when the
   * parent already holds a filtered slice.
   */
  messages: ChatMessage[];
  isLoading?: boolean;
  onRegenerate?: (messageId: string) => void;
  /**
   * Continue Generation: called with the LAST assistant message's id when it
   * ended early (truncated at the token cap, or user-stopped with partial
   * text) and the user clicks the Continue button rendered below it. The
   * affordance only appears when this callback is provided AND the message is
   * continuable (metadata.finishReason 'length'/'max_tokens'/'stopped' with
   * non-empty content) — surfaces that don't opt in see no behavior change.
   */
  onContinue?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onReact?: (messageId: string, reactionType: 'up' | 'down' | null) => void;
  /** Called by ImageGenerationCard to re-generate in-place (aspect-ratio change / edit). */
  onRegenerateImage?: (
    messageId: string,
    opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
  ) => Promise<string>;
  /** Called when user selects a follow-up suggestion pill */
  onSendMessage?: (content: string) => void;
  /** When true, follow-up suggestion pills fade out (user is typing in the composer) */
  isUserTyping?: boolean;
  className?: string;
  /**
   * Called when the user clicks the Upgrade CTA on an inline paywall card.
   * Receives the message ID of the paywall slot. The handler opens the
   * upgrade plan dialog (real checkout) without navigating away from the chat.
   */
  onPaywallUpgrade?: (messageId: string) => void;
  /**
   * Called when the user clicks "Try later" on an inline paywall card.
   * Receives the message ID so the parent can remove or hide the slot.
   */
  onPaywallDismiss?: (messageId: string) => void;
}

/** A group of consecutive messages sharing the same role. */
interface MessageGroup {
  role: 'user' | 'assistant';
  messages: ChatMessage[];
  /** Index of first message in original array · used as React key. */
  firstId: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Groups consecutive messages from the same role.
 * System messages are treated as 'assistant' for display purposes.
 */
export function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  if (messages.length === 0) return [];

  const groups: MessageGroup[] = [];

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'user' : 'assistant';
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.role === role) {
      lastGroup.messages.push(msg);
    } else {
      groups.push({ role, messages: [msg], firstId: msg.id });
    }
  }

  return groups;
}

/**
 * Formats a date as a human-readable divider label.
 * - "Today" for today's date
 * - "Yesterday" for yesterday's date
 * - "Mar 18" for older dates
 */
export function formatDateDivider(date: Date, now: Date = new Date()): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (startOfDay.getTime() === startOfToday.getTime()) return 'Today';
  if (startOfDay.getTime() === startOfYesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for a Date, used as a grouping key.
 */
function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Date divider component
// ---------------------------------------------------------------------------

const DateDivider = memo(({ label }: { label: string }) => (
  <div
    className="flex items-center gap-3 px-4 py-3 md:px-12 lg:px-20"
    role="separator"
    aria-label={label}
  >
    <div className="h-px flex-1" style={{ backgroundColor: 'var(--chat-border-subtle)' }} />
    <span className="shrink-0 text-xs font-medium" style={{ color: 'var(--chat-text-secondary)' }}>
      {label}
    </span>
    <div className="h-px flex-1" style={{ backgroundColor: 'var(--chat-border-subtle)' }} />
  </div>
));
DateDivider.displayName = 'DateDivider';

// ---------------------------------------------------------------------------
// Scroll-to-bottom button
// ---------------------------------------------------------------------------

const ScrollToBottomButton = memo(({ onClick }: { onClick: () => void }) => (
  <motion.button
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    transition={{ duration: 0.15 }}
    onClick={onClick}
    className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-popover/95 shadow-md backdrop-blur-sm transition-colors hover:bg-muted"
    aria-label="Scroll to bottom"
  >
    <ChevronDown className="h-4 w-4 text-muted-foreground" />
  </motion.button>
));
ScrollToBottomButton.displayName = 'ScrollToBottomButton';

// ---------------------------------------------------------------------------
// Message group row
// ---------------------------------------------------------------------------

interface MessageGroupRowProps {
  group: MessageGroup;
  isLastGroup: boolean;
  onRegenerate?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReact?: (id: string, reactionType: 'up' | 'down' | null) => void;
  /** Called when a paywall Upgrade button is clicked. */
  onPaywallUpgrade?: (messageId: string) => void;
  /** Called when a paywall Try-later button is clicked. */
  onPaywallDismiss?: (messageId: string) => void;
  onRegenerateImage?: (
    messageId: string,
    opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
  ) => Promise<string>;
}

interface MessageRowProps {
  message: ChatMessage;
  onRegenerate?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReact?: (id: string, reactionType: 'up' | 'down' | null) => void;
  onPaywallUpgrade?: (messageId: string) => void;
  onPaywallDismiss?: (messageId: string) => void;
  onRegenerateImage?: (
    messageId: string,
    opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
  ) => Promise<string>;
}

// Per-message row component. Stable callbacks bound via useCallback below so
// React.memo on MessageBubble actually short-circuits when sibling messages
// stream or update.
/** Casts the generic metadata bag to the typed web-surface shape. */
function getMeta(msg: ChatMessage | undefined): WebChatMessageMetadata | undefined {
  return msg?.metadata as WebChatMessageMetadata | undefined;
}

const MessageRow = ({
  message,
  onRegenerate,
  onEdit,
  onDelete,
  onReact,
  onPaywallUpgrade,
  onPaywallDismiss,
  onRegenerateImage,
}: MessageRowProps) => {
  const meta = getMeta(message);
  const paywall = meta?.paywall;

  const handleRegenerate = useCallback(
    () => onRegenerate?.(message.id),
    [onRegenerate, message.id],
  );
  const handleDelete = useCallback(() => onDelete?.(message.id), [onDelete, message.id]);
  const handleEdit = useCallback(() => onEdit?.(message.id), [onEdit, message.id]);
  const handlePaywallUpgrade = useCallback(
    () => onPaywallUpgrade?.(message.id),
    [onPaywallUpgrade, message.id],
  );
  const handlePaywallDismiss = useCallback(
    () => onPaywallDismiss?.(message.id),
    [onPaywallDismiss, message.id],
  );
  const handleRegenerateImage = useCallback(
    (opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string }) =>
      onRegenerateImage!(message.id, opts),
    [onRegenerateImage, message.id],
  );

  if (paywall) {
    return (
      <InlinePaywallCard
        feature={paywall.feature as PaywallFeature}
        currentTier="free"
        requiredTier={paywall.requiredTier as RequiredTier}
        reason={paywall.reason}
        onUpgrade={handlePaywallUpgrade}
        onDismiss={handlePaywallDismiss}
      />
    );
  }

  const displayRole = message.role === 'system' ? 'assistant' : message.role;

  return (
    <MessageBubble
      message={{
        id: message.id,
        role: displayRole,
        content: message.content,
        timestamp: message.createdAt ? new Date(message.createdAt) : new Date(),
        isStreaming: message.isStreaming,
        metadata: message.metadata as Parameters<typeof MessageBubble>[0]['message']['metadata'],
      }}
      onRegenerate={onRegenerate && displayRole === 'assistant' ? handleRegenerate : undefined}
      onEdit={onEdit && displayRole === 'user' ? handleEdit : undefined}
      onDelete={onDelete ? handleDelete : undefined}
      onReact={onReact && displayRole === 'assistant' ? onReact : undefined}
      onRegenerateImage={onRegenerateImage ? handleRegenerateImage : undefined}
    />
  );
};

const MessageGroupRow = memo(
  ({
    group,
    isLastGroup: _isLastGroup,
    onRegenerate,
    onEdit,
    onDelete,
    onReact,
    onPaywallUpgrade,
    onPaywallDismiss,
    onRegenerateImage,
  }: MessageGroupRowProps) => {
    return (
      <div
        className={cn('message-group', group.role === 'user' ? 'user-group' : 'assistant-group')}
      >
        {group.messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            onRegenerate={onRegenerate}
            onEdit={onEdit}
            onDelete={onDelete}
            onReact={onReact}
            onPaywallUpgrade={onPaywallUpgrade}
            onPaywallDismiss={onPaywallDismiss}
            onRegenerateImage={onRegenerateImage}
          />
        ))}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.group.firstId === next.group.firstId &&
      prev.group.messages.length === next.group.messages.length &&
      prev.group.messages.every((prevMessage, index) => {
        const nextMessage = next.group.messages[index];
        if (!nextMessage) return false;
        const prevMeta = getMeta(prevMessage);
        const nextMeta = getMeta(nextMessage);
        return (
          prevMessage.id === nextMessage.id &&
          prevMessage.content === nextMessage.content &&
          prevMessage.isStreaming === nextMessage.isStreaming &&
          prevMeta?.thinkingContent === nextMeta?.thinkingContent &&
          prevMeta?.isThinkingStreaming === nextMeta?.isThinkingStreaming &&
          prevMeta?.reaction === nextMeta?.reaction &&
          prevMeta?.paywall === nextMeta?.paywall &&
          // Tool timeline: compare length + last entry status so tool-call
          // cards update visually as each tool starts/completes during streaming.
          prevMeta?.tools?.length === nextMeta?.tools?.length &&
          prevMeta?.tools?.[0]?.status === nextMeta?.tools?.[0]?.status &&
          prevMeta?.tools?.at(-1)?.status === nextMeta?.tools?.at(-1)?.status &&
          prevMeta?.isSearching === nextMeta?.isSearching &&
          prevMeta?.isExecutingCode === nextMeta?.isExecutingCode
        );
      }) &&
      prev.onRegenerate === next.onRegenerate &&
      prev.onEdit === next.onEdit &&
      prev.onDelete === next.onDelete &&
      prev.onReact === next.onReact &&
      prev.onPaywallUpgrade === next.onPaywallUpgrade &&
      prev.onPaywallDismiss === next.onPaywallDismiss &&
      prev.onRegenerateImage === next.onRegenerateImage
    );
  },
);
MessageGroupRow.displayName = 'MessageGroupRow';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SCROLL_THRESHOLD_PX = 120;

const ChatMessageListComponent = ({
  messages,
  isLoading,
  onRegenerate,
  onContinue,
  onEdit,
  onDelete,
  onReact,
  onRegenerateImage,
  onSendMessage,
  isUserTyping = false,
  className,
  onPaywallUpgrade,
  onPaywallDismiss,
}: ChatMessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /**
   * Whether auto-scroll is active. Disabled when the user manually scrolls
   * up; re-enabled when they scroll back to the bottom.
   */
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const groups = useMemo(() => groupMessages(messages), [messages]);

  const lastMessage = useMemo(() => messages[messages.length - 1], [messages]);

  /** Lightweight fingerprint · changes whenever streaming content grows. */
  const lastMessageFingerprint = useMemo(
    () => (lastMessage ? `${lastMessage.id}-${lastMessage.content.length}` : ''),
    [lastMessage],
  );

  const showTypingIndicator = isLoading && messages.length > 0 && !lastMessage?.isStreaming;

  /**
   * Continue Generation (ChatGPT/Claude parity): offered ONLY on the last
   * message, only when it is a continuable assistant turn (truncated or
   * user-stopped with partial text — see isMessageContinuable), and never
   * while a request is in flight. No fake availability.
   */
  const showContinue = Boolean(onContinue && !isLoading && isMessageContinuable(lastMessage));

  /**
   * Mid-stream provider failure (additive `x_stream_error` — see
   * hasStreamError's doc comment): the turn otherwise looks like a clean
   * completion, so this is the ONLY signal that tells the user their answer
   * may be cut off for a reason other than the model finishing normally.
   * Offered only on the last message, only once streaming has actually
   * stopped (unlike isMessageContinuable, hasStreamError does not check
   * isStreaming itself — it stays a pure metadata read — so this checks it
   * explicitly, same safety bar), and mutually exclusive with Continue (a
   * turn that failed mid-stream never lands on a continuable finish_reason
   * in practice, but guard explicitly rather than relying on that).
   */
  const showStreamErrorNotice = Boolean(
    onRegenerate &&
    !isLoading &&
    !lastMessage?.isStreaming &&
    !showContinue &&
    hasStreamError(lastMessage),
  );

  /**
   * Safety refusal notice (see isRefusalFinish): the provider declined to
   * finish the response. Shown on the last assistant message once streaming
   * has stopped; mutually exclusive with Continue and the stream-error
   * notice. Unlike the stream-error notice it does not require onRegenerate
   * — the honest "declined" state must render regardless; the Retry action
   * inside it is conditional.
   */
  const showRefusalNotice = Boolean(
    !isLoading &&
    !lastMessage?.isStreaming &&
    lastMessage?.role === 'assistant' &&
    !showContinue &&
    !showStreamErrorNotice &&
    isRefusalFinish(lastMessage),
  );

  /** Show follow-up suggestions when last message is a completed assistant reply */
  const showFollowUps =
    onSendMessage &&
    !isLoading &&
    lastMessage?.role === 'assistant' &&
    !lastMessage?.isStreaming &&
    lastMessage.content.length > 20;

  // ---------------------------------------------------------------------------
  // Scroll management
  // ---------------------------------------------------------------------------

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
  }, []);

  /** Detect when user scrolls away from the bottom. */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distanceFromBottom > SCROLL_THRESHOLD_PX);
  }, []);

  /** Auto-scroll when new messages/content arrive (respects user scroll). */
  useEffect(() => {
    if (!userScrolledUp) {
      scrollToBottom(messages.length === 1 ? 'instant' : 'smooth');
    }
  }, [messages.length, lastMessageFingerprint, isLoading, userScrolledUp, scrollToBottom]);

  // ---------------------------------------------------------------------------
  // Memoized callbacks
  // ---------------------------------------------------------------------------

  const handleRegenerate = useCallback((id: string) => onRegenerate?.(id), [onRegenerate]);

  const handleEdit = useCallback((id: string) => onEdit?.(id, ''), [onEdit]);

  const handleDelete = useCallback((id: string) => onDelete?.(id), [onDelete]);

  const handleReact = useCallback(
    (id: string, reactionType: 'up' | 'down' | null) => onReact?.(id, reactionType),
    [onReact],
  );

  const handlePaywallUpgrade = useCallback(
    (id: string) => onPaywallUpgrade?.(id),
    [onPaywallUpgrade],
  );

  const handlePaywallDismiss = useCallback(
    (id: string) => onPaywallDismiss?.(id),
    [onPaywallDismiss],
  );

  const handleRegenerateImage = useCallback(
    (
      messageId: string,
      opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
    ) => onRegenerateImage!(messageId, opts),
    [onRegenerateImage],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (messages.length === 0 && !isLoading) {
    return (
      <div
        className={cn('relative flex h-full flex-col items-center justify-center', className)}
        data-testid="chat-message-list"
      >
        <GreetingBanner onSendMessage={onSendMessage} />
      </div>
    );
  }

  return (
    <div className={cn('relative flex h-full flex-col', className)} data-testid="chat-message-list">
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        onScroll={handleScroll}
        className="flex h-full flex-col overflow-y-auto scroll-smooth"
      >
        {/* Push messages to the bottom when list is short */}
        <div className="flex-1" />

        {/* Message groups */}
        <div className="space-y-0.5 pb-2">
          {groups.map((group, groupIdx) => {
            const firstMsg = group.messages[0];
            const firstMsgDate = firstMsg?.createdAt ? new Date(firstMsg.createdAt) : undefined;
            const groupDateKey = firstMsgDate ? toDateKey(firstMsgDate) : '';
            const prevGroup = groupIdx > 0 ? groups[groupIdx - 1] : null;
            const prevFirstMsg = prevGroup?.messages[0];
            const prevFirstMsgDate = prevFirstMsg?.createdAt
              ? new Date(prevFirstMsg.createdAt)
              : undefined;
            const prevDateKey = prevFirstMsgDate ? toDateKey(prevFirstMsgDate) : '';
            const showDivider = firstMsgDate && groupDateKey !== prevDateKey;

            return (
              <React.Fragment key={group.firstId}>
                {showDivider && <DateDivider label={formatDateDivider(firstMsgDate)} />}
                <MessageGroupRow
                  group={group}
                  isLastGroup={groupIdx === groups.length - 1}
                  onRegenerate={handleRegenerate}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onReact={handleReact}
                  onPaywallUpgrade={handlePaywallUpgrade}
                  onPaywallDismiss={handlePaywallDismiss}
                  onRegenerateImage={onRegenerateImage ? handleRegenerateImage : undefined}
                />
              </React.Fragment>
            );
          })}

          {/* Continue Generation button · below the truncated/stopped last
              assistant message (ChatGPT/Claude placement). */}
          {showContinue && lastMessage && (
            <div className="px-4 pt-1 md:px-12 lg:px-20">
              <button
                type="button"
                onClick={() => onContinue?.(lastMessage.id)}
                className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                aria-label="Continue generating this response"
              >
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                Continue generating
              </button>
            </div>
          )}

          {/* Mid-stream error notice · same placement as Continue Generation,
              below the last assistant message. The turn's partial content
              (if any) is left exactly as it streamed — this only ADDS a
              visible signal that it may be incomplete, it never replaces
              the message. */}
          {showStreamErrorNotice && lastMessage && (
            <div className="px-4 pt-1 md:px-12 lg:px-20">
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
                <span>
                  {getStreamErrorMessage(lastMessage)
                    ? `Response may be incomplete: ${getStreamErrorMessage(lastMessage)}`
                    : 'This response may be incomplete — the connection to the model was interrupted.'}
                </span>
                <button
                  type="button"
                  onClick={() => onRegenerate?.(lastMessage.id)}
                  className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted"
                  aria-label="Regenerate this response"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Safety refusal notice · same placement as the stream-error
              notice. Any partial content is left exactly as it streamed —
              this only ADDS the honest "declined" signal. Neutral styling on
              purpose: a refusal is not a failure of the app or the model. */}
          {showRefusalNotice && lastMessage && (
            <div className="px-4 pt-1 md:px-12 lg:px-20">
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>The model declined to finish this response for safety reasons.</span>
                {onRegenerate && (
                  <button
                    type="button"
                    onClick={() => onRegenerate(lastMessage.id)}
                    className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted"
                    aria-label="Regenerate this response"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Retry
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Typing indicator while waiting for the first streaming chunk */}
          <AnimatePresence>
            {showTypingIndicator && (
              <motion.div
                key="typing-indicator"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
              >
                <TypingIndicator />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Follow-up suggestion pills after last assistant message */}
          {showFollowUps && lastMessage && (
            <div className="px-4 md:px-12 lg:px-20">
              <FollowUpSuggestions
                lastAssistantContent={lastMessage.content}
                onSelect={onSendMessage!}
                isGenerating={isLoading}
                isUserTyping={isUserTyping}
                messageCount={messages.length}
              />
            </div>
          )}
        </div>

        {/* Sentinel for scrollIntoView */}
        <div ref={bottomRef} aria-hidden="true" className="h-px" />
      </div>

      {/* Scroll-to-bottom FAB · shown when user has scrolled up */}
      <AnimatePresence>
        {userScrolledUp && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <div className="pointer-events-auto">
              <ScrollToBottomButton onClick={() => scrollToBottom('smooth')} />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * ChatMessageList · upgraded web message list with auto-scroll, message
 * grouping, and streaming-aware rendering.
 *
 * Replaces `MessageListNew`. Compatible with the same props interface.
 */
export const ChatMessageList = memo(ChatMessageListComponent, (prev, next) => {
  return (
    prev.messages.length === next.messages.length &&
    prev.isLoading === next.isLoading &&
    prev.isUserTyping === next.isUserTyping &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onContinue === next.onContinue &&
    prev.onDelete === next.onDelete &&
    prev.onReact === next.onReact &&
    prev.onRegenerateImage === next.onRegenerateImage &&
    prev.onSendMessage === next.onSendMessage &&
    prev.className === next.className &&
    prev.onPaywallUpgrade === next.onPaywallUpgrade &&
    prev.onPaywallDismiss === next.onPaywallDismiss &&
    prev.messages.every((prevMessage, index) => {
      const nextMessage = next.messages[index];
      if (!nextMessage) return false;
      const prevMeta = getMeta(prevMessage);
      const nextMeta = getMeta(nextMessage);
      return (
        prevMessage.id === nextMessage.id &&
        prevMessage.content === nextMessage.content &&
        prevMessage.isStreaming === nextMessage.isStreaming &&
        prevMeta?.thinkingContent === nextMeta?.thinkingContent &&
        prevMeta?.isThinkingStreaming === nextMeta?.isThinkingStreaming &&
        prevMeta?.reaction === nextMeta?.reaction &&
        prevMeta?.paywall === nextMeta?.paywall &&
        // Continue affordance: a finishReason patch can arrive on its own store
        // update (after the isStreaming flip), so it must invalidate the memo.
        prevMeta?.finishReason === nextMeta?.finishReason &&
        // Stream-error notice: same "arrives via its own patch after isStreaming
        // flips" timing as finishReason above.
        prevMeta?.streamError === nextMeta?.streamError &&
        prevMeta?.tools?.length === nextMeta?.tools?.length &&
        prevMeta?.tools?.at(-1)?.status === nextMeta?.tools?.at(-1)?.status &&
        prevMeta?.isSearching === nextMeta?.isSearching &&
        prevMeta?.isExecutingCode === nextMeta?.isExecutingCode
      );
    })
  );
});

ChatMessageList.displayName = 'ChatMessageList';

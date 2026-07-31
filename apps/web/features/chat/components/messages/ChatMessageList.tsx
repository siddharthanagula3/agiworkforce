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
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  List,
  useDynamicRowHeight,
  type ListImperativeAPI,
  type RowComponentProps,
} from 'react-window';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import type { MessageMetadata, MessageToolEntry } from '@shared/stores/web-chat-store';
import type { WebChatMessageMetadata } from '../../types/message-metadata';
import type { ImageAspectRatio } from '../Composer/ChatComposerNew';
import { MessageBubble } from './MessageBubble';
import {
  InlinePaywallCard,
  normalizePaywallFeature,
  normalizeRequiredTier,
} from '../InlinePaywallCard';
import { TypingIndicator } from './TypingIndicator';
import { FollowUpSuggestions } from '../FollowUpSuggestions';
import { GreetingBanner } from '../GreetingBanner/GreetingBanner';
import { ChevronDown, ArrowRight, AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useTTS } from '@/lib/hooks/useTTS';
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
  /**
   * AUDIT-FIX STR-20: which conversation these messages belong to. The
   * component's `userScrolledUp` flag is component state that was never reset
   * per conversation (and the host does not key this component), so scrolling
   * up in chat A left chat B opening with auto-scroll silently disabled --
   * a new reply would stream in below the fold with no indication. Changing
   * this prop resets the scroll ownership for the newly displayed transcript.
   */
  conversationId?: string | null;
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
  onPin?: (messageId: string) => void;
  branchGroupsByMessageId?: Readonly<Record<string, MessageBranchGroup>>;
  branchingMessageId?: string | null;
  onBranch?: (messageId: string) => void;
  onSwitchBranch?: (conversationId: string) => void;
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

export interface MessageBranchGroup {
  messageId: string;
  activeConversationId: string;
  branches: Array<{ conversationId: string; title: string }>;
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
 *
 * AUDIT-FIX BUG-30: local-time getters and `toLocaleDateString` resolve
 * against whatever timezone/locale the JS runtime is in. On the server that is
 * the DEPLOYMENT's timezone, so "Today"/"Yesterday" were computed for the
 * datacenter rather than the reader. The function itself stays pure (it is
 * exported and unit-testable); the render path below only calls it after mount
 * so it always runs in the viewer's own timezone, and the locale argument is
 * now omitted so the runtime's locale — not a hardcoded en-US — formats the
 * fallback label.
 */
export function formatDateDivider(date: Date, now: Date = new Date()): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (startOfDay.getTime() === startOfToday.getTime()) return 'Today';
  if (startOfDay.getTime() === startOfYesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

/**
 * AUDIT-FIX GOV-33: framer-motion writes `opacity`/`transform` as INLINE
 * styles, which the global `prefers-reduced-motion` reset in globals.css
 * (`transition-duration: 0.01ms !important`) cannot reach — it only caps CSS
 * transitions/animations. The preference has to be read in JS and the
 * animation dropped at the source.
 */
const ScrollToBottomButton = memo(({ onClick }: { onClick: () => void }) => {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.button
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.8 }}
      animate={prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1 }}
      exit={prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.15 }}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-popover/95 shadow-md backdrop-blur-sm transition-colors hover:bg-muted"
      aria-label="Scroll to bottom"
    >
      <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </motion.button>
  );
});
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
  onPin?: (id: string) => void;
  branchGroupsByMessageId?: Readonly<Record<string, MessageBranchGroup>>;
  branchingMessageId?: string | null;
  onBranch?: (messageId: string) => void;
  onSwitchBranch?: (conversationId: string) => void;
  /** Called when a paywall Upgrade button is clicked. */
  onPaywallUpgrade?: (messageId: string) => void;
  /** Called when a paywall Try-later button is clicked. */
  onPaywallDismiss?: (messageId: string) => void;
  onRegenerateImage?: (
    messageId: string,
    opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
  ) => Promise<string>;
  speakingMessageId: string | null;
  isReadAloudSupported: boolean;
  onReadAloud: (messageId: string, content: string) => void;
}

interface MessageRowProps {
  message: ChatMessage;
  onRegenerate?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReact?: (id: string, reactionType: 'up' | 'down' | null) => void;
  onPin?: (id: string) => void;
  branchGroup?: MessageBranchGroup;
  isBranching: boolean;
  onBranch?: (messageId: string) => void;
  onSwitchBranch?: (conversationId: string) => void;
  onPaywallUpgrade?: (messageId: string) => void;
  onPaywallDismiss?: (messageId: string) => void;
  onRegenerateImage?: (
    messageId: string,
    opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
  ) => Promise<string>;
  speakingMessageId: string | null;
  isReadAloudSupported: boolean;
  onReadAloud: (messageId: string, content: string) => void;
}

// Per-message row component. Stable callbacks bound via useCallback below so
// React.memo on MessageBubble actually short-circuits when sibling messages
// stream or update.
/**
 * Casts the generic metadata bag to the store's typed shape.
 *
 * AUDIT-FIX STR-17: this used the narrower `WebChatMessageMetadata`, which does
 * not even declare `agentActivity`, `research`, `generatedFiles` or
 * `cloudApproval` — so the memo comparators below could not have compared them.
 * `MessageMetadata` is the shape the store actually writes and MessageBubble
 * actually reads.
 */
type RenderedMessageMetadata = MessageMetadata &
  Pick<
    WebChatMessageMetadata,
    'citations' | 'comparisonOptions' | 'comparisonChoice' | 'videoUrl' | 'tokensUsed'
  >;

function getMeta(msg: ChatMessage | undefined): RenderedMessageMetadata | undefined {
  return msg?.metadata as RenderedMessageMetadata | undefined;
}

/**
 * AUDIT-FIX STR-17: compares EVERY tool entry, not just index 0 and index -1.
 *
 * Sampling the ends of the list meant that with three or more parallel tools
 * the middle cards never left 'running', and that clicking Approve or Reject —
 * which flips `approved`/`status` on exactly one entry, usually not an end one
 * — produced no visual feedback at all until the whole batch resolved and the
 * length or the last status finally changed.
 *
 * Cost is O(tools) per message, bounded by the number of tool calls in a turn
 * (single digits), against the O(whole metadata bag) JSON serialization this
 * replaces.
 */
function toolEntriesEqual(
  prev: MessageToolEntry[] | undefined,
  next: MessageToolEntry[] | undefined,
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  for (let index = 0; index < prev.length; index += 1) {
    const a = prev[index];
    const b = next[index];
    if (!a || !b) return false;
    if (
      a.id !== b.id ||
      a.toolCallId !== b.toolCallId ||
      a.name !== b.name ||
      a.status !== b.status ||
      a.approved !== b.approved ||
      a.requiresApproval !== b.requiresApproval ||
      a.durationMs !== b.durationMs ||
      a.args !== b.args ||
      a.error !== b.error ||
      a.result !== b.result ||
      a.statusPhrase !== b.statusPhrase ||
      a.parallelGroup !== b.parallelGroup
    ) {
      return false;
    }
  }
  return true;
}

/**
 * AUDIT-FIX STR-17: metadata equality over every field the transcript renders.
 *
 * Reference identity is the correct test for the object-valued spines: the
 * store patches metadata immutably (`{ ...m.metadata, ...patch }`, see
 * web-chat-store `patchMessageMetadata`) and the activity reducer
 * (`applyAgentActivityEvent`) returns a NEW state object for every event it
 * actually applies and the SAME object when it de-duplicates one. So `!==`
 * means "this field changed" with no traversal and no false negatives.
 *
 * Previously missing entirely — each one is a field the user watches move
 * during a run: `agentActivity` (the AGI Work activity spine, frozen for the
 * whole run on a tool-only turn), `generatedFiles`, `searchResults` past the
 * first `isSearching` flip, `codeExecutionResult` past `isExecutingCode`,
 * `research`, `cloudApproval`, and `isPinned` (the pin badge never appeared).
 */
function renderedMetadataEqual(
  prev: RenderedMessageMetadata | undefined,
  next: RenderedMessageMetadata | undefined,
): boolean {
  if (prev === next) return true;
  return (
    prev?.thinkingContent === next?.thinkingContent &&
    prev?.isThinkingStreaming === next?.isThinkingStreaming &&
    prev?.thinkingSegments === next?.thinkingSegments &&
    prev?.thinkingSteps === next?.thinkingSteps &&
    prev?.reaction === next?.reaction &&
    prev?.isPinned === next?.isPinned &&
    prev?.paywall === next?.paywall &&
    prev?.finishReason === next?.finishReason &&
    prev?.streamError === next?.streamError &&
    prev?.agentActivity === next?.agentActivity &&
    prev?.cloudApproval === next?.cloudApproval &&
    prev?.research === next?.research &&
    prev?.generatedFiles === next?.generatedFiles &&
    prev?.searchResults === next?.searchResults &&
    prev?.isSearching === next?.isSearching &&
    prev?.codeExecutionResult === next?.codeExecutionResult &&
    prev?.isExecutingCode === next?.isExecutingCode &&
    prev?.citations === next?.citations &&
    prev?.comparisonOptions === next?.comparisonOptions &&
    prev?.comparisonChoice === next?.comparisonChoice &&
    prev?.documentData === next?.documentData &&
    prev?.artifactManifest === next?.artifactManifest &&
    prev?.generatedFile === next?.generatedFile &&
    prev?.computeSession === next?.computeSession &&
    prev?.imageUrl === next?.imageUrl &&
    prev?.videoUrl === next?.videoUrl &&
    prev?.model === next?.model &&
    prev?.tokensUsed === next?.tokensUsed &&
    toolEntriesEqual(prev?.tools, next?.tools)
  );
}

/**
 * AUDIT-FIX STR-17: one message-level comparison shared by both memo
 * comparators in this file, so they can never drift apart again (they already
 * had — the group comparator omitted `finishReason`/`streamError`, the list
 * comparator omitted `tools[0].status`).
 */
function messageRenderEqual(prevMessage: ChatMessage, nextMessage: ChatMessage): boolean {
  return (
    prevMessage.id === nextMessage.id &&
    prevMessage.content === nextMessage.content &&
    prevMessage.role === nextMessage.role &&
    prevMessage.createdAt === nextMessage.createdAt &&
    prevMessage.isStreaming === nextMessage.isStreaming &&
    // AUDIT-FIX BUG-28: attachments are rebuilt into a fresh array on every
    // render by messageBubbleAttachments, so the identity of the array is
    // useless — compare the descriptors that drive the attachment cards.
    attachmentsEqual(prevMessage.attachments, nextMessage.attachments) &&
    renderedMetadataEqual(getMeta(prevMessage), getMeta(nextMessage))
  );
}

/**
 * AUDIT-FIX BUG-28: attachment descriptors, compared field by field.
 * A finished upload changes only `url` (and often `size`), so an identity or
 * length check would report "unchanged" and the card would keep rendering the
 * pending state forever.
 */
function attachmentsEqual(
  prev: ChatMessage['attachments'],
  next: ChatMessage['attachments'],
): boolean {
  if (prev === next) return true;
  const a = prev ?? [];
  const b = next ?? [];
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!left || !right) return false;
    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.type !== right.type ||
      left.size !== right.size ||
      left.url !== right.url
    ) {
      return false;
    }
  }
  return true;
}

/**
 * AUDIT-FIX BUG-27: the fallback used when a message carries no `createdAt`.
 *
 * The previous code evaluated `new Date()` inline in the render path. Two
 * defects fell out of that one expression:
 *  1. MessageBubble's memo comparator tests
 *     `prev.timestamp.getTime() === next.timestamp.getTime()`, so for every
 *     optimistic message (created without `createdAt` — the normal case while
 *     streaming) the comparator could never return true and React.memo was
 *     fully defeated for the whole streaming turn;
 *  2. it is non-deterministic in render, so the server HTML and the client's
 *     first render disagreed.
 *
 * A frozen module-level sentinel fixes both. It is never displayed: the web
 * MessageBubble uses `timestamp` only to stamp derived artifact metadata
 * (`toGeneratedFile`, artifact `versions[].timestamp`), never as visible text,
 * and those paths only run on server-persisted messages, which always have a
 * real `createdAt`.
 */
const UNKNOWN_MESSAGE_TIMESTAMP = new Date(0);

function messageBubbleAttachments(message: ChatMessage) {
  return (message.attachments ?? []).flatMap((attachment) => {
    if (!attachment.url) return [];
    const persisted = attachment as typeof attachment & { mimeType?: string };
    const mimeType =
      persisted.mimeType ??
      (attachment.type === 'image'
        ? 'image/*'
        : attachment.type === 'file'
          ? 'application/octet-stream'
          : attachment.type);
    return [
      {
        id: attachment.id,
        name: attachment.name,
        type: mimeType,
        size: attachment.size ?? 0,
        url: attachment.url,
      },
    ];
  });
}

/**
 * GOV-20 — "when this clears" copy, or '' when there is nothing truthful to
 * say. Returns empty unless the classification asked for a reset time AND the
 * server actually sent a parsable instant: the card must never invent one.
 */
function paywallResetLabel(paywall: { showResetTime?: boolean; resetAt?: string }): string {
  if (!paywall.showResetTime || !paywall.resetAt) return '';
  const target = Date.parse(paywall.resetAt);
  if (Number.isNaN(target)) return '';
  return `Capacity refreshes ${new Date(target).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}.`;
}

const MessageRow = ({
  message,
  onRegenerate,
  onEdit,
  onDelete,
  onReact,
  onPin,
  branchGroup,
  isBranching,
  onBranch,
  onSwitchBranch,
  onPaywallUpgrade,
  onPaywallDismiss,
  onRegenerateImage,
  speakingMessageId,
  isReadAloudSupported,
  onReadAloud,
}: MessageRowProps) => {
  const meta = getMeta(message);
  const paywall = meta?.paywall;

  // AUDIT-FIX BUG-27: one Date per message, derived only from persisted data.
  const timestamp = useMemo(
    () => (message.createdAt ? new Date(message.createdAt) : UNKNOWN_MESSAGE_TIMESTAMP),
    [message.createdAt],
  );

  // AUDIT-FIX BUG-28: a stable attachment array so MessageBubble's comparator
  // is not handed a brand-new array identity on every parent render.
  const attachments = useMemo(() => messageBubbleAttachments(message), [message]);

  const handleRegenerate = useCallback(
    () => onRegenerate?.(message.id),
    [onRegenerate, message.id],
  );
  const handleDelete = useCallback(() => onDelete?.(message.id), [onDelete, message.id]);
  const handleEdit = useCallback(() => onEdit?.(message.id), [onEdit, message.id]);
  const handleBranch = useCallback(() => onBranch?.(message.id), [onBranch, message.id]);
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
  const branchNavigation = useMemo(
    () =>
      branchGroup && onSwitchBranch
        ? {
            branches: branchGroup.branches.map((branch) => ({
              id: branch.conversationId,
              name: branch.title,
              forkPointMessageId: message.id,
            })),
            activeBranchId: branchGroup.activeConversationId,
            onSwitch: onSwitchBranch,
          }
        : undefined,
    [branchGroup, message.id, onSwitchBranch],
  );

  if (paywall) {
    return (
      <InlinePaywallCard
        feature={normalizePaywallFeature(paywall.feature)}
        currentTier="free"
        requiredTier={normalizeRequiredTier(paywall.requiredTier)}
        reason={paywall.reason}
        // GOV-20: the classifier's presentation flags. Absent on slots written
        // before GOV-20, where the old always-upgrade behaviour is correct.
        showUpgradeCta={paywall.showUpgradeCta ?? true}
        suggestStandardModel={paywall.suggestStandardModel ?? false}
        resetLabel={paywallResetLabel(paywall)}
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
        timestamp,
        isStreaming: message.isStreaming,
        attachments,
        metadata: message.metadata as Parameters<typeof MessageBubble>[0]['message']['metadata'],
      }}
      onRegenerate={onRegenerate && displayRole === 'assistant' ? handleRegenerate : undefined}
      onEdit={onEdit && displayRole === 'user' ? handleEdit : undefined}
      onDelete={onDelete ? handleDelete : undefined}
      onReact={onReact && displayRole === 'assistant' ? onReact : undefined}
      onPin={onPin}
      onBranch={onBranch ? handleBranch : undefined}
      isBranching={isBranching}
      branchNavigation={branchNavigation}
      onRegenerateImage={onRegenerateImage ? handleRegenerateImage : undefined}
      onReadAloud={displayRole === 'assistant' ? onReadAloud : undefined}
      isReadingAloud={speakingMessageId === message.id}
      isReadAloudSupported={isReadAloudSupported}
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
    onPin,
    branchGroupsByMessageId,
    branchingMessageId,
    onBranch,
    onSwitchBranch,
    onPaywallUpgrade,
    onPaywallDismiss,
    onRegenerateImage,
    speakingMessageId,
    isReadAloudSupported,
    onReadAloud,
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
            onPin={onPin}
            branchGroup={branchGroupsByMessageId?.[message.id]}
            isBranching={branchingMessageId === message.id}
            onBranch={onBranch}
            onSwitchBranch={onSwitchBranch}
            onPaywallUpgrade={onPaywallUpgrade}
            onPaywallDismiss={onPaywallDismiss}
            onRegenerateImage={onRegenerateImage}
            speakingMessageId={speakingMessageId}
            isReadAloudSupported={isReadAloudSupported}
            onReadAloud={onReadAloud}
          />
        ))}
      </div>
    );
  },
  // AUDIT-FIX STR-17 / BUG-28: every rendered field participates, via the
  // shared helpers above. `onPin` was also simply missing from this list, so a
  // surface that swapped its pin handler kept dispatching to the old one.
  (prev, next) => {
    return (
      prev.group.firstId === next.group.firstId &&
      prev.group.messages.length === next.group.messages.length &&
      prev.group.messages.every((prevMessage, index) => {
        const nextMessage = next.group.messages[index];
        if (!nextMessage) return false;
        return messageRenderEqual(prevMessage, nextMessage);
      }) &&
      prev.isLastGroup === next.isLastGroup &&
      prev.onRegenerate === next.onRegenerate &&
      prev.onEdit === next.onEdit &&
      prev.onDelete === next.onDelete &&
      prev.onReact === next.onReact &&
      prev.onPin === next.onPin &&
      prev.branchGroupsByMessageId === next.branchGroupsByMessageId &&
      prev.branchingMessageId === next.branchingMessageId &&
      prev.onBranch === next.onBranch &&
      prev.onSwitchBranch === next.onSwitchBranch &&
      prev.onPaywallUpgrade === next.onPaywallUpgrade &&
      prev.onPaywallDismiss === next.onPaywallDismiss &&
      prev.onRegenerateImage === next.onRegenerateImage &&
      prev.speakingMessageId === next.speakingMessageId &&
      prev.isReadAloudSupported === next.isReadAloudSupported &&
      prev.onReadAloud === next.onReadAloud
    );
  },
);
MessageGroupRow.displayName = 'MessageGroupRow';

interface VirtualizedTranscriptRowData {
  groups: MessageGroup[];
  groupProps: Omit<MessageGroupRowProps, 'group' | 'isLastGroup'>;
  hasMounted: boolean;
  topSpacerHeight: number;
  footer: React.ReactNode;
}

/**
 * One variable-height row in the recycled transcript.
 *
 * Row zero is a measured presentation spacer that keeps short conversations
 * bottom-aligned. The final row owns all turn-level controls (typing, retry,
 * continuation, and follow-up suggestions), so those controls scroll with the
 * transcript instead of floating outside its history.
 */
const VirtualizedTranscriptRow = ({
  index,
  style,
  ariaAttributes,
  groups,
  groupProps,
  hasMounted,
  topSpacerHeight,
  footer,
}: RowComponentProps<VirtualizedTranscriptRowData>) => {
  if (index === 0) {
    return (
      <div
        {...ariaAttributes}
        role="presentation"
        style={{ ...style, height: topSpacerHeight }}
        data-testid="transcript-top-spacer"
      />
    );
  }

  const groupIndex = index - 1;
  const group = groups[groupIndex];

  if (!group) {
    return (
      <div {...ariaAttributes} style={style} className="pb-2">
        {footer}
      </div>
    );
  }

  const firstMessage = group.messages[0];
  const firstMessageDate = firstMessage?.createdAt ? new Date(firstMessage.createdAt) : undefined;
  const groupDateKey = firstMessageDate ? toDateKey(firstMessageDate) : '';
  const previousGroup = groupIndex > 0 ? groups[groupIndex - 1] : null;
  const previousFirstMessage = previousGroup?.messages[0];
  const previousFirstMessageDate = previousFirstMessage?.createdAt
    ? new Date(previousFirstMessage.createdAt)
    : undefined;
  const previousDateKey = previousFirstMessageDate ? toDateKey(previousFirstMessageDate) : '';
  const showDivider = hasMounted && firstMessageDate && groupDateKey !== previousDateKey;

  return (
    <div {...ariaAttributes} style={style}>
      {showDivider && firstMessageDate && (
        <DateDivider label={formatDateDivider(firstMessageDate)} />
      )}
      <MessageGroupRow
        group={group}
        isLastGroup={groupIndex === groups.length - 1}
        {...groupProps}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SCROLL_THRESHOLD_PX = 120;
const DEFAULT_TRANSCRIPT_ROW_HEIGHT = 160;
const DEFAULT_TRANSCRIPT_VIEWPORT_HEIGHT = 640;

/**
 * AUDIT-FIX GOV-29: what the live region says when generation starts and when
 * it finishes. Modelled on `buildAgentActivityAnnouncement` in
 * packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx — a short
 * discrete phrase, announced once per state change, never a re-read of the
 * whole transcript.
 */
function buildStreamAnnouncement(message: ChatMessage | undefined): string {
  if (!message || message.role !== 'assistant') return 'Response complete';
  const text = message.content.trim();
  return text ? `Response complete. ${text}` : 'Response complete';
}

const ChatMessageListComponent = ({
  messages,
  conversationId = null,
  isLoading,
  onRegenerate,
  onContinue,
  onEdit,
  onDelete,
  onReact,
  onPin,
  branchGroupsByMessageId,
  branchingMessageId = null,
  onBranch,
  onSwitchBranch,
  onRegenerateImage,
  onSendMessage,
  isUserTyping = false,
  className,
  onPaywallUpgrade,
  onPaywallDismiss,
}: ChatMessageListProps) => {
  const listApiRef = useRef<ListImperativeAPI | null>(null);
  const { isSpeaking, isSupported: isReadAloudSupported, speak, stop } = useTTS();
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  /**
   * Whether auto-scroll is active. Disabled when the user manually scrolls
   * up; re-enabled when they scroll back to the bottom.
   */
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  /**
   * AUDIT-FIX STR-20: scroll ownership belongs to ONE transcript. Reset it (and
   * jump to the bottom) whenever a different conversation is displayed, so a
   * conversation the user has never scrolled in always opens pinned to the
   * latest message. Without this, `userScrolledUp` leaked across conversations.
   */
  const scrolledConversationRef = useRef<string | null>(conversationId);
  useEffect(() => {
    if (scrolledConversationRef.current === conversationId) return;
    scrolledConversationRef.current = conversationId;
    setUserScrolledUp(false);
  }, [conversationId]);

  /**
   * AUDIT-FIX BUG-30: date dividers are derived from local-time getters and
   * `toLocaleDateString`. Rendering them during SSR computes "Today" /
   * "Yesterday" and the fallback label in the SERVER's timezone and locale for
   * every viewer on earth — and because React keeps the server DOM for the
   * first paint, the reader is stuck with the server's answer. Dividers are
   * therefore mounted only after hydration, where the viewer's own timezone is
   * the one in effect.
   */
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);

  /** AUDIT-FIX GOV-33: honour prefers-reduced-motion for inline motion styles. */
  const prefersReducedMotion = useReducedMotion();

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const groups = useMemo(() => groupMessages(messages), [messages]);
  const virtualizationKey = conversationId ?? groups[0]?.firstId ?? 'empty-transcript';
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_TRANSCRIPT_ROW_HEIGHT,
    key: virtualizationKey,
  });
  const virtualRowCount = groups.length + 2;
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_TRANSCRIPT_VIEWPORT_HEIGHT);
  const estimatedContentHeight = useMemo(() => {
    let height = 0;
    for (let index = 1; index < virtualRowCount; index += 1) {
      height += dynamicRowHeight.getRowHeight(index) ?? DEFAULT_TRANSCRIPT_ROW_HEIGHT;
    }
    return height;
  }, [dynamicRowHeight, virtualRowCount]);
  const topSpacerHeight = Math.max(1, viewportHeight - estimatedContentHeight);

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

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const listApi = listApiRef.current;
      if (!listApi || virtualRowCount === 0) return;
      listApi.scrollToRow({
        align: 'end',
        behavior,
        index: virtualRowCount - 1,
      });
    },
    [virtualRowCount],
  );

  /**
   * AUDIT-FIX STR-19: coalesce auto-scroll to at most one call per animation
   * frame.
   *
   * The auto-scroll effect is keyed on `${id}-${content.length}`, which changes
   * on EVERY streamed token. It called smooth `scrollIntoView` each time, on a
   * container that also carried the CSS `scroll-smooth` class — two smooth
   * scroll animations restarting dozens of times a second, which is what made
   * the transcript almost impossible to scroll up in during a response.
   * Requests are now merged into a single rAF-scheduled scroll and the CSS
   * `scroll-smooth` class is gone, so `behavior` is decided in one place.
   */
  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior>('smooth');

  const requestScrollToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      pendingScrollBehaviorRef.current = behavior;
      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        scrollToBottom(behavior);
        return;
      }
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        scrollToBottom(pendingScrollBehaviorRef.current);
      });
    },
    [scrollToBottom],
  );

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    },
    [],
  );

  /** Detect when user scrolls away from the bottom. */
  const handleScroll = useCallback(() => {
    const el = listApiRef.current?.element;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distanceFromBottom > SCROLL_THRESHOLD_PX);
  }, []);

  /**
   * Auto-scroll when new messages/content arrive (respects user scroll).
   * AUDIT-FIX STR-19 / GOV-33: token appends and reduced-motion users get a
   * jump, not an animation; only a genuinely new turn animates.
   */
  const isStreamingNow = Boolean(lastMessage?.isStreaming);
  useEffect(() => {
    if (userScrolledUp) return;
    const behavior: ScrollBehavior =
      messages.length === 1 || isStreamingNow || prefersReducedMotion ? 'auto' : 'smooth';
    requestScrollToBottom(behavior);
  }, [
    messages.length,
    lastMessageFingerprint,
    isLoading,
    isStreamingNow,
    prefersReducedMotion,
    userScrolledUp,
    requestScrollToBottom,
    conversationId,
  ]);

  /**
   * Variable-height rows are first positioned from an estimate and then
   * corrected as ResizeObserver reports markdown, artifact, and image sizes.
   * If the reader still owns the bottom pin, follow those measurement changes
   * with an instant correction; otherwise a newly measured long response can
   * grow below the viewport after the initial scroll and strand the reader in
   * the middle of the transcript.
   *
   * A newly appended message is left to the effect above so completed turns
   * can retain their smooth transition. Subsequent measurements for that same
   * message count use the correction path here.
   */
  const measuredLayoutRef = useRef({
    contentHeight: estimatedContentHeight,
    messageCount: messages.length,
    viewportHeight,
  });
  useEffect(() => {
    const previous = measuredLayoutRef.current;
    measuredLayoutRef.current = {
      contentHeight: estimatedContentHeight,
      messageCount: messages.length,
      viewportHeight,
    };

    const layoutChanged =
      previous.contentHeight !== estimatedContentHeight ||
      previous.viewportHeight !== viewportHeight;
    if (!layoutChanged || previous.messageCount !== messages.length || userScrolledUp) return;
    requestScrollToBottom('auto');
  }, [
    estimatedContentHeight,
    messages.length,
    requestScrollToBottom,
    userScrolledUp,
    viewportHeight,
  ]);

  /**
   * AUDIT-FIX GOV-29: streaming output was never announced. `role="log"
   * aria-live="polite"` sat on the ENTIRE scroll container, so assistive tech
   * was handed the whole transcript as one live region — unrelated content got
   * re-announced on every re-render and the delta itself was lost in it — and
   * `aria-busy` was never toggled, so nothing marked the start or the end of
   * generation. The container is now an inert log (`aria-live="off"`, which is
   * required because `role="log"` implies polite) that reports its busy state,
   * and a dedicated off-screen region announces the two moments that matter.
   * This is the pattern AgentActivityTimeline.tsx:479 already uses.
   */
  const isGenerating = Boolean(isLoading || lastMessage?.isStreaming);
  const [streamAnnouncement, setStreamAnnouncement] = useState('');
  const wasGeneratingRef = useRef(false);

  useEffect(() => {
    if (wasGeneratingRef.current === isGenerating) return;
    wasGeneratingRef.current = isGenerating;
    setStreamAnnouncement(
      isGenerating ? 'Generating response' : buildStreamAnnouncement(lastMessage),
    );
  }, [isGenerating, lastMessage]);

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

  const handleReadAloud = useCallback(
    (messageId: string, content: string) => {
      if (isSpeaking && speakingMessageId === messageId) {
        stop();
        return;
      }

      setSpeakingMessageId(messageId);
      speak(content);
    },
    [isSpeaking, speak, speakingMessageId, stop],
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

  const groupProps = useMemo<Omit<MessageGroupRowProps, 'group' | 'isLastGroup'>>(
    () => ({
      onRegenerate: handleRegenerate,
      onEdit: handleEdit,
      onDelete: handleDelete,
      onReact: handleReact,
      onPin,
      branchGroupsByMessageId,
      branchingMessageId,
      onBranch,
      onSwitchBranch,
      onPaywallUpgrade: handlePaywallUpgrade,
      onPaywallDismiss: handlePaywallDismiss,
      onRegenerateImage: onRegenerateImage ? handleRegenerateImage : undefined,
      speakingMessageId: isSpeaking ? speakingMessageId : null,
      isReadAloudSupported,
      onReadAloud: handleReadAloud,
    }),
    [
      branchGroupsByMessageId,
      branchingMessageId,
      handleDelete,
      handleEdit,
      handlePaywallDismiss,
      handlePaywallUpgrade,
      handleReact,
      handleReadAloud,
      handleRegenerate,
      handleRegenerateImage,
      isReadAloudSupported,
      isSpeaking,
      onBranch,
      onPin,
      onRegenerateImage,
      onSwitchBranch,
      speakingMessageId,
    ],
  );

  const transcriptFooter = (
    <>
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

      <AnimatePresence>
        {showTypingIndicator && (
          <motion.div
            key="typing-indicator"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
          >
            <TypingIndicator />
          </motion.div>
        )}
      </AnimatePresence>

      {showFollowUps && lastMessage && (
        <div className="mx-auto w-full max-w-3xl px-4" data-testid="follow-up-suggestions-shell">
          <FollowUpSuggestions
            lastAssistantContent={lastMessage.content}
            onSelect={onSendMessage!}
            isGenerating={isLoading}
            isUserTyping={isUserTyping}
            messageCount={messages.length}
          />
        </div>
      )}
    </>
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
      {/* AUDIT-FIX GOV-29: the ONLY live region on this surface. Off-screen,
          atomic, and carrying one short phrase per generation state change —
          so a screen reader hears "Generating response" and then the finished
          answer, instead of the transcript being re-read on every re-render. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {streamAnnouncement}
      </p>
      <List
        listRef={listApiRef}
        rowComponent={VirtualizedTranscriptRow}
        rowCount={virtualRowCount}
        rowHeight={dynamicRowHeight}
        rowProps={{
          groups,
          groupProps,
          hasMounted,
          topSpacerHeight,
          footer: transcriptFooter,
        }}
        defaultHeight={DEFAULT_TRANSCRIPT_VIEWPORT_HEIGHT}
        overscanCount={6}
        onResize={({ height }) => setViewportHeight(height)}
        role="log"
        // AUDIT-FIX GOV-29: role="log" implies aria-live="polite"; the explicit
        // "off" is what actually silences the container so the region above is
        // the single source of announcements. aria-busy marks generation.
        aria-live="off"
        aria-busy={isGenerating}
        aria-label="Chat messages"
        onScroll={handleScroll}
        className="h-full"
      />

      {/* Scroll-to-bottom FAB · shown when user has scrolled up */}
      <AnimatePresence>
        {userScrolledUp && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <div className="pointer-events-auto">
              <ScrollToBottomButton
                onClick={() => requestScrollToBottom(prefersReducedMotion ? 'auto' : 'smooth')}
              />
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
    // AUDIT-FIX STR-20: a conversation switch MUST re-render (it resets scroll
    // ownership); two transcripts of equal length would otherwise compare equal.
    prev.conversationId === next.conversationId &&
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
    prev.onEdit === next.onEdit &&
    prev.onPin === next.onPin &&
    prev.branchGroupsByMessageId === next.branchGroupsByMessageId &&
    prev.branchingMessageId === next.branchingMessageId &&
    prev.onBranch === next.onBranch &&
    prev.onSwitchBranch === next.onSwitchBranch &&
    // AUDIT-FIX STR-17: the same per-message comparison MessageGroupRow uses,
    // so the two can never disagree about what "changed" means again.
    prev.messages.every((prevMessage, index) => {
      const nextMessage = next.messages[index];
      if (!nextMessage) return false;
      return messageRenderEqual(prevMessage, nextMessage);
    })
  );
});

ChatMessageList.displayName = 'ChatMessageList';

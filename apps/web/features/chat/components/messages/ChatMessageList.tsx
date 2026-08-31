'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from 'react';
import { MessageSearch } from './MessageSearch';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  List,
  useDynamicRowHeight,
  type ListImperativeAPI,
  type RowComponentProps,
} from 'react-window';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { formatUsageResetIn } from '@agiworkforce/types';
import type { MessageMetadata, MessageToolEntry } from '@shared/stores/web-chat-store';
import type { WebChatMessageMetadata } from '../../types/message-metadata';
import type { ImageAspectRatio } from '../Composer/ChatComposerNew';
import { MessageBubble } from './MessageBubble';
import type { ResearchPlanDecision } from '../research/ResearchActivity';
import {
  InlinePaywallCard,
  normalizePaywallFeature,
  normalizeRequiredTier,
  type PaywallRecoveryAction,
  type RequiredTier,
  type UserTier,
} from '../InlinePaywallCard';
import { TypingIndicator } from './TypingIndicator';
import { FollowUpSuggestions } from '../FollowUpSuggestions';
import { GreetingBanner } from '../GreetingBanner/GreetingBanner';
import { ComposerFeedbackDialog } from '../Composer/ComposerFeedbackDialog';
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

/**
 * A turn that never produced a usable assistant reply: either the user's
 * message is trailing with no assistant row after it (a managed-cloud turn
 * dropped before any row was persisted), or the assistant row exists but is
 * marked truncated/error by the server marker or a web-composer error row.
 * Distinct from streamError (additive mid-stream failure with partial content)
 * and refusal — it gets an explicit "didn't complete" affordance with Retry.
 */
function isIncompleteTurn(message: ChatMessage | undefined | null): boolean {
  if (!message) return false;
  if (message.role === 'user') return true;
  if (message.role !== 'assistant') return false;
  if (message.error) return true;
  return (message.metadata as { truncated?: unknown } | undefined)?.truncated === true;
}

export interface ChatMessageListProps {
  messages: ChatMessage[];
  currentTier?: UserTier;
  conversationId?: string | null;
  isLoading?: boolean;
  onRegenerate?: (messageId: string) => void;
  onRetryResearch?: (messageId: string) => void;
  onResearchPlanDecision?: (messageId: string, decision: ResearchPlanDecision) => void;
  retryingResearchMessageId?: string | null;
  onContinue?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onReact?: (messageId: string, reactionType: 'up' | 'down' | null) => void;
  onPin?: (messageId: string) => void;
  branchGroupsByMessageId?: Readonly<Record<string, MessageBranchGroup>>;
  branchingMessageId?: string | null;
  onBranch?: (messageId: string) => void;
  onSwitchBranch?: (conversationId: string) => void;
  onRegenerateImage?: (
    messageId: string,
    opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
  ) => Promise<string>;
  onResumeVideo?: (messageId: string) => void;
  onRetryVideo?: (messageId: string) => void;
  onSendMessage?: (content: string) => void;
  isUserTyping?: boolean;
  className?: string;
  onPaywallUpgrade?: (
    messageId: string,
    requiredTier: RequiredTier,
    recoveryAction: PaywallRecoveryAction,
  ) => void;
  onPaywallDismiss?: (messageId: string) => void;
}

export interface MessageBranchGroup {
  messageId: string;
  activeConversationId: string;
  branches: Array<{ conversationId: string; title: string }>;
}

interface MessageGroup {
  role: 'user' | 'assistant';
  messages: ChatMessage[];
  firstId: string;
}

// Pure helpers (exported for tests)

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

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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

interface MessageGroupRowProps {
  group: MessageGroup;
  isLastGroup: boolean;
  currentTier: UserTier;
  onRegenerate?: (id: string) => void;
  onRetryResearch?: (id: string) => void;
  onResearchPlanDecision?: (id: string, decision: ResearchPlanDecision) => void;
  retryingResearchMessageId?: string | null;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReact?: (id: string, reactionType: 'up' | 'down' | null) => void;
  onPin?: (id: string) => void;
  branchGroupsByMessageId?: Readonly<Record<string, MessageBranchGroup>>;
  branchingMessageId?: string | null;
  onBranch?: (messageId: string) => void;
  onSwitchBranch?: (conversationId: string) => void;
  onPaywallUpgrade?: (
    messageId: string,
    requiredTier: RequiredTier,
    recoveryAction: PaywallRecoveryAction,
  ) => void;
  onPaywallDismiss?: (messageId: string) => void;
  onRegenerateImage?: (
    messageId: string,
    opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
  ) => Promise<string>;
  onResumeVideo?: (messageId: string) => void;
  onRetryVideo?: (messageId: string) => void;
  speakingMessageId: string | null;
  isReadAloudSupported: boolean;
  onReadAloud: (messageId: string, content: string) => void;
}

interface MessageRowProps {
  message: ChatMessage;
  currentTier: UserTier;
  onRegenerate?: (id: string) => void;
  onRetryResearch?: (id: string) => void;
  onResearchPlanDecision?: (id: string, decision: ResearchPlanDecision) => void;
  retryingResearchMessageId?: string | null;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReact?: (id: string, reactionType: 'up' | 'down' | null) => void;
  onPin?: (id: string) => void;
  branchGroup?: MessageBranchGroup;
  isBranching: boolean;
  onBranch?: (messageId: string) => void;
  onSwitchBranch?: (conversationId: string) => void;
  onPaywallUpgrade?: (
    messageId: string,
    requiredTier: RequiredTier,
    recoveryAction: PaywallRecoveryAction,
  ) => void;
  onPaywallDismiss?: (messageId: string) => void;
  onRegenerateImage?: (
    messageId: string,
    opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
  ) => Promise<string>;
  onResumeVideo?: (messageId: string) => void;
  onRetryVideo?: (messageId: string) => void;
  speakingMessageId: string | null;
  isReadAloudSupported: boolean;
  onReadAloud: (messageId: string, content: string) => void;
}

type RenderedMessageMetadata = MessageMetadata &
  Pick<
    WebChatMessageMetadata,
    'citations' | 'comparisonOptions' | 'comparisonChoice' | 'videoUrl' | 'tokensUsed'
  >;

function getMeta(msg: ChatMessage | undefined): RenderedMessageMetadata | undefined {
  return msg?.metadata as RenderedMessageMetadata | undefined;
}

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
    prev?.videoTaskId === next?.videoTaskId &&
    prev?.videoStatus === next?.videoStatus &&
    prev?.videoProvider === next?.videoProvider &&
    prev?.videoModel === next?.videoModel &&
    prev?.videoProgress === next?.videoProgress &&
    prev?.videoError === next?.videoError &&
    prev?.model === next?.model &&
    prev?.tokensUsed === next?.tokensUsed &&
    toolEntriesEqual(prev?.tools, next?.tools)
  );
}

function messageRenderEqual(prevMessage: ChatMessage, nextMessage: ChatMessage): boolean {
  return (
    prevMessage.id === nextMessage.id &&
    prevMessage.content === nextMessage.content &&
    prevMessage.role === nextMessage.role &&
    prevMessage.createdAt === nextMessage.createdAt &&
    prevMessage.isStreaming === nextMessage.isStreaming &&
    attachmentsEqual(prevMessage.attachments, nextMessage.attachments) &&
    renderedMetadataEqual(getMeta(prevMessage), getMeta(nextMessage))
  );
}

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

function paywallResetLabel(paywall: { showResetTime?: boolean; resetAt?: string }): string {
  if (!paywall.showResetTime || !paywall.resetAt) return '';
  return formatUsageResetIn(paywall.resetAt) ?? '';
}

const MessageRow = ({
  message,
  currentTier,
  onRegenerate,
  onRetryResearch,
  onResearchPlanDecision,
  retryingResearchMessageId,
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
  onResumeVideo,
  onRetryVideo,
  speakingMessageId,
  isReadAloudSupported,
  onReadAloud,
}: MessageRowProps) => {
  const meta = getMeta(message);
  const paywall = meta?.paywall;
  const requiredTier = normalizeRequiredTier(paywall?.requiredTier ?? 'basic');

  const timestamp = useMemo(
    () => (message.createdAt ? new Date(message.createdAt) : UNKNOWN_MESSAGE_TIMESTAMP),
    [message.createdAt],
  );

  const attachments = useMemo(() => messageBubbleAttachments(message), [message]);

  const handleRegenerate = useCallback(
    () => onRegenerate?.(message.id),
    [onRegenerate, message.id],
  );
  const handleDelete = useCallback(() => onDelete?.(message.id), [onDelete, message.id]);
  const handleEdit = useCallback(() => onEdit?.(message.id), [onEdit, message.id]);
  const handleBranch = useCallback(() => onBranch?.(message.id), [onBranch, message.id]);
  const handlePaywallUpgrade = useCallback(
    () => onPaywallUpgrade?.(message.id, requiredTier, paywall?.recoveryAction ?? 'upgrade'),
    [onPaywallUpgrade, message.id, paywall?.recoveryAction, requiredTier],
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
    // The card takes the turn's place in the transcript, so it takes the
    // transcript's column too. Rendered bare it spanned the full surface —
    // 206px past the message and composer edges on either side.
    return (
      <div className="message-row">
        <div className="message-inner">
          <div className="min-w-0 flex-1">
            <InlinePaywallCard
              feature={normalizePaywallFeature(paywall.feature)}
              currentTier={currentTier}
              requiredTier={requiredTier}
              reason={paywall.reason}
              showUpgradeCta={paywall.showUpgradeCta ?? true}
              suggestStandardModel={paywall.suggestStandardModel ?? false}
              resetLabel={paywallResetLabel(paywall)}
              recoveryAction={paywall.recoveryAction ?? 'upgrade'}
              onUpgrade={handlePaywallUpgrade}
              onDismiss={handlePaywallDismiss}
            />
          </div>
        </div>
      </div>
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
      onRetryResearch={
        onRetryResearch && displayRole === 'assistant' && message.metadata?.['research']
          ? onRetryResearch
          : undefined
      }
      onResearchPlanDecision={
        onResearchPlanDecision && displayRole === 'assistant' && message.metadata?.['research']
          ? onResearchPlanDecision
          : undefined
      }
      isRetryingResearch={retryingResearchMessageId === message.id}
      onEdit={onEdit && displayRole === 'user' ? handleEdit : undefined}
      onDelete={onDelete ? handleDelete : undefined}
      onReact={onReact && displayRole === 'assistant' ? onReact : undefined}
      onPin={onPin}
      onBranch={onBranch ? handleBranch : undefined}
      isBranching={isBranching}
      branchNavigation={branchNavigation}
      onRegenerateImage={onRegenerateImage ? handleRegenerateImage : undefined}
      onResumeVideo={onResumeVideo}
      onRetryVideo={onRetryVideo}
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
    currentTier,
    onRegenerate,
    onRetryResearch,
    onResearchPlanDecision,
    retryingResearchMessageId,
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
    onResumeVideo,
    onRetryVideo,
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
            currentTier={currentTier}
            onRegenerate={onRegenerate}
            onRetryResearch={onRetryResearch}
            onResearchPlanDecision={onResearchPlanDecision}
            retryingResearchMessageId={retryingResearchMessageId}
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
            onResumeVideo={onResumeVideo}
            onRetryVideo={onRetryVideo}
            speakingMessageId={speakingMessageId}
            isReadAloudSupported={isReadAloudSupported}
            onReadAloud={onReadAloud}
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
        return messageRenderEqual(prevMessage, nextMessage);
      }) &&
      prev.isLastGroup === next.isLastGroup &&
      prev.currentTier === next.currentTier &&
      prev.onRegenerate === next.onRegenerate &&
      prev.onRetryResearch === next.onRetryResearch &&
      prev.onResearchPlanDecision === next.onResearchPlanDecision &&
      prev.retryingResearchMessageId === next.retryingResearchMessageId &&
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
      prev.onResumeVideo === next.onResumeVideo &&
      prev.onRetryVideo === next.onRetryVideo &&
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

const SCROLL_THRESHOLD_PX = 120;
const DEFAULT_TRANSCRIPT_ROW_HEIGHT = 160;
const DEFAULT_TRANSCRIPT_VIEWPORT_HEIGHT = 640;

function buildStreamAnnouncement(message: ChatMessage | undefined): string {
  if (!message || message.role !== 'assistant') return 'Response complete';
  const activity = message.metadata?.['agentActivity'];
  const activityStatus =
    activity && typeof activity === 'object' && 'status' in activity
      ? (activity as { status?: unknown }).status
      : undefined;
  if (activityStatus === 'cancelled') {
    return message.content.trim()
      ? 'Response cancelled. Partial response saved.'
      : 'Response cancelled';
  }
  if (activityStatus === 'failed' || message.error) {
    return 'Response failed';
  }
  if (activityStatus === 'partial') {
    return 'Response finished with errors';
  }
  if (message.metadata?.['finishReason'] === 'stopped') {
    return 'Response cancelled. Partial response saved.';
  }
  const text = message.content.trim();
  return text ? `Response complete. ${text}` : 'Response complete';
}

const ChatMessageListComponent = ({
  messages,
  currentTier = 'free',
  conversationId = null,
  isLoading,
  onRegenerate,
  onRetryResearch,
  onResearchPlanDecision,
  retryingResearchMessageId = null,
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
  onResumeVideo,
  onRetryVideo,
  onSendMessage,
  isUserTyping = false,
  className,
  onPaywallUpgrade,
  onPaywallDismiss,
}: ChatMessageListProps) => {
  const listApiRef = useRef<ListImperativeAPI | null>(null);
  const { isSpeaking, isSupported: isReadAloudSupported, speak, stop } = useTTS();
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const scrolledConversationRef = useRef<string | null>(conversationId);
  useEffect(() => {
    if (scrolledConversationRef.current === conversationId) return;
    scrolledConversationRef.current = conversationId;
    setUserScrolledUp(false);
  }, [conversationId]);

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);

  const prefersReducedMotion = useReducedMotion();

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

  const lastMessageFingerprint = useMemo(
    () => (lastMessage ? `${lastMessage.id}-${lastMessage.content.length}` : ''),
    [lastMessage],
  );

  const showTypingIndicator = isLoading && messages.length > 0 && !lastMessage?.isStreaming;

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

  /**
   * A turn that dropped without a usable reply (see isIncompleteTurn): the
   * managed-cloud path could persist only a truncated marker, or nothing after
   * the user row, and a web-composer error row lands here too. Shown once
   * streaming has stopped and only when none of the more specific notices
   * (Continue, stream-error, refusal) already own the last message, so the user
   * always gets an explicit "didn't complete" state plus Retry instead of a
   * silently missing answer.
   */
  const showIncompleteTurnNotice = Boolean(
    onRegenerate &&
    !isLoading &&
    !lastMessage?.isStreaming &&
    !showContinue &&
    !showStreamErrorNotice &&
    !showRefusalNotice &&
    isIncompleteTurn(lastMessage),
  );

  const showFollowUps =
    onSendMessage &&
    !isLoading &&
    lastMessage?.role === 'assistant' &&
    !lastMessage?.isStreaming &&
    lastMessage.content.length > 20;

  // `MessageSearch` was complete but never exported or mounted, and nothing
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const searchMatches = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return [] as number[];
    return groups.reduce<number[]>((acc, group, index) => {
      const hit = group.messages.some((message) =>
        typeof message.content === 'string'
          ? message.content.toLowerCase().includes(needle)
          : false,
      );
      if (hit) acc.push(index);
      return acc;
    }, []);
  }, [groups, searchQuery]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setCurrentMatchIndex(0);
  }, []);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  const goToMatch = useCallback(
    (matchIndex: number) => {
      const rowIndex = searchMatches[matchIndex];
      if (rowIndex === undefined) return;
      listApiRef.current?.scrollToRow({ align: 'center', behavior: 'smooth', index: rowIndex });
    },
    [searchMatches],
  );

  const handleSearchNext = useCallback(() => {
    if (searchMatches.length === 0) return;
    const next = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(next);
    goToMatch(next);
  }, [currentMatchIndex, goToMatch, searchMatches.length]);

  const handleSearchPrev = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prev = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prev);
    goToMatch(prev);
  }, [currentMatchIndex, goToMatch, searchMatches.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === 'Escape' && searchOpen) {
        closeSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeSearch, searchOpen]);

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

  const handleScroll = useCallback(() => {
    const el = listApiRef.current?.element;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distanceFromBottom > SCROLL_THRESHOLD_PX);
  }, []);

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
    (id: string, requiredTier: RequiredTier, recoveryAction: PaywallRecoveryAction) =>
      onPaywallUpgrade?.(id, requiredTier, recoveryAction),
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
      currentTier,
      onRegenerate: handleRegenerate,
      onRetryResearch,
      onResearchPlanDecision,
      retryingResearchMessageId,
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
      onResumeVideo,
      onRetryVideo,
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
      onRetryResearch,
      onResearchPlanDecision,
      retryingResearchMessageId,
      isReadAloudSupported,
      isSpeaking,
      onBranch,
      onPin,
      onRegenerateImage,
      onResumeVideo,
      onRetryVideo,
      onSwitchBranch,
      speakingMessageId,
      currentTier,
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
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
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
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ComposerFeedbackDialog
                variant="safety-appeal"
                conversationId={conversationId}
                messageId={lastMessage.id}
                finishReason={
                  (
                    lastMessage.metadata as
                      | { finishReason?: 'refusal' | 'content_filter' }
                      | undefined
                  )?.finishReason
                }
              />
              {onRegenerate && (
                <button
                  type="button"
                  onClick={() => onRegenerate(lastMessage.id)}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted"
                  aria-label="Regenerate this response"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showIncompleteTurnNotice && lastMessage && (
        <div className="px-4 pt-1 md:px-12 lg:px-20">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
            <span>This turn didn&apos;t complete. No response was received.</span>
            <button
              type="button"
              onClick={() => onRegenerate?.(lastMessage.id)}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted"
              aria-label="Retry this turn"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
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

  if (messages.length === 0 && !isLoading) {
    return (
      <div
        className={cn('relative flex h-full flex-col items-center justify-center', className)}
        data-testid="chat-message-list"
      >
        <GreetingBanner />
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
      {searchOpen && (
        <MessageSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          totalMatches={searchMatches.length}
          currentMatchIndex={currentMatchIndex}
          onNext={handleSearchNext}
          onPrev={handleSearchPrev}
          onClose={closeSearch}
        />
      )}
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

export const ChatMessageList = memo(ChatMessageListComponent, (prev, next) => {
  return (
    prev.conversationId === next.conversationId &&
    prev.currentTier === next.currentTier &&
    prev.messages.length === next.messages.length &&
    prev.isLoading === next.isLoading &&
    prev.isUserTyping === next.isUserTyping &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onRetryResearch === next.onRetryResearch &&
    prev.onResearchPlanDecision === next.onResearchPlanDecision &&
    prev.retryingResearchMessageId === next.retryingResearchMessageId &&
    prev.onContinue === next.onContinue &&
    prev.onDelete === next.onDelete &&
    prev.onReact === next.onReact &&
    prev.onRegenerateImage === next.onRegenerateImage &&
    prev.onResumeVideo === next.onResumeVideo &&
    prev.onRetryVideo === next.onRetryVideo &&
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
    prev.messages.every((prevMessage, index) => {
      const nextMessage = next.messages[index];
      if (!nextMessage) return false;
      return messageRenderEqual(prevMessage, nextMessage);
    })
  );
});

ChatMessageList.displayName = 'ChatMessageList';

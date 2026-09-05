'use client';

import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  memo,
} from 'react';
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
import type { VariantInfo, VariantInfoByMessageId } from '@/features/chat/lib/messageThread';
import type { WebChatMessageMetadata } from '../../types/message-metadata';
import type { ImageAspectRatio } from '../Composer/ChatComposerNew';
import { MessageBubble, type RegenerateModelOption } from './MessageBubble';
import { openModelPicker } from '@features/chat/lib/model-picker-trigger';
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
import { TranscriptNotice } from './TranscriptNotice';
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  RefreshCw,
  ShieldAlert,
  Square,
} from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';
import { useTTS } from '@/lib/hooks/useTTS';
import {
  isMessageContinuable,
  hasStreamError,
  hasVisibleContent,
  getStreamErrorMessage,
} from '../../lib/continue-generation';

/**
 * A safety refusal: the provider's safety layer stopped the response.
 * Reaches this surface as `metadata.finishReason` 'refusal' (the canonical
 * StreamChunkStop member, emitted on the legacy web wire as the literal
 * reason) or 'content_filter' (the OpenAI wire vocabulary on the
 * passthrough path). Distinct from streamError (transport/provider failure)
 * and from continuable truncation, it gets its own honest notice, never a
 * generic error and never a silent stop.
 */
function isRefusalFinish(message: ChatMessage | undefined | null): boolean {
  const reason = (message?.metadata as { finishReason?: unknown } | undefined)?.finishReason;
  return reason === 'refusal' || reason === 'content_filter';
}

/**
 * A user-initiated Stop, not a model or transport failure. Distinct from
 * isIncompleteTurn/hasStreamError so it never borrows their failure wording
 * or styling, see abandonTurn/handleStreamError in useChatStream.ts, which
 * stamp `finishReason: 'stopped'` on abort.
 */
function isStoppedTurn(message: ChatMessage | undefined | null): boolean {
  if (!message || message.role !== 'assistant' || message.isStreaming) return false;
  const reason = (message.metadata as { finishReason?: unknown } | undefined)?.finishReason;
  return reason === 'stopped';
}

/**
 * A turn that never produced a usable assistant reply: either the user's
 * message is trailing with no assistant row after it (a managed-cloud turn
 * dropped before any row was persisted), or the assistant row exists but is
 * marked truncated/error by the server marker or a web-composer error row.
 * Distinct from streamError (additive mid-stream failure with partial content)
 * and refusal, it gets an explicit "didn't complete" affordance with Retry.
 */
function isIncompleteTurn(message: ChatMessage | undefined | null): boolean {
  if (!message) return false;
  if (message.role === 'user') return true;
  if (message.role !== 'assistant') return false;
  if (message.error) return true;
  return (message.metadata as { truncated?: unknown } | undefined)?.truncated === true;
}

type IncompleteTurnCause =
  | 'rateLimit'
  | 'providerOutage'
  | 'timeout'
  | 'modelRestriction'
  | 'emptyResponse';

const INCOMPLETE_TURN_CAUSE_BY_ERROR_CODE: Readonly<Record<string, IncompleteTurnCause>> = {
  provider_rate_limited: 'rateLimit',
  provider_quota_exhausted: 'rateLimit',
  provider_overloaded: 'providerOutage',
  provider_unreachable: 'providerOutage',
  provider_error: 'providerOutage',
  provider_billing_exhausted: 'providerOutage',
  provider_credentials_rejected: 'providerOutage',
  provider_paused_turn: 'providerOutage',
  provider_timeout: 'timeout',
  model_not_found: 'modelRestriction',
  context_length_exceeded: 'modelRestriction',
  attachment_too_large: 'modelRestriction',
  tool_call_invalid: 'modelRestriction',
};

const INCOMPLETE_TURN_MESSAGE_BY_CAUSE: Readonly<Record<IncompleteTurnCause, string>> = {
  rateLimit:
    'This model is receiving too many requests right now. Wait a moment and retry, or choose Auto to use another available model.',
  providerOutage:
    'The model provider is temporarily unreachable. Retry, or choose Auto to use another available model.',
  timeout:
    'The model took too long to respond. Retry, or pick a faster model from the model picker.',
  modelRestriction:
    'The selected model could not complete this request. Retry, or choose a different model.',
  emptyResponse: 'The model returned no response for this turn. Retry, or rephrase your message.',
};

export const INCOMPLETE_TURN_DEFAULT_MESSAGE =
  "This turn didn't complete. No response was received.";

export function incompleteTurnNoticeMessage(message: ChatMessage | undefined | null): string {
  if (message?.role === 'user') return INCOMPLETE_TURN_MESSAGE_BY_CAUSE.emptyResponse;

  const errorCode = (message?.metadata as { errorCode?: unknown } | undefined)?.errorCode;
  const cause =
    typeof errorCode === 'string' ? INCOMPLETE_TURN_CAUSE_BY_ERROR_CODE[errorCode] : undefined;
  if (cause) return INCOMPLETE_TURN_MESSAGE_BY_CAUSE[cause];

  const truncated = (message?.metadata as { truncated?: unknown } | undefined)?.truncated === true;
  if (truncated && !hasVisibleContent(message?.content)) {
    return INCOMPLETE_TURN_MESSAGE_BY_CAUSE.emptyResponse;
  }

  return INCOMPLETE_TURN_DEFAULT_MESSAGE;
}

export const INCOMPLETE_TURN_GRACE_MS = 45_000;

export function isWithinIncompleteTurnGracePeriod(
  message: ChatMessage | undefined | null,
  nowMs: number,
): boolean {
  if (!message || message.role !== 'user' || !message.createdAt) return false;
  const sentAtMs = new Date(message.createdAt).getTime();
  if (Number.isNaN(sentAtMs)) return false;
  return nowMs - sentAtMs < INCOMPLETE_TURN_GRACE_MS;
}

const STREAM_ERROR_CONNECTION_DETAIL = 'the connection to the model was interrupted.';

/**
 * The detail on its own. The row that carries it already leads with the run's
 * own status, so repeating "No response was returned" there would say the same
 * thing twice in one line.
 */
function streamErrorReason(message: ChatMessage): string {
  return getStreamErrorMessage(message) ?? STREAM_ERROR_CONNECTION_DETAIL;
}

const TURN_NOTICE_LINK_CLASS =
  'flex min-h-6 min-w-6 shrink-0 items-center rounded-md px-2 py-1 font-medium text-foreground underline-offset-2 transition-colors hover:bg-muted hover:underline';
const SWITCH_MODEL_ACTION_LABEL = 'Switch model';
const SWITCH_MODEL_ACTION_ARIA = 'Open the model picker';
const RETRY_ACTION_LABEL = 'Retry';
const RETRY_ACTION_ARIA = 'Regenerate this response';

const MODEL_SWITCH_WORTHY_STREAM_ERROR_CODES = new Set([
  'provider_quota_exhausted',
  'provider_overloaded',
  'provider_unreachable',
  'provider_error',
  'model_not_found',
]);

function streamErrorNeedsModelSwitch(message: ChatMessage): boolean {
  const streamError = (message.metadata as { streamError?: unknown } | undefined)?.streamError;
  const code =
    streamError && typeof streamError === 'object'
      ? (streamError as { code?: unknown }).code
      : undefined;
  return typeof code === 'string' && MODEL_SWITCH_WORTHY_STREAM_ERROR_CODES.has(code);
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
  onDeleteVariant?: (messageId: string) => void;
  countVariantFollowers?: (messageId: string) => number;
  onReact?: (messageId: string, reactionType: 'up' | 'down' | null) => void;
  onPin?: (messageId: string) => void;
  branchGroupsByMessageId?: Readonly<Record<string, MessageBranchGroup>>;
  branchingMessageId?: string | null;
  onBranch?: (messageId: string) => void;
  onSwitchBranch?: (conversationId: string) => void;
  /** Pager state per visible message; empty for a conversation with no variants. */
  variantInfoByMessageId?: VariantInfoByMessageId;
  onSelectVariant?: (messageId: string) => void;
  /**
   * The row the visible path ends at. Folded into the virtualization key because
   * react-window v2 caches measured heights BY INDEX with no partial
   * invalidation: after a switch, index 4 is a different message of a different
   * height, and the cached value would place every row below it wrong.
   */
  activeLeafId?: string | null;
  /**
   * The sibling the reader just paged to. Its group is scrolled into view on a
   * leaf change instead of the transcript jumping to the bottom, the reader is
   * comparing answers at the branch point, not following a new one.
   */
  variantAnchorMessageId?: string | null;
  isConversationStreaming?: boolean;
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
  enableFollowUpSuggestions?: boolean;
  onRegenerateWithModel?: (messageId: string, modelId: string) => void;
  regenerateModelOptions?: ReadonlyArray<RegenerateModelOption>;
  /**
   * The reason the turn failed, owned by the send path rather than derived from
   * the transcript. One failure gets one notice, and this is the surface that
   * carries it: a page-level banner beside it said the same thing twice.
   */
  turnError?: string | null;
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

/**
 * Whether an index in the transcript now holds a different message than it did.
 *
 * react-window v2 caches measured row heights BY INDEX and offers no partial
 * invalidation, so the only lever is the key that throws the whole cache away.
 * and it has to be pulled exactly when an index changes meaning. Paging to
 * another variant does that; appending the next turn does not, and keying on the
 * active leaf alone would re-measure the entire transcript on every send once a
 * conversation had branched even once.
 */
export function isPathReRooted(previous: ChatMessage[], next: ChatMessage[]): boolean {
  if (previous.length > next.length) return true;
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index]?.id !== next[index]?.id) return true;
  }
  return false;
}

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
  onDeleteVariant?: (id: string) => void;
  countVariantFollowers?: (id: string) => number;
  onReact?: (id: string, reactionType: 'up' | 'down' | null) => void;
  onPin?: (id: string) => void;
  branchGroupsByMessageId?: Readonly<Record<string, MessageBranchGroup>>;
  branchingMessageId?: string | null;
  onBranch?: (messageId: string) => void;
  onSwitchBranch?: (conversationId: string) => void;
  variantInfoByMessageId?: VariantInfoByMessageId;
  onSelectVariant?: (messageId: string) => void;
  isConversationStreaming: boolean;
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
  onRegenerateWithModel?: (messageId: string, modelId: string) => void;
  regenerateModelOptions?: ReadonlyArray<RegenerateModelOption>;
  /** Attached to the last assistant turn only; see MessageBubble.turnFailureReason. */
  lastTurnFailureReason?: string;
  lastTurnFailureActions?: React.ReactNode;
}

interface MessageRowProps {
  message: ChatMessage;
  isLastMessage?: boolean;
  lastTurnFailureReason?: string;
  lastTurnFailureActions?: React.ReactNode;
  currentTier: UserTier;
  onRegenerate?: (id: string) => void;
  onRetryResearch?: (id: string) => void;
  onResearchPlanDecision?: (id: string, decision: ResearchPlanDecision) => void;
  retryingResearchMessageId?: string | null;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDeleteVariant?: (id: string) => void;
  countVariantFollowers?: (id: string) => number;
  onReact?: (id: string, reactionType: 'up' | 'down' | null) => void;
  onPin?: (id: string) => void;
  branchGroup?: MessageBranchGroup;
  isBranching: boolean;
  onBranch?: (messageId: string) => void;
  onSwitchBranch?: (conversationId: string) => void;
  variantInfo?: VariantInfo;
  onSelectVariant?: (messageId: string) => void;
  isConversationStreaming: boolean;
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
  onRegenerateWithModel?: (messageId: string, modelId: string) => void;
  regenerateModelOptions?: ReadonlyArray<RegenerateModelOption>;
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

const MESSAGE_ROW_MESSAGE_KEY = 'message';

function messageRowPropsEqual(prev: MessageRowProps, next: MessageRowProps): boolean {
  if (!messageRenderEqual(prev.message, next.message)) return false;
  const keys = Object.keys(next) as Array<keyof MessageRowProps>;
  if (keys.length !== Object.keys(prev).length) return false;
  return keys.every((key) => key === MESSAGE_ROW_MESSAGE_KEY || prev[key] === next[key]);
}

const MessageRow = memo(function MessageRow({
  message,
  isLastMessage,
  lastTurnFailureReason,
  lastTurnFailureActions,
  currentTier,
  onRegenerate,
  onRetryResearch,
  onResearchPlanDecision,
  retryingResearchMessageId,
  onEdit,
  onDelete,
  onDeleteVariant,
  countVariantFollowers,
  onReact,
  onPin,
  branchGroup,
  isBranching,
  onBranch,
  onSwitchBranch,
  variantInfo,
  onSelectVariant,
  isConversationStreaming,
  onPaywallUpgrade,
  onPaywallDismiss,
  onRegenerateImage,
  onResumeVideo,
  onRetryVideo,
  speakingMessageId,
  isReadAloudSupported,
  onReadAloud,
  onRegenerateWithModel,
  regenerateModelOptions,
}: MessageRowProps) {
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
  // Retry is the whole point of this variant, so it is offered only where the
  // transcript can actually resend, `handleRegenerate` resolves the user turn
  // behind this row and replays it, the same path the retry affordance uses.
  // Without a resend the card falls back to the ordinary refusal rather than
  // rendering a button that does nothing.
  const freeCapacityRecovery = useMemo(
    () =>
      paywall?.freeCapacity && onRegenerate
        ? { ...paywall.freeCapacity, onRetry: handleRegenerate }
        : undefined,
    [paywall?.freeCapacity, onRegenerate, handleRegenerate],
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
    // transcript's column too. Rendered bare it spanned the full surface.
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
              {...(freeCapacityRecovery ? { freeCapacity: freeCapacityRecovery } : {})}
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
      onDeleteVariant={onDeleteVariant}
      countVariantFollowers={countVariantFollowers}
      onReact={onReact && displayRole === 'assistant' ? onReact : undefined}
      onPin={onPin}
      onBranch={onBranch ? handleBranch : undefined}
      isBranching={isBranching}
      branchNavigation={branchNavigation}
      variantInfo={variantInfo}
      onSelectVariant={onSelectVariant}
      isConversationStreaming={isConversationStreaming}
      onRegenerateImage={onRegenerateImage ? handleRegenerateImage : undefined}
      onResumeVideo={onResumeVideo}
      onRetryVideo={onRetryVideo}
      onReadAloud={displayRole === 'assistant' ? onReadAloud : undefined}
      isReadingAloud={speakingMessageId === message.id}
      isReadAloudSupported={isReadAloudSupported}
      isLatestTurn={displayRole === 'assistant' && Boolean(isLastMessage)}
      {...(displayRole === 'assistant' && isLastMessage && lastTurnFailureReason
        ? { turnFailureReason: lastTurnFailureReason }
        : {})}
      {...(displayRole === 'assistant' && isLastMessage && lastTurnFailureActions
        ? { turnFailureActions: lastTurnFailureActions }
        : {})}
      onRegenerateWithModel={
        onRegenerateWithModel && displayRole === 'assistant' ? onRegenerateWithModel : undefined
      }
      regenerateModelOptions={regenerateModelOptions}
    />
  );
}, messageRowPropsEqual);

function groupContentEqual(
  prev: MessageGroup | undefined,
  next: MessageGroup | undefined,
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  return (
    prev.firstId === next.firstId &&
    prev.messages.length === next.messages.length &&
    prev.messages.every((prevMessage, index) => {
      const nextMessage = next.messages[index];
      if (!nextMessage) return false;
      return messageRenderEqual(prevMessage, nextMessage);
    })
  );
}

const MessageGroupRow = memo(
  ({
    group,
    isLastGroup,
    currentTier,
    onRegenerate,
    onRetryResearch,
    onResearchPlanDecision,
    retryingResearchMessageId,
    onEdit,
    onDelete,
    onDeleteVariant,
    countVariantFollowers,
    onReact,
    onPin,
    branchGroupsByMessageId,
    branchingMessageId,
    onBranch,
    onSwitchBranch,
    variantInfoByMessageId,
    onSelectVariant,
    isConversationStreaming,
    onPaywallUpgrade,
    onPaywallDismiss,
    onRegenerateImage,
    onResumeVideo,
    onRetryVideo,
    speakingMessageId,
    isReadAloudSupported,
    onReadAloud,
    onRegenerateWithModel,
    regenerateModelOptions,
    lastTurnFailureReason,
    lastTurnFailureActions,
  }: MessageGroupRowProps) => {
    return (
      <div
        className={cn('message-group', group.role === 'user' ? 'user-group' : 'assistant-group')}
      >
        {group.messages.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            isLastMessage={isLastGroup && index === group.messages.length - 1}
            {...(isLastGroup && index === group.messages.length - 1
              ? { lastTurnFailureReason, lastTurnFailureActions }
              : {})}
            currentTier={currentTier}
            onRegenerate={onRegenerate}
            onRetryResearch={onRetryResearch}
            onResearchPlanDecision={onResearchPlanDecision}
            retryingResearchMessageId={retryingResearchMessageId}
            onEdit={onEdit}
            onDelete={onDelete}
            onDeleteVariant={onDeleteVariant}
            countVariantFollowers={countVariantFollowers}
            onReact={onReact}
            onPin={onPin}
            branchGroup={branchGroupsByMessageId?.[message.id]}
            isBranching={branchingMessageId === message.id}
            onBranch={onBranch}
            onSwitchBranch={onSwitchBranch}
            variantInfo={variantInfoByMessageId?.[message.id]}
            onSelectVariant={onSelectVariant}
            isConversationStreaming={isConversationStreaming}
            onPaywallUpgrade={onPaywallUpgrade}
            onPaywallDismiss={onPaywallDismiss}
            onRegenerateImage={onRegenerateImage}
            onResumeVideo={onResumeVideo}
            onRetryVideo={onRetryVideo}
            speakingMessageId={speakingMessageId}
            isReadAloudSupported={isReadAloudSupported}
            onReadAloud={onReadAloud}
            onRegenerateWithModel={onRegenerateWithModel}
            regenerateModelOptions={regenerateModelOptions}
          />
        ))}
      </div>
    );
  },
  (prev, next) => {
    return (
      groupContentEqual(prev.group, next.group) &&
      prev.isLastGroup === next.isLastGroup &&
      prev.currentTier === next.currentTier &&
      prev.onRegenerate === next.onRegenerate &&
      prev.onRetryResearch === next.onRetryResearch &&
      prev.onResearchPlanDecision === next.onResearchPlanDecision &&
      prev.retryingResearchMessageId === next.retryingResearchMessageId &&
      prev.onEdit === next.onEdit &&
      prev.onDelete === next.onDelete &&
      prev.onDeleteVariant === next.onDeleteVariant &&
      prev.countVariantFollowers === next.countVariantFollowers &&
      prev.onReact === next.onReact &&
      prev.onPin === next.onPin &&
      prev.branchGroupsByMessageId === next.branchGroupsByMessageId &&
      prev.branchingMessageId === next.branchingMessageId &&
      prev.onBranch === next.onBranch &&
      prev.onSwitchBranch === next.onSwitchBranch &&
      // BUG-27/BUG-28 class: an omitted prop is an update this comparator
      // silently swallows. The page holds the map's identity stable while only
      // its content is unchanged, so comparing by reference is enough here and
      // still catches the regenerate that turns 1/1 into 2/2.
      prev.variantInfoByMessageId === next.variantInfoByMessageId &&
      prev.onSelectVariant === next.onSelectVariant &&
      prev.isConversationStreaming === next.isConversationStreaming &&
      prev.onPaywallUpgrade === next.onPaywallUpgrade &&
      prev.onPaywallDismiss === next.onPaywallDismiss &&
      prev.onRegenerateImage === next.onRegenerateImage &&
      prev.onResumeVideo === next.onResumeVideo &&
      prev.onRetryVideo === next.onRetryVideo &&
      prev.speakingMessageId === next.speakingMessageId &&
      prev.isReadAloudSupported === next.isReadAloudSupported &&
      prev.onReadAloud === next.onReadAloud &&
      prev.onRegenerateWithModel === next.onRegenerateWithModel &&
      prev.regenerateModelOptions === next.regenerateModelOptions
    );
  },
);
MessageGroupRow.displayName = 'MessageGroupRow';

interface VirtualizedTranscriptRowData {
  groups: MessageGroup[];
  groupProps: Omit<MessageGroupRowProps, 'group' | 'isLastGroup'>;
  topSpacerHeight: number;
  footer: React.ReactNode;
}

type TranscriptRowComponent = (
  props: RowComponentProps<VirtualizedTranscriptRowData>,
) => React.ReactElement | null;

function shallowEqualRecord<T extends object>(prev: T | undefined, next: T | undefined): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  const keys = Object.keys(prev) as Array<keyof T>;
  if (keys.length !== Object.keys(next).length) return false;
  return keys.every((key) => Object.is(prev[key], next[key]));
}

function transcriptRowPropsEqual(
  prev: RowComponentProps<VirtualizedTranscriptRowData>,
  next: RowComponentProps<VirtualizedTranscriptRowData>,
): boolean {
  if (prev.index !== next.index) return false;
  if (!shallowEqualRecord(prev.style, next.style)) return false;
  if (!shallowEqualRecord(prev.ariaAttributes, next.ariaAttributes)) return false;
  if (prev.topSpacerHeight !== next.topSpacerHeight) return false;
  if (prev.footer !== next.footer) return false;
  if (prev.groupProps !== next.groupProps) return false;

  return groupContentEqual(prev.groups[next.index - 1], next.groups[next.index - 1]);
}

const VirtualizedTranscriptRow = memo(function VirtualizedTranscriptRow({
  index,
  style,
  ariaAttributes,
  groups,
  groupProps,
  topSpacerHeight,
  footer,
}: RowComponentProps<VirtualizedTranscriptRowData>) {
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

  return (
    <div {...ariaAttributes} style={style}>
      <MessageGroupRow
        group={group}
        isLastGroup={groupIndex === groups.length - 1}
        {...groupProps}
      />
    </div>
  );
}, transcriptRowPropsEqual);
VirtualizedTranscriptRow.displayName = 'VirtualizedTranscriptRow';

const FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT = false;

const SCROLL_THRESHOLD_PX = 120;
const ANCHOR_SETTLE_TIMEOUT_MS = 1000;
const DEFAULT_TRANSCRIPT_ROW_HEIGHT = 160;
const DEFAULT_TRANSCRIPT_VIEWPORT_HEIGHT = 640;
const TRANSCRIPT_SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

function readAgentActivityStatus(message: ChatMessage | undefined | null): unknown {
  const activity = message?.metadata?.['agentActivity'];
  return activity && typeof activity === 'object' && 'status' in activity
    ? (activity as { status?: unknown }).status
    : undefined;
}

export function buildStreamAnnouncement(message: ChatMessage | undefined): string {
  // Reached when a turn ends without ever producing an assistant message - a
  // rate limit, a rejected request, a dropped connection. Announcing the
  // default here told a screen-reader user the response was complete when
  // nothing had been written at all.
  if (!message || message.role !== 'assistant') return 'No response was generated';
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
  onDeleteVariant,
  countVariantFollowers,
  onReact,
  onPin,
  branchGroupsByMessageId,
  branchingMessageId = null,
  onBranch,
  onSwitchBranch,
  variantInfoByMessageId,
  onSelectVariant,
  activeLeafId = null,
  variantAnchorMessageId = null,
  isConversationStreaming = false,
  onRegenerateImage,
  onResumeVideo,
  onRetryVideo,
  onSendMessage,
  isUserTyping = false,
  className,
  onPaywallUpgrade,
  onPaywallDismiss,
  enableFollowUpSuggestions = FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT,
  onRegenerateWithModel,
  regenerateModelOptions,
  turnError = null,
}: ChatMessageListProps) => {
  const listApiRef = useRef<ListImperativeAPI | null>(null);
  const reportedTurnError = turnError?.trim() ? turnError.trim() : null;
  const { isSpeaking, isSupported: isReadAloudSupported, speak, stop } = useTTS();
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const scrolledConversationRef = useRef<string | null>(conversationId);
  const scrolledLeafRef = useRef<string | null>(activeLeafId);
  const lastUserMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (scrolledConversationRef.current === conversationId) return;
    scrolledConversationRef.current = conversationId;
    // Opening a chat lands at the bottom, so the leaf it arrives with is not a
    // switch. Adopting it here, before the scroll effect below runs, which
    // effect order guarantees, is what keeps the two apart.
    scrolledLeafRef.current = activeLeafId;
    setUserScrolledUp(false);
  }, [activeLeafId, conversationId]);

  const prefersReducedMotion = useReducedMotion();

  const groups = useMemo(() => groupMessages(messages), [messages]);

  const renderedPathRef = useRef<ChatMessage[]>(messages);
  const pathEpochRef = useRef(0);
  if (renderedPathRef.current !== messages) {
    if (isPathReRooted(renderedPathRef.current, messages)) pathEpochRef.current += 1;
    renderedPathRef.current = messages;
  }
  const virtualizationKey = `${conversationId ?? groups[0]?.firstId ?? 'empty-transcript'}:${pathEpochRef.current}`;
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_TRANSCRIPT_ROW_HEIGHT,
    key: virtualizationKey,
  });
  const virtualRowCount = groups.length + 2;
  const virtualRowCountRef = useRef(virtualRowCount);
  virtualRowCountRef.current = virtualRowCount;
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

  const lastUserMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate?.role === 'user') return candidate.id;
    }
    return null;
  }, [messages]);

  const [pastIncompleteTurnGrace, setPastIncompleteTurnGrace] = useState(
    () => !isWithinIncompleteTurnGracePeriod(lastMessage, Date.now()),
  );
  useEffect(() => {
    const createdAt = lastMessage?.createdAt;
    const withinGrace = lastMessage
      ? isWithinIncompleteTurnGracePeriod(lastMessage, Date.now())
      : false;
    if (!withinGrace || !createdAt) {
      setPastIncompleteTurnGrace(true);
      return;
    }
    setPastIncompleteTurnGrace(false);
    const sentAtMs = new Date(createdAt).getTime();
    const remainingMs = INCOMPLETE_TURN_GRACE_MS - (Date.now() - sentAtMs);
    const timer = setTimeout(() => setPastIncompleteTurnGrace(true), Math.max(0, remainingMs));
    return () => clearTimeout(timer);
  }, [lastMessage]);

  const lastMessageFingerprint = useMemo(
    () => (lastMessage ? `${lastMessage.id}-${lastMessage.content.length}` : ''),
    [lastMessage],
  );

  const showTypingIndicator = isLoading && messages.length > 0 && !lastMessage?.isStreaming;

  // A user Stop is not a truncation to keep appending to (Continue) -- it
  // routes to its own notice below instead, offering Try again.
  const showContinue = Boolean(
    onContinue && !isLoading && !isStoppedTurn(lastMessage) && isMessageContinuable(lastMessage),
  );

  /**
   * User-initiated Stop (see isStoppedTurn): a distinct terminal state from a
   * model or transport failure, so it never reuses their wording or danger
   * styling. Takes priority over the other notices for the same message --
   * an aborted stream leaves no stream-error, refusal or truncation marker of
   * its own, but checks explicitly rather than relying on that.
   */
  const showStoppedNotice = Boolean(onRegenerate && !isLoading && isStoppedTurn(lastMessage));

  /**
   * Mid-stream provider failure (additive `x_stream_error`, see
   * hasStreamError's doc comment): the turn otherwise looks like a clean
   * completion, so this is the ONLY signal that tells the user their answer
   * may be cut off for a reason other than the model finishing normally.
   * Offered only on the last message, only once streaming has actually
   * stopped (unlike isMessageContinuable, hasStreamError does not check
   * isStreaming itself, it stays a pure metadata read, so this checks it
   * explicitly, same safety bar), and mutually exclusive with Continue (a
   * turn that failed mid-stream never lands on a continuable finish_reason
   * in practice, but guard explicitly rather than relying on that).
   */
  const showStreamErrorNotice = Boolean(
    onRegenerate &&
    !isLoading &&
    !lastMessage?.isStreaming &&
    !showContinue &&
    !showStoppedNotice &&
    hasStreamError(lastMessage),
  );

  /**
   * Safety refusal notice (see isRefusalFinish): the provider declined to
   * finish the response. Shown on the last assistant message once streaming
   * has stopped; mutually exclusive with Continue and the stream-error
   * notice. Unlike the stream-error notice it does not require onRegenerate
   *, the honest "declined" state must render regardless; the Retry action
   * inside it is conditional.
   */
  const showRefusalNotice = Boolean(
    !isLoading &&
    !lastMessage?.isStreaming &&
    lastMessage?.role === 'assistant' &&
    !showContinue &&
    !showStoppedNotice &&
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
   *
   * `turnError` is the send path reporting a failure it already knows about, so
   * it skips the grace period, which only covers a turn that may still be
   * running long.
   */
  const showIncompleteTurnNotice = Boolean(
    onRegenerate &&
    !isLoading &&
    !lastMessage?.isStreaming &&
    !showContinue &&
    !showStoppedNotice &&
    !showStreamErrorNotice &&
    !showRefusalNotice &&
    (reportedTurnError !== null || isIncompleteTurn(lastMessage)) &&
    (reportedTurnError !== null || lastMessage?.role !== 'user' || pastIncompleteTurnGrace),
  );

  // A turn that failed, was refused, stopped short, or is offering Continue
  // already has its specific next action on screen. Offering "Can you go deeper
  // on one of these points?" underneath "Video generation service is
  // temporarily unavailable" competes with that action and answers a question
  // nobody asked - the suggestions are picked by matching words in the message,
  // so an error message reads to them as an ordinary topic.
  const lastTurnFailed = Boolean(
    lastMessage?.error ||
    showStreamErrorNotice ||
    showRefusalNotice ||
    showIncompleteTurnNotice ||
    showStoppedNotice ||
    showContinue ||
    readAgentActivityStatus(lastMessage) === 'failed',
  );

  const showFollowUps =
    enableFollowUpSuggestions &&
    onSendMessage &&
    !isLoading &&
    lastMessage?.role === 'assistant' &&
    !lastMessage?.isStreaming &&
    lastMessage.content.length > 20 &&
    !lastTurnFailed;

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

  const scrollFrameRef = useRef<number | null>(null);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior>('smooth');
  const anchoringRef = useRef(false);
  const anchorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrollIntentRef = useRef(false);

  const stopAnchoring = useCallback(() => {
    anchoringRef.current = false;
    if (anchorTimerRef.current === null) return;
    clearTimeout(anchorTimerRef.current);
    anchorTimerRef.current = null;
  }, []);

  /**
   * Returning to the live answer is an intent, not a single jump. The rows the
   * reader scrolled past are unmounted, so the list scrolls to where it
   * *estimates* the bottom is; they then mount, measure taller, and the bottom
   * moves further down. Every programmatic scroll-to-bottom arms the same
   * anchor here, so `handleScroll`'s own `scroll` events, native smooth-scroll
   * fires one per animation frame short of the target, never read as the user
   * scrolling away before the target is actually reached.
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const listApi = listApiRef.current;
      const rowCount = virtualRowCountRef.current;
      if (!listApi?.element || rowCount === 0) return;
      anchoringRef.current = true;
      if (anchorTimerRef.current !== null) clearTimeout(anchorTimerRef.current);
      anchorTimerRef.current = setTimeout(stopAnchoring, ANCHOR_SETTLE_TIMEOUT_MS);
      listApi.scrollToRow({
        align: 'end',
        behavior,
        index: rowCount - 1,
      });
    },
    [stopAnchoring],
  );

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

  /**
   * The list's imperative handle exists a render before its underlying
   * element is mounted (react-window populates the ref via a callback-ref
   * state update, one commit behind). A layout effect can land in that gap,
   * so this tries the synchronous path first and only defers through the
   * rAF-coalesced one when the element isn't attached yet.
   */
  const scrollToBottomFast = useCallback(
    (behavior: ScrollBehavior) => {
      if (listApiRef.current?.element) {
        scrollToBottom(behavior);
        return;
      }
      requestScrollToBottom(behavior);
    },
    [scrollToBottom, requestScrollToBottom],
  );

  const followBottom = useCallback(
    (behavior: ScrollBehavior) => {
      setUserScrolledUp(false);
      requestScrollToBottom(behavior);
    },
    [requestScrollToBottom],
  );

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
      stopAnchoring();
    },
    [stopAnchoring],
  );

  const markUserScrollIntent = useCallback(() => {
    userScrollIntentRef.current = true;
  }, []);

  const handleTranscriptKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (TRANSCRIPT_SCROLL_KEYS.has(event.key)) userScrollIntentRef.current = true;
  }, []);

  const handleScroll = useCallback(() => {
    const el = listApiRef.current?.element;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD_PX;
    const userInitiated = userScrollIntentRef.current;
    userScrollIntentRef.current = false;
    if (anchoringRef.current && !userInitiated && !atBottom) return;
    if (anchoringRef.current) stopAnchoring();
    setUserScrolledUp(!atBottom);
  }, [stopAnchoring]);

  const isStreamingNow = Boolean(lastMessage?.isStreaming);
  useLayoutEffect(() => {
    // Paging to another variant is not a new turn arriving, so it must not send
    // the reader to the bottom: they are comparing two answers to the same
    // question, and the place to be is the point where the two differ. A leaf
    // moved by the turn that is streaming stays on the normal path below.
    const leafChanged = scrolledLeafRef.current !== activeLeafId;
    scrolledLeafRef.current = activeLeafId;
    const previousLastUserMessageId = lastUserMessageIdRef.current;
    lastUserMessageIdRef.current = lastUserMessageId;
    const isFreshUserTurn =
      previousLastUserMessageId !== null && previousLastUserMessageId !== lastUserMessageId;
    if (leafChanged && !isStreamingNow && variantAnchorMessageId) {
      const anchorGroupIndex = groups.findIndex((group) =>
        group.messages.some((message) => message.id === variantAnchorMessageId),
      );
      if (anchorGroupIndex >= 0) {
        listApiRef.current?.scrollToRow({
          align: 'start',
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          // Row 0 is the top spacer, so a group at index n renders at row n + 1.
          index: anchorGroupIndex + 1,
        });
        return;
      }
    }
    if (userScrolledUp) {
      if (!isFreshUserTurn) return;
      setUserScrolledUp(false);
    }
    const behavior: ScrollBehavior =
      messages.length === 1 || isStreamingNow || prefersReducedMotion ? 'auto' : 'smooth';
    if (behavior === 'auto') {
      scrollToBottomFast('auto');
      return;
    }
    requestScrollToBottom(behavior);
  }, [
    activeLeafId,
    groups,
    variantAnchorMessageId,
    messages.length,
    lastMessage,
    lastUserMessageId,
    lastMessageFingerprint,
    isLoading,
    isStreamingNow,
    prefersReducedMotion,
    userScrolledUp,
    scrollToBottomFast,
    requestScrollToBottom,
    conversationId,
  ]);

  const measuredLayoutRef = useRef({
    contentHeight: estimatedContentHeight,
    messageCount: messages.length,
    viewportHeight,
  });
  useLayoutEffect(() => {
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
    scrollToBottomFast('auto');
  }, [estimatedContentHeight, messages.length, scrollToBottomFast, userScrolledUp, viewportHeight]);

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

  // One failure, one row. The reason rides on the run's own summary line inside
  // the turn and these two links sit beside it, so the transcript never shows a
  // status row and a reason line saying the same thing.
  const lastTurnFailureReason = useMemo<string | undefined>(() => {
    if (!showStreamErrorNotice || !lastMessage) return undefined;
    return streamErrorReason(lastMessage);
  }, [showStreamErrorNotice, lastMessage]);

  const lastTurnFailureActions = useMemo<React.ReactNode>(() => {
    if (!showStreamErrorNotice || !lastMessage) return null;
    return (
      <>
        {streamErrorNeedsModelSwitch(lastMessage) && (
          <button
            type="button"
            onClick={() => openModelPicker()}
            className={TURN_NOTICE_LINK_CLASS}
            aria-label={SWITCH_MODEL_ACTION_ARIA}
          >
            {SWITCH_MODEL_ACTION_LABEL}
          </button>
        )}
        <button
          type="button"
          onClick={() => onRegenerate?.(lastMessage.id)}
          className={TURN_NOTICE_LINK_CLASS}
          aria-label={RETRY_ACTION_ARIA}
        >
          {RETRY_ACTION_LABEL}
        </button>
      </>
    );
  }, [showStreamErrorNotice, lastMessage, onRegenerate]);

  const groupProps = useMemo<Omit<MessageGroupRowProps, 'group' | 'isLastGroup'>>(
    () => ({
      currentTier,
      onRegenerate: handleRegenerate,
      onRetryResearch,
      onResearchPlanDecision,
      retryingResearchMessageId,
      onEdit: handleEdit,
      onDelete: handleDelete,
      onDeleteVariant,
      countVariantFollowers,
      onReact: handleReact,
      onPin,
      branchGroupsByMessageId,
      branchingMessageId,
      onBranch,
      onSwitchBranch,
      variantInfoByMessageId,
      onSelectVariant,
      isConversationStreaming,
      onPaywallUpgrade: handlePaywallUpgrade,
      onPaywallDismiss: handlePaywallDismiss,
      onRegenerateImage: onRegenerateImage ? handleRegenerateImage : undefined,
      onResumeVideo,
      onRetryVideo,
      speakingMessageId: isSpeaking ? speakingMessageId : null,
      isReadAloudSupported,
      onReadAloud: handleReadAloud,
      onRegenerateWithModel,
      regenerateModelOptions,
      lastTurnFailureReason,
      lastTurnFailureActions,
    }),
    [
      branchGroupsByMessageId,
      branchingMessageId,
      countVariantFollowers,
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
      onDeleteVariant,
      onPin,
      onRegenerateImage,
      onResumeVideo,
      onRetryVideo,
      onSwitchBranch,
      variantInfoByMessageId,
      onSelectVariant,
      isConversationStreaming,
      speakingMessageId,
      currentTier,
      onRegenerateWithModel,
      regenerateModelOptions,
      lastTurnFailureReason,
      lastTurnFailureActions,
    ],
  );

  const transcriptFooter = useMemo(
    () => (
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

        {showStoppedNotice && lastMessage && (
          <div className="px-4 pt-1 md:px-12 lg:px-20">
            <TranscriptNotice
              tone="neutral"
              icon={Square}
              message="Response stopped."
              action={{
                label: 'Try again',
                ariaLabel: 'Regenerate this response',
                icon: RefreshCw,
                onClick: () => onRegenerate?.(lastMessage.id),
              }}
            />
          </div>
        )}

        {showRefusalNotice && lastMessage && (
          <div className="px-4 pt-1 md:px-12 lg:px-20">
            <TranscriptNotice
              icon={ShieldAlert}
              message="The model declined to finish this response for safety reasons."
              actionSlot={
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
              }
              action={
                onRegenerate
                  ? {
                      label: 'Retry',
                      ariaLabel: 'Regenerate this response',
                      icon: RefreshCw,
                      onClick: () => onRegenerate(lastMessage.id),
                    }
                  : undefined
              }
            />
          </div>
        )}

        {showIncompleteTurnNotice && lastMessage && (
          <div className="px-4 pt-1 md:px-12 lg:px-20">
            <TranscriptNotice
              tone="danger"
              icon={CircleAlert}
              message={reportedTurnError ?? incompleteTurnNoticeMessage(lastMessage)}
              action={{
                label: 'Retry',
                ariaLabel: 'Retry this turn',
                icon: RefreshCw,
                onClick: () => onRegenerate?.(lastMessage.id),
              }}
            />
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
    ),
    [
      showContinue,
      lastMessage,
      onContinue,
      showStoppedNotice,
      onRegenerate,
      showRefusalNotice,
      conversationId,
      showIncompleteTurnNotice,
      reportedTurnError,
      prefersReducedMotion,
      showTypingIndicator,
      showFollowUps,
      onSendMessage,
      isLoading,
      isUserTyping,
      messages.length,
    ],
  );

  const rowProps = useMemo<VirtualizedTranscriptRowData>(
    () => ({
      groups,
      groupProps,
      topSpacerHeight,
      footer: transcriptFooter,
    }),
    [groups, groupProps, topSpacerHeight, transcriptFooter],
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
          atomic, and carrying one short phrase per generation state change.
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
        rowComponent={VirtualizedTranscriptRow as unknown as TranscriptRowComponent}
        rowCount={virtualRowCount}
        rowHeight={dynamicRowHeight}
        rowProps={rowProps}
        defaultHeight={DEFAULT_TRANSCRIPT_VIEWPORT_HEIGHT}
        overscanCount={6}
        onResize={({ height }) => setViewportHeight(height)}
        role="log"
        aria-live="off"
        aria-busy={isGenerating}
        aria-label="Chat messages"
        onScroll={handleScroll}
        onWheel={markUserScrollIntent}
        onTouchMove={markUserScrollIntent}
        onKeyDown={handleTranscriptKeyDown}
        className="h-full"
      />

      {/* Scroll-to-bottom FAB · shown when user has scrolled up. Its screen
          position is fixed regardless of scroll offset, so the fade behind it
          is load-bearing: without it the circle sits directly on top of
          whatever transcript line happens to be there. */}
      <AnimatePresence>
        {userScrolledUp && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-24 items-end justify-center">
            <div
              className="absolute inset-0 bg-gradient-to-t from-[var(--chat-bg)] via-[var(--chat-bg)]/85 to-transparent"
              aria-hidden="true"
            />
            <div className="pointer-events-auto relative mb-3">
              <ScrollToBottomButton
                onClick={() => followBottom(prefersReducedMotion ? 'auto' : 'smooth')}
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
    prev.onDeleteVariant === next.onDeleteVariant &&
    prev.countVariantFollowers === next.countVariantFollowers &&
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
    prev.variantInfoByMessageId === next.variantInfoByMessageId &&
    prev.onSelectVariant === next.onSelectVariant &&
    prev.activeLeafId === next.activeLeafId &&
    prev.variantAnchorMessageId === next.variantAnchorMessageId &&
    prev.isConversationStreaming === next.isConversationStreaming &&
    prev.enableFollowUpSuggestions === next.enableFollowUpSuggestions &&
    prev.onRegenerateWithModel === next.onRegenerateWithModel &&
    prev.regenerateModelOptions === next.regenerateModelOptions &&
    prev.messages.every((prevMessage, index) => {
      const nextMessage = next.messages[index];
      if (!nextMessage) return false;
      return messageRenderEqual(prevMessage, nextMessage);
    })
  );
});

ChatMessageList.displayName = 'ChatMessageList';

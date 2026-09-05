/**
 * MessageBubble - Clean, minimal message display
 *
 * Redesigned with:
 * - Progressive disclosure (details on hover/click)
 * - Minimal metadata inline
 * - Clean visual hierarchy
 * - Token usage hidden by default
 */

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useConfirm,
} from '@agiworkforce/ui';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@agiworkforce/ui';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  File,
  FileText,
  Flag,
  GitFork,
  ImageOff,
  MoreHorizontal,
  Pencil,
  Pin,
  RefreshCw,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  ZoomIn,
} from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import type { VariantInfo } from '@/features/chat/lib/messageThread';
import {
  ACTION_BUTTON_SIZE,
  ACTION_BUTTON_TONE,
  ACTION_ICON_SIZE,
  ACTION_ICON_SIZE_DESCENDANT,
  ACTION_ROW_MIN_HEIGHT,
} from './messageActionRow';
import { variantDeleteConfirm } from './variantDeleteConfirm';
import { VariantPager } from './VariantPager';
import { toast } from 'sonner';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { TokenUsageDisplay } from '../tokens/TokenUsageDisplay';
import {
  getModelMetadataById,
  providerModeToPrivacyMode,
  type ArtifactManifest,
  type ComputeSession,
  type GeneratedFile,
} from '@agiworkforce/types';
import { describeFallbackReason } from '@/lib/chat-fallback-reason';
import { describeSecretRedactionNotice } from '@/lib/chat-secret-redaction-notice';
import { isFreeRouteLane } from '@/features/chat/lib/routeLane';
import { VoiceActivityAffordance } from '@/features/chat/components/Voice/VoiceActivityAffordance';
import {
  useVoiceModeActive,
  useVoiceSessionStore,
} from '@/features/chat/stores/voice-session-store';
import { TranscriptNotice } from './TranscriptNotice';
import {
  AgentActivityTimeline,
  BranchNavigator,
  getManagedModelPresentationLabel,
  hasCanonicalToolActivity,
  hasStreamError,
  type BranchItem,
} from '@agiworkforce/unified-chat';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

const MarkdownContent = dynamic(
  () => import('@agiworkforce/unified-chat').then((mod) => mod.MarkdownContent),
  {
    loading: () => <div className="h-4 w-32 animate-pulse rounded bg-muted" />,
  },
);

const StreamingMarkdownContent = dynamic(
  () => import('@agiworkforce/unified-chat').then((mod) => mod.StreamingMarkdownContent),
  {
    loading: () => <div className="h-4 w-32 animate-pulse rounded bg-muted" />,
  },
);

import type { ArtifactData } from '../artifacts/ArtifactPreview';
import { InlineArtifactCards } from '../artifacts/InlineArtifactCards';
import {
  extractArtifacts,
  extractCodeBlocks,
  removeArtifactBlocks,
} from '../../utils/artifact-detector';
import {
  extractTrailingUnclosedBlock,
  isRenderableArtifact,
  resolveOriginPrivacyMode,
} from '@agiworkforce/artifacts';
import { getProviderModeForModel } from '../../lib/localByokHandoff';
import { useStreamingArtifactSync } from '../../hooks/use-streaming-artifact';
import { useArtifactsStore, generatedFileArtifactId } from '../../stores/artifacts-store';
import {
  useChatStore,
  selectIsAgiWorkConversation,
  AGI_WORK_MODE,
  type GeneratedFileMetadataEntry,
  type MessageMetadata as StoreMessageMetadata,
} from '@shared/stores/web-chat-store';
import { ComposerFeedbackDialog } from '../Composer/ComposerFeedbackDialog';
import { AGI_WORK_FEEDBACK_LABEL } from '../../lib/agi-work';
import { useToolApprovalResolver, isApprovalTurnLive } from '@/lib/hooks/useChatStream';
import { ToolTimeline, type ToolEntry } from './ToolTimeline';
import type { SearchResponse, SearchResult, MediaGenerationResult } from '../../types/search-media';
import { hasWebSearchSources } from '../../types/message-metadata';
import type { GeneratedDocument } from '../../types/message-metadata';
import { ThinkingBlock } from '../ThinkingBlock';
import { mergeAdjacentThinkingSegments } from '../../lib/mergeThinkingSegments';
import { formatBytes } from '@shared/utils/format';
import { ComparisonResponse } from './ComparisonResponse';
import type { InteractiveCard } from '@agiworkforce/types';
import { InteractiveCardBlock } from './InteractiveCardBlock';
import { useComparisonStore } from '../../stores/comparison-store';
import { SourcesControl } from '../research/ResearchPanel';
import { useResearchPanelStore, type ResearchSource } from '../../stores/research-panel-store';
import { ResearchActivity, type ResearchPlanDecision } from '../research/ResearchActivity';
import {
  stripTrailingSourceList,
  stripTrailingCitationOnlyBlock,
} from '../../lib/researchReportSources';
import type { MessageResearchState } from '@shared/stores/web-chat-store';
import { dedupeResearchSources, orderSourcesByCitation } from '../../utils/research-sources';
import { ImageGenerationCard } from '../ImageGenerationCard';
import { ImageLightbox } from '../ImageLightbox';
import type { ImageAspectRatio } from '../Composer/ChatComposerNew';
import { CodeExecutionBlock } from './CodeExecutionBlock';
import { detectCardType } from '../cards';
import { MessageFormatCard } from '../cards/MessageFormatCard';
import { VideoGenerationPlaceholder } from './VideoGenerationPlaceholder';
import { EditableMessage } from './EditableMessage';

/**
 * Inline user-message editing (CLR-05).
 *
 * ChatGPT parity: clicking Edit on a sent message turns THAT bubble into a
 * pre-filled textarea with Cancel/Save. Web used to prefill the composer at the
 * bottom of the page instead, leaving the original message sitting untouched in
 * the transcript above while you typed somewhere else, and `EditableMessage`,
 * a complete inline editor, sat in this folder with zero importers.
 *
 * Wired the same way tool approval is: a context the chat page mounts, read here
 * via `useContext`, so MessageBubble stays provider-independent and renderable
 * standalone. With no provider the Edit action falls back to whatever `onEdit`
 * the surface passed (the composer-prefill path), so nothing regresses.
 */
export interface MessageInlineEditController {
  /**
   * Guard + permission to open the editor. Returns false when the surface
   * refuses this edit (a turn is streaming, an image turn is mid-save, the free
   * trial is spent), the controller has already told the user why, so the
   * caller must simply not enter edit mode.
   */
  beginEdit: (messageId: string) => boolean;
  /**
   * Resubmit `content` in place of `messageId`. The surface owns the rollback:
   * the edited message and everything after it are replaced only once the new
   * turn is durable.
   */
  submitEdit: (messageId: string, content: string) => void;
}

const MessageInlineEditContext = React.createContext<MessageInlineEditController | null>(null);
export const MessageInlineEditProvider = MessageInlineEditContext.Provider;

/** `null` when no provider is mounted (standalone render / tests). */
export function useMessageInlineEdit(): MessageInlineEditController | null {
  return React.useContext(MessageInlineEditContext);
}

/**
 * Framer-motion variants for message bubble entrance animations.
 * Exported so parent list components can apply staggered entry.
 *
 * Usage in a list:
 *   <motion.div variants={messageListVariants} initial="hidden" animate="visible">
 *     {messages.map((m, i) => (
 *       <MessageBubble key={m.id} message={m} animationIndex={i} />
 *     ))}
 *   </motion.div>
 */
export const messageListVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

export const messageBubbleVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: 'easeOut' },
  },
};

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
}

const MAX_INLINE_GENERATED_TEXT_BYTES = 2 * 1024 * 1024;
const USER_MESSAGE_COLLAPSE_HEIGHT_PX = 320;

function generatedFileLanguage(file: GeneratedFileMetadataEntry): string {
  const extension = file.fileName.toLowerCase().split('.').pop() ?? '';
  if (file.kind === 'image') return extension || 'image';
  const candidate = file.kind === 'other' ? extension : file.kind;
  if (candidate === 'htm') return 'html';
  if (candidate === 'md') return 'markdown';
  if (candidate === 'mmd') return 'mermaid';
  return candidate || 'text';
}

function generatedImageArtifactTitle(prompt?: string): string {
  const normalized = prompt?.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Generated image';
  return normalized.length > 80 ? `${normalized.slice(0, 77).trimEnd()}…` : normalized;
}

function generatedFileArtifactType(file: GeneratedFileMetadataEntry): ArtifactData['type'] {
  const language = generatedFileLanguage(file);
  if (language === 'html') return 'html';
  if (language === 'svg') return 'svg';
  if (language === 'mermaid') return 'mermaid';
  if (language === 'csv' || language === 'tsv') return 'csv';
  if (language === 'markdown' || language === 'txt' || language === 'text') return 'document';
  return 'code';
}

/**
 * AUDIT-FIX BUG-31: close a trailing unterminated code fence.
 *
 * The artifact path already strips a growing unclosed block from the chat body
 * (see `cleanedContent`), but that only covers RENDERABLE artifact languages.
 * For every other language: python, sql, a bare fence with no info string.
 * the partial buffer reached the markdown renderer with an open fence. micromark
 * tolerates it, but the block renders unstyled (no `language-*` class, so no
 * highlighting) and the whole tail is re-lexed on every token.
 *
 * Appending the closing fence is a pure display repair: it never mutates the
 * stored message, and it is a no-op when the fence is already closed.
 */
function closeUnterminatedFence(markdown: string): string {
  if (!extractTrailingUnclosedBlock(markdown)) return markdown;
  return markdown + (markdown.endsWith('\n') ? '' : '\n') + '```';
}

function isGeneratedTextArtifact(file: GeneratedFileMetadataEntry): boolean {
  if (file.previewable === false) return false;
  if (file.surface === 'artifact') return true;
  if (file.kind === 'csv') return true;

  // Backward-compatible fallback for descriptors emitted before `surface`
  // became mandatory on the shared generated-file contract.
  const language = generatedFileLanguage(file);
  return (
    ['html', 'svg', 'markdown', 'mermaid', 'json', 'txt', 'text'].includes(language) ||
    file.mimeType.toLowerCase().startsWith('text/')
  );
}

const PROVIDER_MODE_BY_PRIVACY_MODE = {
  local: 'Local',
  byok: 'DirectByok',
  managed: 'ManagedGateway',
} as const satisfies Record<
  NonNullable<StoreMessageMetadata['privacyMode']>,
  GeneratedFile['providerMode']
>;

/**
 * SECURITY-FIX F3 (CWE-863): generated-file descriptors used to be stamped
 * `managed`/`ManagedGateway` unconditionally, so a file produced in a Local or
 * BYOK turn rendered a "Managed" privacy chip, the label the user relies on to
 * know where the bytes went, and the Artifacts panel then read that fabricated
 * label back as the artifact's origin. Only the Local→BYOK handoff writes
 * `metadata.privacyMode`, so the boundary is derived from every signal the turn
 * really carries: its declared labels, then the model that served it. `managed`
 * survives only as the display fallback for a turn with no signal at all;
 * `resolveArtifactOriginPrivacyMode` refuses to treat it as origin evidence.
 */
function messageTrustBoundary(
  metadata: Message['metadata'],
  model: string | undefined,
  conversationModel: string | null | undefined,
): {
  privacyMode: GeneratedFile['privacyMode'];
  providerMode: GeneratedFile['providerMode'];
} {
  const privacyMode =
    resolveOriginPrivacyMode([
      metadata?.privacyMode,
      metadata?.providerMode,
      getProviderModeForModel(model ?? metadata?.model),
      getProviderModeForModel(conversationModel),
    ]) ?? 'managed';
  const declared = metadata?.providerMode;
  return {
    privacyMode,
    providerMode:
      declared && providerModeToPrivacyMode(declared) === privacyMode
        ? declared
        : PROVIDER_MODE_BY_PRIVACY_MODE[privacyMode],
  };
}

interface Message {
  id: string;
  sessionId?: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  /** Provider/model string set by useChatStream (for example, `provider/model-id`). */
  model?: string;
  employeeId?: string;
  employeeName?: string;
  employeeAvatar?: string;
  employeeColor?: string;
  isStreaming?: boolean;
  reactions?: Array<{ type: string; userId: string }>;
  attachments?: Attachment[];
  metadata?: {
    /** Trust-boundary labels persisted with the turn (Local/BYOK handoff evidence). */
    privacyMode?: StoreMessageMetadata['privacyMode'];
    providerMode?: StoreMessageMetadata['providerMode'];
    finishReason?: StoreMessageMetadata['finishReason'];
    streamError?: StoreMessageMetadata['streamError'];
    isDocument?: boolean;
    documentTitle?: string;
    hasWorkStream?: boolean;
    workStreamData?: Record<string, unknown>;
    isPinned?: boolean;
    tokensUsed?: number;
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    /** `X-AGI-Fallback-Reason` code for a turn served on a substituted model. */
    fallbackReason?: string;
    /** `X-AGI-Route-Lane` value naming the lane that served this turn. */
    routeLane?: string;
    secretRedactionCount?: number;
    provider?: string;
    cost?: number;
    reasoningTokens?: number;
    cachedInputTokens?: number;
    totalDurationMs?: number;
    selectionReason?: string;
    thinkingSteps?: string[];
    /** Raw extended thinking text (used by ThinkingBlock) */
    thinkingContent?: string;
    /** True while the thinking content is still streaming */
    isThinkingStreaming?: boolean;
    /** ISO timestamp when thinking started */
    thinkingStartedAt?: string;
    /** ISO timestamp when thinking completed */
    thinkingCompletedAt?: string;
    /** Duration of thinking phase in seconds */
    thinkingDurationSeconds?: number;
    /** Multi-segment interleaved thinking blocks (ordered with tool calls) */
    thinkingSegments?: Array<{
      id: string;
      content: string;
      isStreaming: boolean;
      startedAt: string;
      completedAt: string | null;
      durationSeconds?: number;
    }>;
    isThinking?: boolean;
    isStreaming?: boolean;
    isCollaboration?: boolean;
    collaborationType?: 'contribution' | 'discussion' | 'synthesis';
    collaborationTo?: string;
    isMultiAgent?: boolean;
    employeesInvolved?: string[];
    isSynthesis?: boolean;
    searchResults?: SearchResponse | SearchResult[];
    isSearching?: boolean;
    /** True when this turn's request had web search on (see useChatStream). */
    webSearchRequested?: boolean;
    tools?: ToolEntry[];
    /** Canonical Cloud activity spine; preferred over legacy `tools`. */
    agentActivity?: AgentActivityState;
    /** True while provider-managed code execution is in progress. */
    isExecutingCode?: StoreMessageMetadata['isExecutingCode'];
    /** Persisted provider-managed stdout/stderr and inline plot output. */
    codeExecutionResult?: StoreMessageMetadata['codeExecutionResult'];
    toolResult?: boolean;
    toolType?: string;
    imageUrl?: string;
    /** Original prompt used for image generation (used by edit/re-generate flow). */
    imageGenPrompt?: string;
    /** Aspect ratio that was used when generating the image. */
    imageGenAspect?: string;
    /** Model id used for image generation. */
    imageGenModel?: string;
    /** Bounded provider/gateway retry instant for explicit image regeneration. */
    imageRetryAt?: string;
    imageData?: MediaGenerationResult;
    videoUrl?: string;
    thumbnailUrl?: string;
    videoTaskId?: string;
    videoStatus?: 'queued' | 'processing' | 'completed' | 'failed';
    videoProvider?: 'google' | 'runway' | 'openrouter';
    videoModel?: string;
    /** Aspect ratio requested when the video was generated; sizes the shimmer placeholder. */
    videoAspect?: string;
    videoProgress?: number;
    videoError?: string;
    videoRetryable?: boolean;
    videoData?: MediaGenerationResult;
    documentData?: GeneratedDocument;
    computeSession?: ComputeSession;
    generatedFile?: GeneratedFile;
    artifactManifest?: ArtifactManifest;
    /** Tool/provider-generated files (x_generated_files) with same-origin /api/files uris. */
    generatedFiles?: GeneratedFileMetadataEntry[];
    collaborationMessages?: Array<{
      employeeName: string;
      employeeAvatar: string;
      content: string;
      messageType?: string;
    }>;
    /** Web search citations from server-managed tools (e.g., Anthropic web_search) */
    citations?: Array<{
      type?: string;
      cited_text?: string;
      title?: string;
      url?: string;
    }>;
    /** A/B comparison options; when present renders ComparisonResponse instead of plain content */
    comparisonOptions?: {
      a: { label?: string; content: string };
      b: { label?: string; content: string };
    };
    /** Which A/B option the user selected */
    comparisonChoice?: 'a' | 'b';
    /**
     * True when this user message was pasted (not typed).
     * Set by the composer paste handler; renders a "PASTED" badge (Fix 42).
     */
    isPasted?: boolean;
    /** Persisted thumbs-up/down reaction from the user (stored in cloud messages.metadata). */
    reaction?: 'thumbsUp' | 'thumbsDown' | null;
    /** Paywall feature that triggered a capability gate message. */
    paywall?: {
      feature: string;
      requiredTier: string;
      recoveryAction?: 'upgrade' | 'subscribe' | 'manage_billing' | 'view_usage' | 'top_up';
    };
    /**
     * Parsed interactive cards. The union already encodes whether a body was
     * validated, so this renderer never sees an unvalidated payload, an
     * unrecognized card carries only its envelope and its authored fallback.
     */
    interactiveCards?: InteractiveCard[];
    /** Deep Research run state (activity header + persistence). */
    research?: MessageResearchState;
  };
}

export interface RegenerateModelOption {
  id: string;
  name: string;
}

interface MessageBubbleProps {
  message: Message;
  onEdit?: (messageId: string) => void;
  onRegenerate?: (messageId: string) => void;
  /**
   * Re-run a Deep Research turn that errored or was stopped (CAP-045 slice 4).
   * Absent when the surface cannot send, so no dead Retry control is rendered.
   */
  onRetryResearch?: (messageId: string) => void;
  /**
   * Answer a Deep Research run paused for plan approval: start the searches the
   * plan lists, or drop the plan. Absent when the surface cannot send.
   */
  onResearchPlanDecision?: (messageId: string, decision: ResearchPlanDecision) => void;
  /** True while a research retry or approved start for THIS message is in flight. */
  isRetryingResearch?: boolean;
  onDelete?: (messageId: string) => void;
  /**
   * Delete this response and everything that continued from it, leaving its
   * siblings in place. Only offered on a message that has siblings; absent when
   * the surface cannot delete variants.
   */
  onDeleteVariant?: (messageId: string) => void;
  /**
   * How many rows continue from this one, for the confirm copy. Read at confirm
   * time rather than passed as a value, so the walk costs one click rather than
   * one render of every message on the path.
   */
  countVariantFollowers?: (messageId: string) => number;
  onPin?: (messageId: string) => void;
  onReact?: (messageId: string, reactionType: 'up' | 'down' | null) => void;
  onBranch?: (messageId: string) => void;
  isBranching?: boolean;
  branchNavigation?: {
    branches: BranchItem[];
    activeBranchId: string;
    onSwitch: (branchId: string) => void;
  };
  /** Browser-native speech control owned by the parent message list. */
  onReadAloud?: (messageId: string, content: string) => void;
  /** True only for the single response currently being spoken. */
  isReadingAloud?: boolean;
  /** Keeps an unavailable browser capability out of the action row. */
  isReadAloudSupported?: boolean;
  isLatestTurn?: boolean;
  onRegenerateWithModel?: (messageId: string, modelId: string) => void;
  regenerateModelOptions?: ReadonlyArray<RegenerateModelOption>;
  hasBranches?: boolean;
  /**
   * This message's place among its siblings, the other answers to the same
   * question, or the other revisions of the same message. Absent, or with a
   * total of one, nothing is rendered.
   */
  variantInfo?: VariantInfo;
  /**
   * Page to another sibling. The page owns which leaf that implies, so this only
   * has to name the sibling the reader asked for.
   */
  onSelectVariant?: (messageId: string) => void;
  /** True while the conversation streams: paging mid-turn is not offered. */
  isConversationStreaming?: boolean;
  /** Re-generates an image result in-place (edit/aspect-ratio change). */
  onRegenerateImage?: (opts: {
    prompt: string;
    aspectRatio: ImageAspectRatio;
    modelId?: string;
  }) => Promise<string>;
  /** Resume status observation for an already-started durable video task. */
  onResumeVideo?: (messageId: string) => void;
  /** Start a new generation only after a durable video task is terminally failed. */
  onRetryVideo?: (messageId: string) => void;
  /**
   * When provided and the parent renders a motion container with
   * `messageListVariants`, this prop is unused (stagger is driven by the
   * parent). When the bubble renders standalone (no motion parent), the
   * index drives a custom delay so rapid-mount sequences look staggered.
   */
  animationIndex?: number;
}

const MessageBubbleComponent = function MessageBubble({
  message,
  onEdit,
  onRegenerate,
  onRetryResearch,
  onResearchPlanDecision,
  isRetryingResearch = false,
  onDelete,
  onDeleteVariant,
  countVariantFollowers,
  onPin,
  onBranch,
  isBranching = false,
  branchNavigation,
  onReact,
  onReadAloud,
  isReadingAloud = false,
  isReadAloudSupported = false,
  isLatestTurn = false,
  onRegenerateWithModel,
  regenerateModelOptions,
  hasBranches,
  variantInfo,
  onSelectVariant,
  isConversationStreaming = false,
  animationIndex = 0,
  onRegenerateImage,
  onResumeVideo,
  onRetryVideo,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [fallbackNoticeDismissed, setFallbackNoticeDismissed] = useState(false);
  const fallbackNotice = describeFallbackReason(
    message.metadata?.fallbackReason,
    getModelMetadataById(message.model ?? message.metadata?.model)?.name,
  );
  const [secretRedactionNoticeDismissed, setSecretRedactionNoticeDismissed] = useState(false);
  const secretRedactionNotice = describeSecretRedactionNotice(
    message.metadata?.secretRedactionCount,
  );
  const [showThinking, setShowThinking] = useState(false);
  const [showContributions, setShowContributions] = useState(false);
  const [videoError, setVideoError] = useState(false);
  // Attachment image rendering (claude.ai parity): the opened lightbox image and
  // the set of attachment ids whose <img> failed to load (broken-image fallback).
  const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null);
  const [brokenAttachmentIds, setBrokenAttachmentIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  /**
   * AUDIT-FIX GOV-33: framer-motion drives the staggered message entry through
   * INLINE opacity/transform styles, which the global prefers-reduced-motion
   * reset in globals.css (`transition-duration: 0.01ms !important`) cannot
   * reach, it only caps CSS transitions and animations. The preference has to
   * be read here and the entry animation skipped outright.
   */
  const prefersReducedMotion = useReducedMotion();
  const markAttachmentBroken = useCallback((id: string) => {
    setBrokenAttachmentIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const isUser = message.role === 'user';

  const userContentRef = useRef<HTMLDivElement>(null);
  const [userContentOverflows, setUserContentOverflows] = useState(false);
  const [userContentExpanded, setUserContentExpanded] = useState(false);

  /**
   * Delete confirmation (shell-nav-ia-gap-01). This used to be a native
   * `window.confirm()`, an OS alert with a browser-chrome "OK", in the middle
   * of a transcript, for the one action here that destroys content. `useConfirm`
   * is the shared wrapper around the AlertDialog primitive already used for
   * delete-schedule and delete-project, so the message delete now reads the same
   * as every other destructive confirm and its confirm button is red.
   */
  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirm();
  const handleDeleteWithConfirm = useCallback(() => {
    if (!onDelete) return;
    void (async () => {
      const confirmed = await confirmDestructive({
        title: 'Delete message?',
        // Only this one message is removed (deletePersistedMessages([id])), the
        // rest of the turn stays, so the copy must not imply a cascade.
        description: isUser
          ? 'This message is removed from the conversation. The reply it produced stays. This cannot be undone.'
          : 'This response is removed from the conversation. The message that prompted it stays. This cannot be undone.',
        confirmText: 'Delete message',
        variant: 'destructive',
      });
      if (confirmed) onDelete(message.id);
    })();
  }, [confirmDestructive, isUser, message.id, onDelete]);

  /**
   * Deleting one answer among several, which the plain delete above cannot
   * express: that one splices, leaving the exchange this answer produced hanging
   * off the question as if it had answered it. This takes the whole branch.
   *
   * Offered only where both halves of the contract are present; a surface that
   * cannot count what goes with the response would confirm a promise it has not
   * checked.
   */
  const canDeleteVariant =
    Boolean(onDeleteVariant && countVariantFollowers) && !isUser && (variantInfo?.total ?? 0) > 1;
  const handleDeleteVariantWithConfirm = useCallback(() => {
    if (!onDeleteVariant || !countVariantFollowers || !variantInfo) return;
    void (async () => {
      const confirmed = await confirmDestructive(
        variantDeleteConfirm({
          followerCount: countVariantFollowers(message.id),
          siblingCount: variantInfo.total - 1,
        }),
      );
      if (confirmed) onDeleteVariant(message.id);
    })();
  }, [confirmDestructive, countVariantFollowers, message.id, onDeleteVariant, variantInfo]);

  // ---- Inline edit (CLR-05) -------------------------------------------------
  // `beginEdit` runs the surface's guards and answers whether the editor may
  // open; `submitEdit` performs the replacing resend. Absent provider => the
  // legacy `onEdit` (composer prefill) still runs, so no surface loses Edit.
  const inlineEdit = useMessageInlineEdit();
  const [isEditing, setIsEditing] = useState(false);

  useLayoutEffect(() => {
    if (!isUser || isEditing) return;
    const node = userContentRef.current;
    if (!node) return;
    setUserContentOverflows(node.scrollHeight > USER_MESSAGE_COLLAPSE_HEIGHT_PX + 1);
  }, [isUser, isEditing, message.content]);

  const handleBeginEdit = useCallback(() => {
    if (inlineEdit) {
      if (inlineEdit.beginEdit(message.id)) setIsEditing(true);
      return;
    }
    onEdit?.(message.id);
  }, [inlineEdit, message.id, onEdit]);
  const handleCancelEdit = useCallback(() => setIsEditing(false), []);
  const handleSaveEdit = useCallback(
    (next: string) => {
      setIsEditing(false);
      inlineEdit?.submitEdit(message.id, next);
    },
    [inlineEdit, message.id],
  );
  // A streaming turn started elsewhere (queued follow-up, regenerate) makes an
  // open editor stale, close it rather than let Save race the live turn.
  useEffect(() => {
    if (message.isStreaming) setIsEditing(false);
  }, [message.isStreaming]);

  // Manual tool-approval wiring: an awaiting_approval tool card's approve/reject
  // buttons drive the resume request. The resolver comes from ToolApprovalContext
  // (mounted by the chat page, which owns the Clerk-authenticated resolver), via
  // useContext, so MessageBubble stays provider-independent and renderable
  // standalone. When no provider is present (standalone render / tests) the
  // resolver is null and the approve/reject affordances are simply not wired.
  const resolveToolApproval = useToolApprovalResolver();
  const handleApproveTool = useCallback(
    (toolCallId: string) => {
      void resolveToolApproval?.(message.id, toolCallId, 'approved');
    },
    [resolveToolApproval, message.id],
  );
  const handleRejectTool = useCallback(
    (toolCallId: string) => {
      void resolveToolApproval?.(message.id, toolCallId, 'rejected');
    },
    [resolveToolApproval, message.id],
  );
  // Resend re-runs the whole exchange from the original user message (same
  // mechanism as the Regenerate button) -- the only way to get a fresh,
  // resolvable tool call once the suspended turn's in-memory state is gone.
  // useCallback keeps its identity stable across renders, matching
  // handleApproveTool/handleRejectTool, so ToolTimeline's memo comparator
  // can compare it by reference instead of always re-rendering.
  const handleResendTool = useCallback(() => {
    onRegenerate?.(message.id);
  }, [onRegenerate, message.id]);
  const handleSelectPreviousVariant = useCallback(() => {
    if (variantInfo?.previousId) onSelectVariant?.(variantInfo.previousId);
  }, [onSelectVariant, variantInfo?.previousId]);
  const handleSelectNextVariant = useCallback(() => {
    if (variantInfo?.nextId) onSelectVariant?.(variantInfo.nextId);
  }, [onSelectVariant, variantInfo?.nextId]);
  const variantPager =
    variantInfo && onSelectVariant ? (
      <VariantPager
        index={variantInfo.index}
        total={variantInfo.total}
        onPrevious={handleSelectPreviousVariant}
        onNext={handleSelectNextVariant}
        disabled={isConversationStreaming}
      />
    ) : null;
  // `pendingTurns` (the registry resolveToolApproval consults) is process-
  // memory-only and doesn't survive a reload, even though a persisted
  // awaiting_approval card does. Without this, the Approve/Reject buttons
  // below would render live-wired but silently no-op (Finding 1). Only
  // meaningful when a resolver context exists at all -- a standalone render
  // with no provider isn't "expired", it just never had approval wired.
  const approvalTurnExpired = Boolean(resolveToolApproval) && !isApprovalTurnLive(message.id);
  const approvalHandlers = resolveToolApproval
    ? {
        onApprove: handleApproveTool,
        onReject: handleRejectTool,
        expired: approvalTurnExpired,
        onResend: onRegenerate ? handleResendTool : undefined,
      }
    : {};
  // Lazy authentication (inline Connect card): after the OAuth callback returns
  // there is nothing server-side that resumes the suspended turn, so the card's
  // Retry re-runs the exchange from the user's last message -- the same
  // mechanism Regenerate uses. Wired independently of `approvalHandlers`
  // because a connect-required result never involves the approval registry.
  const connectRetryHandler = onRegenerate ? { onRetryTurn: handleResendTool } : {};

  const addArtifactForMessage = useArtifactsStore((state) => state.addArtifactForMessage);
  const getMessageArtifacts = useArtifactsStore((state) => state.getMessageArtifacts);
  const upsertArtifact = useArtifactsStore((state) => state.upsertArtifact);
  // Stamp artifacts with the active conversation id (the SAME source the
  // Artifacts panel filters by). message.sessionId is often unset, so relying
  // on it left artifacts with conversationId=undefined → filtered out of every
  // panel. Falls back to message.sessionId when there's no active conversation.
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const isAgiWorkTurn = useChatStore(
    selectIsAgiWorkConversation(message.sessionId ?? activeConversationId),
  );
  const taskRunId = message.metadata?.cloudAgentRun?.runId ?? null;
  const activeConversationModel = useChatStore(
    (s) => s.conversations.find((c) => c.id === s.activeConversationId)?.model ?? null,
  );

  const [reportState, setReportState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [ratingState, setRatingState] = useState<'idle' | 'up' | 'down'>('idle');

  /**
   * File a trust-and-safety report for this answer.
   *
   * Category is 'harmful' by default because that is the report a user most
   * urgently needs to be able to file; the excerpt gives triage something to
   * act on without opening the whole conversation. `reportId` is client-
   * generated and the server treats it as an idempotency key, so a retry after
   * a flaky network never files the same report twice.
   */
  const reportMessage = useCallback(async () => {
    if (reportState !== 'idle') return;
    setReportState('sending');
    try {
      const response = await fetch('/api/content-report', {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          reportId: crypto.randomUUID(),
          messageId: message.id,
          conversationId: message.sessionId ?? activeConversationId ?? 'unknown',
          category: 'harmful',
          contentExcerpt: (message.content ?? '').slice(0, 500),
          userNote: '',
        }),
      });
      if (!response.ok) throw new Error(`Report failed: ${response.status}`);
      setReportState('sent');
      toast.success('Reported. Thank you: our trust and safety team will review it.');
    } catch {
      setReportState('idle');
      toast.error('Could not send the report. Please try again.');
    }
  }, [activeConversationId, message.content, message.id, message.sessionId, reportState]);
  /**
   * Thumbs up / down on an assistant answer, the one signal every comparable
   * product collects on every message and this app collected nowhere. The only
   * routes out were a composer-level dialog and a refusal appeal, neither of
   * which tells us an ordinary answer was good or bad.
   *
   * Stored through /api/feedback with feedback_context 'response_rating', so it
   * lands in public.feedback and shows up in the operator dashboard's existing
   * feedback counts with no new table.
   */
  const rateMessage = useCallback(
    async (rating: 'up' | 'down') => {
      if (ratingState !== 'idle') return;
      const previous = ratingState;
      setRatingState(rating);
      try {
        const response = await fetch('/api/feedback', {
          method: 'POST',
          headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: JSON.stringify({
            subject: `Response rated ${rating}`,
            message: (message.content ?? '').slice(0, 500) || '(empty response)',
            metadata: {
              source: 'web',
              platform: 'web',
              version: 'web',
              user_agent:
                typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent.slice(0, 500),
              feedback_context: 'response_rating',
              rating,
              message_id: message.id,
              conversation_id: message.sessionId ?? activeConversationId ?? undefined,
            },
          }),
        });
        if (!response.ok) throw new Error(`Rating failed: ${response.status}`);
      } catch {
        // Leaving the button lit would claim a vote the server never took.
        setRatingState(previous);
        toast.error('Could not send that. Please try again.');
      }
    },
    [activeConversationId, message.content, message.id, message.sessionId, ratingState],
  );

  /*
   * One verdict per answer. The persisted reaction on message metadata is the
   * source of truth when the host wires `onReact`; `ratingState` only stands in
   * for hosts that do not. Both sinks are fed from this single control, a
   * second pair of thumbs used to render beside it, so an answer showed four
   * thumb icons and two independent verdicts.
   */
  const responseRating: 'up' | 'down' | null =
    message.metadata?.reaction === 'thumbsUp'
      ? 'up'
      : message.metadata?.reaction === 'thumbsDown'
        ? 'down'
        : ratingState === 'idle'
          ? null
          : ratingState;

  const rateResponse = useCallback(
    (rating: 'up' | 'down') => {
      const isRepeat = responseRating === rating;
      onReact?.(message.id, isRepeat ? null : rating);
      if (isRepeat) {
        setRatingState('idle');
      } else {
        void rateMessage(rating);
      }
    },
    [message.id, onReact, rateMessage, responseRating],
  );

  const artifactConversationId = message.sessionId ?? activeConversationId ?? undefined;
  const setComparisonChoice = useComparisonStore((state) => state.setComparisonChoice);
  const storedChoice = useComparisonStore((state) =>
    state.getComparisonChoice(message.sessionId ?? '', message.id),
  );

  // Artifact handling
  const existingArtifacts = getMessageArtifacts(message.id);
  const messageCodeBlocks = useMemo(
    () => (isUser ? [] : extractCodeBlocks(message.content)),
    [isUser, message.content],
  );
  const extractedArtifacts = useMemo(() => {
    if (isUser) return [];
    // Pass message context so derived ids are deterministic + cross-surface
    // stable (the shared derivation keys on conversationId:messageId:ordinal).
    return extractArtifacts(
      message.content,
      {
        conversationId: artifactConversationId,
        messageId: message.id,
      },
      messageCodeBlocks,
    );
  }, [message.content, isUser, artifactConversationId, message.id, messageCodeBlocks]);

  // Live artifact streaming (Claude parity): while this assistant message is
  // still streaming and its buffer ends in an UNCLOSED renderable fence, parse
  // the partial block on every chunk. The sync hook mirrors it into the
  // ephemeral streaming-artifact store (auto-opening the Artifacts panel) so
  // the panel shows the file being written line-by-line instead of nothing.
  // Once the closing fence arrives, extractArtifacts sees the completed block,
  // the persisted artifact lands under the SAME deterministic id, and the
  // streaming overlay clears, a seamless handoff to the Preview tab.
  const streamingBlock = useMemo(() => {
    if (isUser || !message.isStreaming) return null;
    const block = extractTrailingUnclosedBlock(message.content, messageCodeBlocks);
    if (!block || !isRenderableArtifact(block.language, block.content)) return null;
    return block;
  }, [isUser, message.isStreaming, message.content, messageCodeBlocks]);

  useStreamingArtifactSync({
    messageId: message.id,
    conversationId: artifactConversationId,
    isStreaming: Boolean(message.isStreaming),
    block: streamingBlock,
  });

  // ── Tool/provider-generated files (`x_generated_files` → metadata) ────────
  // Bytes live behind the authenticated same-origin /api/files/{id} route.
  // Rendering reuses EXISTING components per kind: images → attachment
  // thumbnail + ImageLightbox; pdf → ArtifactPreview's gated PDF viewer;
  // csv → SpreadsheetArtifact (content fetched below); rest → download chip.
  const generatedFiles = useMemo<GeneratedFileMetadataEntry[]>(
    () => (isUser ? [] : (message.metadata?.generatedFiles ?? [])),
    [isUser, message.metadata?.generatedFiles],
  );

  // Fetched source text per generated-file id; 'error' → honest chip fallback.
  // The same authenticated byte route powers HTML/code/text artifacts and CSV.
  // A failed load is a distinct shape, not a magic content string: `string |
  // 'error'` collapses to `string`, so a generated file whose text happened to
  // be "error" was silently dropped instead of rendered.
  const [generatedTextContent, setGeneratedTextContent] = useState<
    Record<string, string | { failed: true }>
  >({});
  useEffect(() => {
    const pending = generatedFiles.filter(
      (f) =>
        isGeneratedTextArtifact(f) &&
        f.byteCount <= MAX_INLINE_GENERATED_TEXT_BYTES &&
        generatedTextContent[f.id] === undefined,
    );
    if (pending.length === 0) return;
    let cancelled = false;
    for (const file of pending) {
      fetch(file.uri, { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((text) => {
          if (!cancelled) setGeneratedTextContent((prev) => ({ ...prev, [file.id]: text }));
        })
        .catch(() => {
          if (!cancelled)
            setGeneratedTextContent((prev) => ({ ...prev, [file.id]: { failed: true } }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [generatedFiles, generatedTextContent]);

  const trustBoundary = useMemo(
    () => messageTrustBoundary(message.metadata, message.model, activeConversationModel),
    [message.metadata, message.model, activeConversationModel],
  );

  const toGeneratedFile = useCallback(
    (f: GeneratedFileMetadataEntry): GeneratedFile => ({
      id: f.id,
      computeSessionId: `generated-${message.id}`,
      ownerUserId: '',
      sourceSurface: 'web',
      privacyMode: trustBoundary.privacyMode,
      providerMode: trustBoundary.providerMode,
      kind: (f.kind || 'other') as GeneratedFile['kind'],
      fileName: f.fileName,
      mimeType: f.mimeType,
      uri: f.uri,
      byteCount: f.byteCount,
      checksumSha256: f.checksumSha256 ?? '',
      previewDerivatives: [],
      createdAt: message.timestamp.toISOString(),
    }),
    [message.id, message.timestamp, trustBoundary],
  );

  const generatedFileArtifacts = useMemo<ArtifactData[]>(() => {
    if (isUser) return [];
    const out: ArtifactData[] = [];

    // A completed image-generation turn historically rendered only inside the
    // transcript. Project it into the same durable artifact store as code and
    // files so opening the panel (including after a reload) shows the output.
    const generatedImageUrl =
      message.metadata?.toolType === 'image-generation' &&
      typeof message.metadata.imageUrl === 'string'
        ? message.metadata.imageUrl.trim()
        : '';
    if (generatedImageUrl) {
      out.push({
        id: `generated-image-${message.id}`,
        type: 'image',
        language: 'png',
        title: generatedImageArtifactTitle(message.metadata?.imageGenPrompt),
        content: generatedImageUrl,
      });
    }

    // Renderable generated files → existing artifact renderers. Images remain
    // in the attachment grid for their transcript thumbnail, and are ALSO
    // addressable in the artifact panel.
    for (const f of generatedFiles) {
      if (f.kind === 'image') {
        out.push({
          id: generatedFileArtifactId(f.id),
          type: 'image',
          language: generatedFileLanguage(f),
          title: f.fileName,
          content: f.uri,
          generatedFile: toGeneratedFile(f),
        });
      } else if (f.kind === 'pdf') {
        out.push({
          id: generatedFileArtifactId(f.id),
          type: 'document',
          language: 'pdf',
          title: f.fileName,
          content: '',
          generatedFile: toGeneratedFile(f),
        });
      } else if (isGeneratedTextArtifact(f)) {
        const source = generatedTextContent[f.id];
        if (typeof source === 'string') {
          const language = generatedFileLanguage(f);
          out.push({
            id: generatedFileArtifactId(f.id),
            type: generatedFileArtifactType(f),
            language,
            title: f.fileName,
            content: source,
            generatedFile: toGeneratedFile(f),
          });
        }
      }
    }

    const { computeSession, generatedFile, artifactManifest, documentData } =
      message.metadata ?? {};
    if (!computeSession && !generatedFile && !artifactManifest) return out;

    return [
      ...out,
      {
        id: artifactManifest?.artifactId ?? generatedFile?.id ?? `generated-file-${message.id}`,
        type: 'document',
        language: generatedFile?.kind ?? 'document',
        title:
          artifactManifest?.title ??
          generatedFile?.fileName ??
          documentData?.title ??
          'Generated file',
        content: documentData?.content ?? message.content,
        computeSession,
        generatedFile,
        artifactManifest,
        // No synthesised `versions` entry: a generated file has exactly one
        // revision here, and inventing a one-item history only ever produced a
        // "v1" label. Real history comes from the artifacts store.
      },
    ];
  }, [
    isUser,
    message.content,
    message.id,
    message.metadata,
    generatedFiles,
    generatedTextContent,
    toGeneratedFile,
  ]);

  const artifacts = useMemo(() => {
    const baseArtifacts = existingArtifacts.length > 0 ? existingArtifacts : extractedArtifacts;
    // Dedupe by id: the upsert effect below writes generated-file artifacts
    // into the artifacts store, so on the next render they ALSO arrive via
    // existingArtifacts, without this they would render twice. Persisted
    // SharedArtifacts intentionally omit web-only generated-file provenance,
    // so a reload must also enrich the matching persisted entry with the
    // freshly reconstructed side-map fields instead of discarding them.
    const merged = [...baseArtifacts];
    for (const artifact of generatedFileArtifacts) {
      const existingIndex = merged.findIndex((existing) => existing.id === artifact.id);
      if (existingIndex === -1) {
        merged.push(artifact);
        continue;
      }
      const existing = merged[existingIndex];
      if (!existing) continue;
      merged[existingIndex] = {
        ...existing,
        computeSession: artifact.computeSession ?? existing.computeSession,
        generatedFile: artifact.generatedFile ?? existing.generatedFile,
        artifactManifest: artifact.artifactManifest ?? existing.artifactManifest,
      };
    }
    return merged;
  }, [existingArtifacts, extractedArtifacts, generatedFileArtifacts]);

  // Generated files rendered through the EXISTING attachment grid: images get
  // the thumbnail + ImageLightbox path; descriptors without a successfully
  // constructed workbench artifact remain honest download chips.
  const generatedFileAttachments = useMemo<Attachment[]>(() => {
    const artifactFileIds = new Set(
      generatedFileArtifacts
        .map((artifact) => artifact.generatedFile?.id)
        .filter((id): id is string => Boolean(id)),
    );
    return generatedFiles
      .filter((file) => file.kind === 'image' || !artifactFileIds.has(file.id))
      .map((f) => ({
        id: generatedFileArtifactId(f.id),
        name: f.fileName,
        type: f.mimeType,
        size: f.byteCount,
        url: f.uri,
      }));
  }, [generatedFiles, generatedFileArtifacts]);

  const displayAttachments = useMemo<Attachment[]>(
    () => [...(message.attachments ?? []), ...generatedFileAttachments],
    [message.attachments, generatedFileAttachments],
  );
  // The image set the lightbox pages through. Attachments that failed to load
  // are excluded deliberately: they render as a labelled chip rather than a
  // thumbnail, so including them would put an un-openable slot in the carousel
  // between two working images. `id` is carried so the clicked attachment can
  // be located without depending on position in `displayAttachments`.
  const lightboxImages = useMemo(
    () =>
      displayAttachments
        .filter(
          (attachment) =>
            attachment.type.startsWith('image/') && !brokenAttachmentIds.has(attachment.id),
        )
        .map((attachment) => ({
          id: attachment.id,
          src: attachment.url,
          alt: attachment.name,
          downloadFilename: attachment.name,
        })),
    [displayAttachments, brokenAttachmentIds],
  );
  // Generated images already have a purpose-built transcript card/thumbnail.
  // Keep their artifact projection panel-only so the message does not render a
  // second, visually redundant "Open artifact" card beneath the same image.
  const inlineArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.type !== 'image'),
    [artifacts],
  );

  useEffect(() => {
    if (isUser || existingArtifacts.length > 0 || extractedArtifacts.length === 0) return;
    extractedArtifacts.forEach((artifact) =>
      addArtifactForMessage(message.id, artifact, artifactConversationId),
    );
  }, [
    message.id,
    artifactConversationId,
    isUser,
    existingArtifacts.length,
    extractedArtifacts,
    addArtifactForMessage,
  ]);

  useEffect(() => {
    if (isUser || artifacts.length === 0) return;
    for (const artifact of artifacts) {
      upsertArtifact({
        ...artifact,
        title: artifact.title || 'Untitled',
        language: artifact.language || artifact.type,
        messageId: message.id,
        conversationId: artifactConversationId,
      });
    }
  }, [artifacts, isUser, message.id, artifactConversationId, upsertArtifact]);

  const cleanedContent = useMemo(() => {
    // While an artifact block is streaming into the panel, hide the growing
    // raw fence from the chat body (a compact "Writing…" chip renders instead)
    //, mirroring how completed artifact blocks are stripped below.
    const base = streamingBlock
      ? message.content.slice(0, streamingBlock.startIndex).trimEnd()
      : message.content;
    const stripped = artifacts.length === 0 ? base : removeArtifactBlocks(base, artifacts);
    const withoutDuplicateSources = message.metadata?.research
      ? stripTrailingSourceList(stripped)
      : stripped;
    const withoutCitationTail = isUser
      ? withoutDuplicateSources
      : stripTrailingCitationOnlyBlock(withoutDuplicateSources);
    // AUDIT-FIX BUG-31: non-artifact languages get the same "don't hand the
    // renderer a half-open fence" treatment the artifact path already gets.
    return closeUnterminatedFence(withoutCitationTail);
  }, [message.content, artifacts, streamingBlock, message.metadata?.research, isUser]);

  /**
   * Rich format cards (recipe / comparison / steps / calculation) for assistant
   * prose that has a clear structure.
   *
   * Deliberately NOT computed while streaming. The detector reads structural
   * signals, an "## Ingredients" heading, three "Step N:" markers, and a
   * partial answer crosses those thresholds at arbitrary moments, so running
   * it per token would flip the layout between prose and card mid-render. It
   * settles once, when the text is final.
   *
   * `MessageFormatCard` keeps the original markdown one click away, so a
   * mis-detection or a lossy parser costs a toggle rather than the answer.
   */
  const formatCardType = useMemo(() => {
    if (isUser || message.isStreaming) return null;
    return detectCardType(cleanedContent);
  }, [isUser, message.isStreaming, cleanedContent]);

  /**
   * A finished assistant turn that rendered NOTHING.
   *
   * Observed live in AGI Work: the model ran for 26s, the activity trail said
   * "Prepared the response → Done", `finishReason` was `stop`, and the turn
   * persisted the zero-width-space empty-content placeholder, so the transcript showed
   * a header, a model label and an action bar with no answer between them. The
   * user is given no way to tell "the model returned nothing" apart from "the
   * app lost my response", and in a recorded demo it simply looks broken.
   *
   * The empty placeholder is legitimate for turns whose OUTPUT is not text (a
   * generated image, a video, an artifact, a file), so every one of those
   * renderers is excluded below, this fires only when the turn truly has
   * nothing to show. Retry already lives in the action bar underneath.
   */
  const producedNoVisibleOutput = useMemo(() => {
    if (isUser || message.isStreaming) return false;
    if (message.metadata?.finishReason === 'stopped') return false;
    if (hasStreamError({ metadata: message.metadata })) return false;
    // The persisted "no text" placeholder is a zero-width space, not "". Written
    // as escapes: the literal characters are invisible in review and in a diff,
    // so a stray edit could silently delete one and quietly break the check.
    if (cleanedContent.replace(/[\u200B\uFEFF]/g, '').trim().length > 0) return false;
    if (displayAttachments.length > 0 || artifacts.length > 0) return false;
    if (streamingBlock) return false;
    const meta = message.metadata;
    if (!meta) return true;
    return !(
      meta.imageUrl ||
      meta.imageData ||
      meta.videoUrl ||
      meta.videoData ||
      meta.videoStatus ||
      meta.documentData ||
      meta.generatedFile ||
      meta.artifactManifest ||
      meta.computeSession ||
      meta.codeExecutionResult ||
      meta.isExecutingCode ||
      meta.interactiveCards?.length ||
      meta.comparisonOptions ||
      meta.paywall ||
      hasWebSearchSources(meta.searchResults) ||
      meta.toolType === 'image-generation' ||
      meta.toolType === 'video-generation'
    );
  }, [
    isUser,
    message.isStreaming,
    message.metadata,
    cleanedContent,
    displayAttachments.length,
    artifacts.length,
    streamingBlock,
  ]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const hasThinkingSteps =
    message.metadata?.thinkingSteps && message.metadata.thinkingSteps.length > 0;
  const hasContributions =
    message.metadata?.isMultiAgent &&
    message.metadata?.collaborationMessages &&
    message.metadata.collaborationMessages.length > 0;
  const voiceModeActive = useVoiceModeActive();
  const setVoiceActivityMessageId = useVoiceSessionStore((state) => state.setActivityMessageId);
  const canonicalActivity = !isUser ? message.metadata?.agentActivity : undefined;
  const answeredByModelId = !isUser ? (message.model ?? message.metadata?.model) : undefined;
  const answeredByLabel = answeredByModelId
    ? getManagedModelPresentationLabel(answeredByModelId, {
        freePool: isFreeRouteLane(message.metadata?.routeLane),
      })
    : undefined;
  const canonicalOwnsToolActivity = hasCanonicalToolActivity(canonicalActivity);
  const toolTimeline =
    !isUser && !canonicalOwnsToolActivity && message.metadata?.tools ? message.metadata.tools : [];

  // Collect web-search sources from metadata (searchResults and/or citations).
  // These feed the "Searched the web" step's result count and the compact
  // Sources control at the end of the answer.
  const { searchSources, searchQuery, citationsByMarker } = useMemo(() => {
    if (isUser) {
      return {
        searchSources: [] as ResearchSource[],
        searchQuery: undefined,
        citationsByMarker: [] as ResearchSource[],
      };
    }

    const collected: ResearchSource[] = [];
    let query: string | undefined;

    const sr = message.metadata?.searchResults;
    if (sr) {
      query = Array.isArray(sr) ? undefined : sr.query;
      const results = Array.isArray(sr) ? sr : (sr.results ?? []);
      results.forEach((r, i) => {
        if (r.url) {
          collected.push({
            url: r.url,
            title: r.title || '',
            snippet: r.snippet,
            favicon: r.favicon,
            citationIndex: i + 1,
          });
        }
      });
      // Perplexity plain-URL sources list
      if (!Array.isArray(sr)) {
        (sr.sources ?? []).forEach((url) => {
          if (url && !collected.some((s) => s.url === url)) {
            collected.push({ url, title: '', citationIndex: collected.length + 1 });
          }
        });
      }
    }

    const annotationCitations = (message.metadata?.citations ?? []).filter(
      (c): c is { url: string; title: string; cited_text?: string; type?: string } =>
        !!(c.url && c.title),
    );
    if (annotationCitations.length > 0 && collected.length === 0) {
      annotationCitations.forEach((c, i) => {
        collected.push({
          url: c.url,
          title: c.title,
          snippet: c.cited_text,
          citationIndex: i + 1,
        });
      });
    }

    // De-dupe by URL and assign stable 1-based citation numbers (claude.ai
    // parity: a source cited twice keeps one number). Sources missing a usable
    // URL are dropped here rather than rendered as dead links.
    const deduped = dedupeResearchSources(collected);
    const dedupedByUrl = new Map(deduped.map((s) => [s.url, s]));

    const citationsByMarker =
      annotationCitations.length > 0
        ? annotationCitations.map((c, i) => ({
            url: c.url,
            title: c.title,
            snippet: c.cited_text,
            citationIndex: i + 1,
          }))
        : collected.map(
            (source, i) => dedupedByUrl.get(source.url) ?? { ...source, citationIndex: i + 1 },
          );

    return { searchSources: deduped, searchQuery: query, citationsByMarker };
  }, [isUser, message.metadata?.searchResults, message.metadata?.citations]);

  const { cited: citedSources, more: moreSources } = useMemo(
    () => orderSourcesByCitation(cleanedContent, citationsByMarker, searchSources),
    [cleanedContent, citationsByMarker, searchSources],
  );

  const turnAttemptedSearch = useMemo(() => {
    if (
      canonicalActivity?.entries.some(
        (entry) =>
          entry.kind === 'tool' &&
          (entry.category === 'web-search' || entry.category === 'web-fetch'),
      )
    ) {
      return true;
    }
    if (canonicalActivity?.entries.some((entry) => entry.kind === 'sources')) return true;
    return Boolean(
      message.metadata?.tools?.some((tool) => /web_search|url_fetch|grounding/i.test(tool.name)),
    );
  }, [canonicalActivity, message.metadata?.tools]);

  const showNoSearchResultsNotice = useMemo(() => {
    if (isUser || message.isStreaming) return false;
    if (message.metadata?.webSearchRequested !== true) return false;
    if (!turnAttemptedSearch) return false;
    if (producedNoVisibleOutput) return false;
    if (hasStreamError({ metadata: message.metadata })) return false;
    return searchSources.length === 0;
  }, [
    isUser,
    message.isStreaming,
    message.metadata,
    turnAttemptedSearch,
    producedNoVisibleOutput,
    searchSources,
  ]);

  const setResearchSources = useResearchPanelStore((s) => s.setSources);
  useEffect(() => {
    if (!isUser && searchSources.length > 0) {
      setResearchSources(
        artifactConversationId ?? null,
        message.id,
        citedSources,
        moreSources,
        searchQuery,
      );
    }
  }, [
    isUser,
    searchSources,
    citedSources,
    moreSources,
    searchQuery,
    setResearchSources,
    artifactConversationId,
    message.id,
  ]);

  return (
    <motion.div
      data-role={isUser ? 'user' : 'assistant'}
      data-message-id={message.id}
      variants={messageBubbleVariants}
      initial={prefersReducedMotion ? false : 'hidden'}
      animate="visible"
      transition={
        prefersReducedMotion ? { duration: 0, delay: 0 } : { delay: animationIndex * 0.06 }
      }
      className={cn(
        /* Row · py-6 px-4 matches desktop .message-row / .message-container */
        'group message-row message-bubble',
        isUser ? 'message-row-user' : 'message-row-assistant',
      )}
    >
      {/* Delete confirmation. Rendered outside the dropdown so closing the menu
          on select cannot unmount the dialog that the select just opened. */}
      {destructiveConfirmDialog}
      {/* Inner content row · constrained to max-w-3xl. No avatars: user messages
          read as a right-aligned bubble, assistant messages as a flat left column. */}
      <div className={cn('message-inner', isUser && 'flex-row-reverse')}>
        {/* Content */}
        <div
          className={cn(
            'message-body',
            isUser ? 'flex max-w-[75%] flex-col items-end' : 'flex-1 min-w-0',
            isEditing && 'w-full max-w-full items-stretch',
          )}
        >
          {/* Slim badge row · only rendered when a marker is present (no name/timestamp) */}
          {(message.metadata?.isPinned ||
            hasBranches ||
            branchNavigation ||
            (isUser && message.metadata?.isPasted)) && (
            <div className="mb-1 flex items-center gap-1.5">
              {message.metadata?.isPinned && (
                <Pin className="h-3 w-3 text-amber-500" aria-hidden="true" />
              )}
              {(hasBranches || branchNavigation) && (
                <GitFork className="h-3 w-3 text-primary" aria-hidden="true" />
              )}
              {branchNavigation && (
                <BranchNavigator
                  branches={branchNavigation.branches}
                  activeBranchId={branchNavigation.activeBranchId}
                  onSwitch={branchNavigation.onSwitch}
                  messageId={message.id}
                />
              )}
              {isUser && message.metadata?.isPasted && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  pasted
                </span>
              )}
            </div>
          )}

          {/* Deep Research activity header (phase, elapsed time, counts) */}
          {!isUser && message.metadata?.research && (
            <ResearchActivity
              research={message.metadata.research}
              isStreaming={message.isStreaming ?? false}
              isRetrying={isRetryingResearch}
              {...(onRetryResearch ? { onRetry: () => onRetryResearch(message.id) } : {})}
              {...(onResearchPlanDecision
                ? {
                    onPlanDecision: (decision: ResearchPlanDecision) =>
                      onResearchPlanDecision(message.id, decision),
                  }
                : {})}
            />
          )}

          {/* One canonical Cloud run spine. It is collapsed inline by default,
              expands in place, and each tool then owns its own request/response
              disclosure. Legacy tool events below are a migration fallback only. */}
          {!isUser && canonicalActivity && voiceModeActive && (
            <VoiceActivityAffordance
              activity={canonicalActivity}
              onOpen={() => setVoiceActivityMessageId(message.id)}
            />
          )}

          {!isUser && canonicalActivity && !voiceModeActive && (
            <AgentActivityTimeline
              className="mb-3"
              // `defaultExpanded` only seeds AgentActivityTimeline's own expand
              // state on mount -- the notice condition below only becomes true
              // once streaming ends, long after this component already mounted
              // collapsed. Keying on it forces the one remount that lets the
              // failed-tool row start open instead of needing a click.
              key={showNoSearchResultsNotice ? `${message.id}-no-sources` : message.id}
              activity={canonicalActivity}
              {...(isAgiWorkTurn ? { workMode: AGI_WORK_MODE } : {})}
              defaultExpanded={showNoSearchResultsNotice}
              onApprove={resolveToolApproval ? handleApproveTool : undefined}
              onReject={resolveToolApproval ? handleRejectTool : undefined}
              isApprovalExpired={() => approvalTurnExpired}
              onResend={resolveToolApproval && onRegenerate ? handleResendTool : undefined}
              {...connectRetryHandler}
            />
          )}

          {/* Interleaved reasoning + tool flow */}
          {!isUser &&
            (() => {
              const segments = message.metadata?.thinkingSegments;
              const tools =
                !isUser && !canonicalOwnsToolActivity && message.metadata?.tools
                  ? message.metadata.tools
                  : [];

              if (segments && segments.length > 0) {
                const groups = mergeAdjacentThinkingSegments(segments, tools);
                const blocks: React.ReactNode[] = [];

                groups.forEach(({ segment: seg, toolAfter: tool }, i) => {
                  blocks.push(
                    <div key={`thinking-seg-${seg.id}`} className="mb-2">
                      <ThinkingBlock
                        content={seg.content}
                        isStreaming={seg.isStreaming}
                        startedAt={seg.startedAt}
                        completedAt={seg.completedAt ?? undefined}
                        durationSeconds={seg.durationSeconds}
                        defaultExpanded={seg.isStreaming}
                      />
                    </div>,
                  );

                  if (tool) {
                    blocks.push(
                      <div key={`tool-inline-${tool.id ?? i}`} className="mb-2">
                        <ToolTimeline
                          tools={[tool]}
                          compact={false}
                          searchSources={searchSources}
                          searchQuery={searchQuery}
                          {...approvalHandlers}
                          {...connectRetryHandler}
                        />
                      </div>,
                    );
                  }
                });

                // Any remaining tools beyond the last segment
                if (tools.length > segments.length) {
                  const remaining = tools.slice(segments.length);
                  blocks.push(
                    <div key="tool-remainder" className="mb-2">
                      <ToolTimeline
                        tools={remaining}
                        searchSources={searchSources}
                        searchQuery={searchQuery}
                        {...approvalHandlers}
                        {...connectRetryHandler}
                      />
                    </div>,
                  );
                }

                return <div className="mb-3 space-y-0">{blocks}</div>;
              }

              // Legacy single-block path
              if (message.metadata?.thinkingContent) {
                return (
                  <div className="mb-3">
                    <ThinkingBlock
                      content={message.metadata.thinkingContent}
                      isStreaming={message.metadata.isThinkingStreaming ?? false}
                      startedAt={message.metadata.thinkingStartedAt}
                      completedAt={message.metadata.thinkingCompletedAt}
                      durationSeconds={message.metadata.thinkingDurationSeconds}
                      defaultExpanded={message.metadata.isThinkingStreaming ?? false}
                    />
                  </div>
                );
              }

              return null;
            })()}

          {/* A/B comparison response · shown instead of main content when options are present */}
          {!isUser && message.metadata?.comparisonOptions && (
            <ComparisonResponse
              optionA={message.metadata.comparisonOptions.a}
              optionB={message.metadata.comparisonOptions.b}
              choice={storedChoice ?? message.metadata.comparisonChoice}
              isStreaming={message.isStreaming}
              onChoose={(side) => {
                setComparisonChoice(message.sessionId ?? '', message.id, side);
              }}
            />
          )}

          {/* Tool timeline (legacy path) · rendered before prose so it appears as
              leading context for the response, not an afterthought appended at the end.
              Only shown when there are no interleaved thinkingSegments (those handle
              their own per-step tool rendering above). */}
          {!isUser && toolTimeline.length > 0 && !message.metadata?.thinkingSegments?.length && (
            <div className="mb-3">
              <ToolTimeline
                tools={toolTimeline}
                searchSources={searchSources}
                searchQuery={searchQuery}
                {...approvalHandlers}
                {...connectRetryHandler}
              />
            </div>
          )}

          {!isUser &&
            (message.metadata?.isExecutingCode || message.metadata?.codeExecutionResult) && (
              <CodeExecutionBlock
                isExecuting={message.metadata.isExecutingCode}
                result={message.metadata.codeExecutionResult}
              />
            )}

          {/* Inline edit (CLR-05): the bubble ITSELF becomes the editor, so the
              message being revised never sits stale above a composer at the far
              end of the page. Replaces the rendered body rather than sitting
              beside it, two copies of the same message is the bug, not the fix. */}
          {isEditing && (
            <div className="w-full min-w-0 text-left">
              <EditableMessage
                message={{ id: message.id, content: message.content }}
                onSave={handleSaveEdit}
                onCancel={handleCancelEdit}
              />
            </div>
          )}

          <div className="relative">
            <div
              ref={userContentRef}
              dir="auto"
              data-streaming={!isUser && message.isStreaming ? 'true' : undefined}
              className={cn(
                'prose dark:prose-invert max-w-none',
                'message-text',
                'break-words overflow-wrap-anywhere text-start',
                isUser && 'user-bubble',
                !isUser && message.metadata?.comparisonOptions && 'hidden',
                isEditing && 'hidden',
              )}
              style={
                isUser && userContentOverflows && !userContentExpanded
                  ? { maxHeight: USER_MESSAGE_COLLAPSE_HEIGHT_PX, overflow: 'hidden' }
                  : undefined
              }
            >
              {message.isStreaming &&
              !cleanedContent.trim() &&
              !streamingBlock &&
              !canonicalActivity &&
              !message.metadata?.isExecutingCode &&
              !message.metadata?.codeExecutionResult &&
              message.metadata?.toolType !== 'image-generation' &&
              // Same reason as image: the media card below IS the progress
              // indicator. Observed live, the video shimmer rendered with a
              // "Thinking..." line stacked on top of it, claiming a reasoning
              // step that is not happening.
              message.metadata?.toolType !== 'video-generation' ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                  <span className="text-sm">Thinking...</span>
                </div>
              ) : producedNoVisibleOutput ? (
                <TranscriptNotice
                  surface="bare"
                  role="status"
                  icon={CircleAlert}
                  message="The model finished without returning a response. Use Regenerate below to run it again."
                />
              ) : (
                (() => {
                  const markdown = message.isStreaming ? (
                    <StreamingMarkdownContent
                      content={cleanedContent}
                      isStreaming
                      citations={citationsByMarker}
                    />
                  ) : (
                    <MarkdownContent content={cleanedContent} citations={citationsByMarker} />
                  );
                  return formatCardType ? (
                    <MessageFormatCard
                      content={cleanedContent}
                      cardType={formatCardType}
                      messageId={message.id}
                    >
                      {markdown}
                    </MessageFormatCard>
                  ) : (
                    markdown
                  );
                })()
              )}
            </div>
            {isUser && userContentOverflows && !userContentExpanded && !isEditing && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
                style={{
                  background: 'linear-gradient(to bottom, transparent, var(--chat-user-bubble-bg))',
                  borderBottomLeftRadius: 'var(--chat-user-bubble-radius)',
                  borderBottomRightRadius: 'var(--chat-user-bubble-radius)',
                }}
              />
            )}
          </div>
          {isUser && userContentOverflows && !isEditing && (
            <button
              type="button"
              onClick={() => setUserContentExpanded((expanded) => !expanded)}
              aria-expanded={userContentExpanded}
              className="mt-1.5 text-xs font-medium underline-offset-2 hover:underline"
            >
              {userContentExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
          {/* Interactive cards sit AFTER the prose that motivated them and
              before the artifact chip, matching where the model emitted them.
              A card that fails to render its kind still renders its authored
              fallback, so this block never leaves a gap in the answer. */}
          {!isUser && message.metadata?.interactiveCards?.length ? (
            <InteractiveCardBlock cards={message.metadata.interactiveCards} />
          ) : null}

          {/* Compact chip while an artifact block streams into the panel, the raw
              fence is stripped from the body above; this is its in-transcript stand-in. */}
          {!isUser && streamingBlock && (
            <button
              type="button"
              onClick={() => {
                useArtifactsStore.getState().setPanelOpen(true);
              }}
              className="mt-2 flex items-center gap-2 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/70"
              aria-label="Show artifact being written"
            >
              <span
                className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"
                aria-hidden="true"
              />
              <span>
                Writing {streamingBlock.language === 'text' ? 'artifact' : streamingBlock.language}…
              </span>
            </button>
          )}

          {/* Attachments (Fix 43) · image thumbnails or file-type icons.
              Image attachments render a real <img> thumbnail that opens the
              full-size ImageLightbox on click (claude.ai parity), with a
              muted loading placeholder behind the image and a graceful
              broken-image fallback when the source fails to load. Non-image
              attachments keep the icon+name chip linking to the file. */}
          {displayAttachments.length > 0 && (
            // `items-start`: a flex row defaults to `align-items: stretch`, so
            // the compact file chip was being stretched to the height of the
            // 96px image thumbnail beside it, rendering as a near-empty
            // 150x96 card with one line of text floating in the middle. The
            // chip now keeps its natural height and aligns to the thumbnail's
            // top edge.
            <div className="mt-2 flex flex-wrap items-start gap-2">
              {displayAttachments.map((attachment) => {
                const isImage = attachment.type.startsWith('image/');
                const isDoc =
                  attachment.type === 'application/pdf' ||
                  attachment.type.includes('word') ||
                  attachment.type.includes('document');
                const shouldPreview = attachment.type === 'application/pdf';

                if (isImage) {
                  // Broken-image fallback: never leave a torn-image glyph, show
                  // a labelled chip so the user still sees which file failed.
                  if (brokenAttachmentIds.has(attachment.id)) {
                    return (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1.5"
                        title={attachment.name}
                      >
                        <ImageOff
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="max-w-[160px] truncate text-xs text-muted-foreground">
                          {attachment.name}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() => setLightboxAttachment(attachment)}
                      className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`View ${attachment.name} full size`}
                      title={attachment.name}
                    >
                      <img
                        src={attachment.thumbnailUrl ?? attachment.url}
                        alt={attachment.name}
                        loading="lazy"
                        onError={() => markAttachmentBroken(attachment.id)}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <span
                        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden="true"
                      >
                        <ZoomIn className="h-6 w-6 text-white" />
                      </span>
                    </button>
                  );
                }

                return (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target={shouldPreview ? '_blank' : undefined}
                    rel={shouldPreview ? 'noopener noreferrer' : undefined}
                    download={shouldPreview ? undefined : attachment.name}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border border-border/50 overflow-hidden',
                      'bg-muted/40 hover:bg-muted/70 transition-colors text-left no-underline',
                      'px-2.5 py-1.5',
                    )}
                    title={`${shouldPreview ? 'Preview' : 'Download'} ${attachment.name}`}
                  >
                    {isDoc ? (
                      <FileText
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <File className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="max-w-[180px] truncate text-xs text-foreground">
                        {attachment.name}
                      </span>
                      {/* The size is real data the composer already showed
                          before sending; dropping it in the transcript made the
                          chip read as a placeholder. Only rendered when the
                          byte count is actually known. */}
                      {typeof attachment.size === 'number' && attachment.size > 0 && (
                        <span className="text-[12px] text-muted-foreground">
                          {formatBytes(attachment.size)}
                        </span>
                      )}
                    </span>
                  </a>
                );
              })}
            </div>
          )}

          {/* Full-size image viewer for attachment thumbnails (Esc / backdrop to
              close, zoom + download). Rendered once per bubble; driven by which
              attachment the user clicked above. */}
          {lightboxAttachment && (
            <ImageLightbox
              images={lightboxImages}
              initialIndex={lightboxImages.findIndex((image) => image.id === lightboxAttachment.id)}
              onClose={() => setLightboxAttachment(null)}
            />
          )}

          {/* Code blocks are rendered exactly once by <MarkdownContent> above
              (syntax-highlighted by Shiki, with a copy button + lang label).
              A previous <ArtifactBlock content={cleanedContent}> here
              RE-rendered every fenced block a second time, so non-renderable
              blocks (python/csv/json/generic, the ones NOT stripped from
              cleanedContent by removeArtifactBlocks) appeared twice (the visible
              "duplicate code block" bug). Renderable artifacts (html/react/svg/
              mermaid) are already stripped from cleanedContent and surfaced via
              <InlineArtifactCards> / the Artifacts panel below, so removing the
              inline ArtifactBlock loses no unique rendering. */}

          {/* Inline artifact thumbnail cards · quick visual summary, click to open panel */}
          {!isUser && inlineArtifacts.length > 0 && (
            <InlineArtifactCards artifacts={inlineArtifacts} />
          )}

          {/* Image generation card (states A/B/C/D) */}
          {!isUser && message.metadata?.toolType === 'image-generation' && (
            <div className="mt-4">
              <ImageGenerationCard
                imageUrl={message.metadata.imageUrl as string | undefined}
                isGenerating={message.isStreaming === true}
                prompt={message.metadata.imageGenPrompt as string | undefined}
                aspectRatio={message.metadata.imageGenAspect as ImageAspectRatio | undefined}
                modelId={message.metadata.imageGenModel as string | undefined}
                retryAt={message.metadata.imageRetryAt as string | undefined}
                onRegenerate={onRegenerateImage}
              />
            </div>
          )}

          {/* Video generation in flight. Veo takes 1-2 minutes, so the slot the
              video will occupy is reserved with a shimmering placeholder rather
              than left empty: the thread does not jump when the result lands,
              and an empty gap for two minutes is indistinguishable from a
              silent failure.

              `isStreaming` is the in-flight signal, NOT "no URL yet". When the
              only condition was a missing videoUrl, a FAILED generation, which
              also has no URL, kept shimmering forever directly above its own
              "Video generation failed" text, so a dead turn was indistinguishable
              from a live one. Observed against the real route (503, no provider
              key configured) on 2026-07-27. The writer clears `isStreaming` on
              every exit, success or failure. */}
          {!isUser &&
            message.metadata?.toolType === 'video-generation' &&
            message.isStreaming === true &&
            !message.metadata?.videoUrl &&
            !videoError && (
              <VideoGenerationPlaceholder
                startedAt={message.timestamp.toISOString()}
                aspectRatio={message.metadata?.videoAspect}
                taskId={
                  typeof message.metadata?.videoTaskId === 'string'
                    ? message.metadata.videoTaskId
                    : undefined
                }
              />
            )}

          {!isUser &&
            message.metadata?.toolType === 'video-generation' &&
            !message.isStreaming &&
            !message.metadata?.videoUrl &&
            typeof message.metadata?.videoTaskId === 'string' &&
            (message.metadata?.videoStatus === 'queued' ||
              message.metadata?.videoStatus === 'processing') && (
              <div
                className="mt-4 flex w-full max-w-lg items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/35 p-4"
                role="status"
                aria-live="polite"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Your video is still being generated
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {message.metadata.videoError
                      ? 'Status checking paused. The durable task is still safe to resume.'
                      : 'You can leave this chat and come back later.'}
                    {typeof message.metadata.videoProgress === 'number'
                      ? ` ${message.metadata.videoProgress}% complete.`
                      : ''}
                  </p>
                </div>
                {onResumeVideo && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onResumeVideo(message.id)}
                    className="shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Resume checking
                  </Button>
                )}
              </div>
            )}

          {!isUser &&
            message.metadata?.toolType === 'video-generation' &&
            !message.isStreaming &&
            !message.metadata?.videoUrl &&
            message.metadata?.videoStatus === 'failed' && (
              <div
                className="mt-4 flex w-full max-w-lg items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/35 p-4"
                role="status"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Video generation ended</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {message.metadata.videoRetryable === true
                      ? 'This task is terminally failed. Trying again starts a new generation.'
                      : 'Resend the prompt to start a new generation. This older attempt cannot be replayed safely.'}
                  </p>
                </div>
                {message.metadata.videoRetryable === true && onRetryVideo && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRetryVideo(message.id)}
                    className="shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Try video again
                  </Button>
                )}
              </div>
            )}

          {!isUser &&
            message.metadata?.toolType === 'video-generation' &&
            !message.isStreaming &&
            !message.metadata?.videoUrl &&
            !message.metadata?.videoTaskId &&
            (message.metadata?.videoStatus === 'queued' ||
              message.metadata?.videoStatus === 'processing') && (
              <div
                className="mt-4 w-full max-w-lg rounded-xl border border-border/60 bg-muted/35 p-4"
                role="status"
                aria-live="polite"
              >
                <p className="text-sm font-medium text-foreground">Video start was not confirmed</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reload this chat once to recover a task that was accepted. If this message
                  remains, the video did not start and you can safely try again.
                </p>
              </div>
            )}

          {/* Video Result with Error Handling */}
          {!isUser &&
            message.metadata?.toolType === 'video-generation' &&
            message.metadata?.videoUrl && (
              <div className="mt-4 flex flex-col gap-2">
                {videoError ? (
                  <div className="flex items-center justify-center p-8 bg-muted/50 text-muted-foreground rounded-xl">
                    <span className="text-sm">Video failed to load</span>
                  </div>
                ) : (
                  <>
                    <span className="text-sm text-foreground">Your video is ready!</span>
                    <div className="group relative w-fit overflow-hidden rounded-xl">
                      <video
                        src={message.metadata.videoUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="max-h-96 rounded-xl"
                        poster={message.metadata.thumbnailUrl}
                        onError={() => setVideoError(true)}
                      />
                      {/* Overlaid top-right rather than in a row below, matching
                          the reference. focus-within keeps it keyboard-reachable,
                          which hover alone would not, and motion-reduce pins it
                          visible for users who get no transition cue. */}
                      <a
                        href={message.metadata.videoUrl}
                        download
                        aria-label="Download video"
                        className={cn(
                          'absolute right-2 top-2 flex h-8 w-8 items-center justify-center',
                          'rounded-full bg-black/55 text-white hover:bg-black/75',
                          'opacity-0 transition-opacity duration-150',
                          'group-hover:opacity-100 group-focus-within:opacity-100',
                          'focus-visible:opacity-100 motion-reduce:opacity-100',
                        )}
                      >
                        <Download size={14} aria-hidden="true" />
                      </a>
                    </div>
                  </>
                )}
              </div>
            )}

          {/* Tool timeline rendered above prose (moved before message content section). */}

          {/* Thinking Steps (Collapsible) */}
          {hasThinkingSteps && (
            <Collapsible open={showThinking} onOpenChange={setShowThinking} className="mt-3">
              <CollapsibleTrigger asChild>
                <button
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                  aria-expanded={showThinking}
                  aria-label="Toggle thinking process visibility"
                >
                  {showThinking ? (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  )}
                  <Brain className="h-3 w-3" aria-hidden="true" />
                  Thinking process ({message.metadata?.thinkingSteps?.length} steps)
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                  {message.metadata?.thinkingSteps?.map((step, stepIndex) => (
                    <div
                      key={`thinking-step-${stepIndex}-${step.slice(0, 20)}`}
                      className="flex gap-2 text-xs text-muted-foreground"
                    >
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-[12px] font-semibold text-primary">
                        {stepIndex + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Agent Contributions (Collapsible) */}
          {hasContributions && (
            <Collapsible
              open={showContributions}
              onOpenChange={setShowContributions}
              className="mt-3"
            >
              <CollapsibleTrigger asChild>
                <button
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                  aria-expanded={showContributions}
                  aria-label="Toggle agent contributions visibility"
                >
                  {showContributions ? (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  )}
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  {message.metadata?.collaborationMessages?.length} agents contributed
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {message.metadata?.collaborationMessages?.map((collab, collabIndex) => (
                  <div
                    key={`collab-${collabIndex}-${collab.employeeName}`}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        {collab.employeeAvatar &&
                          (collab.employeeAvatar.startsWith('http') ||
                            collab.employeeAvatar.startsWith('/')) && (
                            <AvatarImage src={collab.employeeAvatar} />
                          )}
                        <AvatarFallback
                          className="text-[12px] font-semibold text-white"
                          style={{
                            backgroundColor:
                              collab.employeeAvatar &&
                              !collab.employeeAvatar.startsWith('http') &&
                              !collab.employeeAvatar.startsWith('/')
                                ? collab.employeeAvatar
                                : '#6366f1',
                          }}
                        >
                          {collab.employeeName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium">{collab.employeeName}</span>
                      {collab.messageType && (
                        <Badge variant="secondary" className="h-4 text-[12px]">
                          {collab.messageType}
                        </Badge>
                      )}
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                      <MarkdownContent content={collab.content} />
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {!isUser && !message.isStreaming && !fallbackNoticeDismissed && fallbackNotice && (
            <div
              role="status"
              data-testid="fallback-reason-notice"
              className="mt-1.5 flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-[12px] text-[var(--chat-text-muted)]"
            >
              <CircleAlert className="mt-[1px] h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="flex-1">{fallbackNotice}</span>
              <button
                type="button"
                onClick={() => setFallbackNoticeDismissed(true)}
                aria-label="Dismiss model substitution notice"
                className="shrink-0 rounded underline-offset-2 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {!isUser &&
            !message.isStreaming &&
            !secretRedactionNoticeDismissed &&
            secretRedactionNotice && (
              <div
                role="status"
                data-testid="secret-redaction-notice"
                className="mt-1.5 flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-[12px] text-[var(--chat-text-muted)]"
              >
                <CircleAlert className="mt-[1px] h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="flex-1">{secretRedactionNotice}</span>
                <button
                  type="button"
                  onClick={() => setSecretRedactionNoticeDismissed(true)}
                  aria-label="Dismiss secret redaction notice"
                  className="shrink-0 rounded underline-offset-2 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

          {!isUser && !message.isStreaming && searchSources.length > 0 && (
            <div className="mt-2 flex justify-end">
              <SourcesControl
                messageId={message.id}
                cited={citedSources}
                more={moreSources}
                query={searchQuery}
              />
            </div>
          )}

          {showNoSearchResultsNotice && (
            <div className="mt-2">
              <TranscriptNotice
                tone="neutral"
                icon={CircleAlert}
                message="Web search didn't return results for this turn, so the answer relies on the model's own knowledge."
                action={
                  onRegenerate
                    ? {
                        label: 'Retry',
                        ariaLabel: 'Retry this response with web search',
                        icon: RefreshCw,
                        onClick: () => onRegenerate(message.id),
                      }
                    : undefined
                }
              />
            </div>
          )}

          {!isEditing && (
            <div
              data-testid="message-action-row"
              className={cn(
                'flex flex-nowrap items-center gap-1 transition-opacity',
                ACTION_ROW_MIN_HEIGHT,
                isUser ? 'mt-1 justify-end' : 'mt-2',
                isUser || !isLatestTurn
                  ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100'
                  : 'opacity-100',
              )}
            >
              {!message.isStreaming && (
                <TooltipProvider delayDuration={300}>
                  {isUser && onEdit && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(ACTION_BUTTON_SIZE, ACTION_BUTTON_TONE)}
                          onClick={handleBeginEdit}
                          aria-label="Edit message"
                        >
                          <Pencil className={ACTION_ICON_SIZE} aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(ACTION_BUTTON_SIZE, ACTION_BUTTON_TONE)}
                        onClick={handleCopy}
                        aria-label={copied ? 'Message copied' : 'Copy message'}
                      >
                        {copied ? (
                          <Check className={ACTION_ICON_SIZE} aria-hidden="true" />
                        ) : (
                          <Copy className={ACTION_ICON_SIZE} aria-hidden="true" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy</TooltipContent>
                  </Tooltip>

                  {!isUser && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              ACTION_BUTTON_SIZE,
                              ACTION_BUTTON_TONE,
                              responseRating === 'up' && 'text-[var(--chat-accent-primary-text)]',
                            )}
                            onClick={() => rateResponse('up')}
                            aria-label="Good response"
                            aria-pressed={responseRating === 'up'}
                          >
                            <ThumbsUp
                              className={cn(
                                ACTION_ICON_SIZE,
                                responseRating === 'up' && 'fill-current',
                              )}
                              aria-hidden="true"
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {responseRating === 'up' ? 'Remove rating' : 'Good response'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              ACTION_BUTTON_SIZE,
                              ACTION_BUTTON_TONE,
                              responseRating === 'down' && 'text-[var(--chat-accent-primary-text)]',
                            )}
                            onClick={() => rateResponse('down')}
                            aria-label="Bad response"
                            aria-pressed={responseRating === 'down'}
                          >
                            <ThumbsDown
                              className={cn(
                                ACTION_ICON_SIZE,
                                responseRating === 'down' && 'fill-current',
                              )}
                              aria-hidden="true"
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {responseRating === 'down' ? 'Remove rating' : 'Bad response'}
                        </TooltipContent>
                      </Tooltip>
                      {isAgiWorkTurn && taskRunId && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <ComposerFeedbackDialog
                                variant="task"
                                runId={taskRunId}
                                messageId={message.id}
                                conversationId={message.sessionId ?? activeConversationId}
                                triggerClassName={cn(
                                  ACTION_BUTTON_SIZE,
                                  ACTION_BUTTON_TONE,
                                  'inline-flex items-center justify-center rounded-md transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
                                  ACTION_ICON_SIZE_DESCENDANT,
                                )}
                              />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{AGI_WORK_FEEDBACK_LABEL}</TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  )}

                  {variantPager}

                  {!isUser &&
                    !voiceModeActive &&
                    onRegenerate &&
                    message.metadata?.toolType !== 'image-generation' &&
                    message.metadata?.toolType !== 'video-generation' &&
                    (onRegenerateWithModel && regenerateModelOptions?.length ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(ACTION_BUTTON_SIZE, ACTION_BUTTON_TONE)}
                            aria-label="Regenerate response"
                          >
                            <RefreshCw className={ACTION_ICON_SIZE} aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                          <DropdownMenuItem onClick={() => onRegenerate(message.id)}>
                            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                            Try again
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[12px] font-normal text-[var(--chat-text-muted)]">
                            Try again with
                          </DropdownMenuLabel>
                          {regenerateModelOptions.map((option) => (
                            <DropdownMenuItem
                              key={option.id}
                              onClick={() => onRegenerateWithModel(message.id, option.id)}
                            >
                              <span className="min-w-0 flex-1 truncate">{option.name}</span>
                              {option.id === (message.model ?? message.metadata?.model) && (
                                <Check className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(ACTION_BUTTON_SIZE, ACTION_BUTTON_TONE)}
                            onClick={() => onRegenerate(message.id)}
                            aria-label="Regenerate response"
                          >
                            <RefreshCw className={ACTION_ICON_SIZE} aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Regenerate</TooltipContent>
                      </Tooltip>
                    ))}

                  {!isUser && !voiceModeActive && onBranch && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(ACTION_BUTTON_SIZE, ACTION_BUTTON_TONE)}
                          disabled={isBranching}
                          onClick={() => onBranch(message.id)}
                          aria-label={
                            isBranching ? 'Creating branch…' : 'Branch conversation from here'
                          }
                        >
                          <GitFork className={ACTION_ICON_SIZE} aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isBranching
                          ? 'Creating branch…'
                          : 'Branch conversation: this chat stays unchanged'}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(ACTION_BUTTON_SIZE, ACTION_BUTTON_TONE)}
                        aria-label="More message actions"
                      >
                        <MoreHorizontal className={ACTION_ICON_SIZE} aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={isUser ? 'end' : 'start'}>
                      <DropdownMenuLabel className="text-[12px] font-normal text-[var(--chat-text-muted)]">
                        <span className="block">
                          Sent at{' '}
                          <time
                            data-testid="message-timestamp"
                            dateTime={message.timestamp.toISOString()}
                            title={message.timestamp.toLocaleString()}
                            className="tabular-nums"
                          >
                            {message.timestamp.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </span>
                        {answeredByLabel && (
                          <span className="block truncate">{answeredByLabel}</span>
                        )}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {!isUser && isReadAloudSupported && onReadAloud && (
                        <DropdownMenuCheckboxItem
                          checked={isReadingAloud}
                          onCheckedChange={() => onReadAloud(message.id, message.content)}
                        >
                          {isReadingAloud ? (
                            <Square className="mr-2 h-4 w-4 fill-current" aria-hidden="true" />
                          ) : (
                            <Volume2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          )}
                          {isReadingAloud ? 'Stop reading message' : 'Read message aloud'}
                        </DropdownMenuCheckboxItem>
                      )}
                      {onPin && (
                        <DropdownMenuCheckboxItem
                          checked={Boolean(message.metadata?.isPinned)}
                          onCheckedChange={() => onPin(message.id)}
                        >
                          <Pin
                            className={cn(
                              'mr-2 h-4 w-4',
                              message.metadata?.isPinned && 'fill-current',
                            )}
                            aria-hidden="true"
                          />
                          {message.metadata?.isPinned ? 'Unpin message' : 'Pin message'}
                        </DropdownMenuCheckboxItem>
                      )}
                      {isUser && onBranch && (
                        <DropdownMenuItem
                          disabled={isBranching}
                          onClick={() => onBranch(message.id)}
                        >
                          <GitFork className="mr-2 h-4 w-4" aria-hidden="true" />
                          {isBranching ? 'Creating branch…' : 'Branch conversation from here'}
                        </DropdownMenuItem>
                      )}
                      {!isUser && (
                        <DropdownMenuItem
                          disabled={reportState !== 'idle'}
                          onClick={() => void reportMessage()}
                        >
                          <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
                          {reportState === 'sent'
                            ? 'Reported'
                            : reportState === 'sending'
                              ? 'Reporting…'
                              : 'Report this response'}
                        </DropdownMenuItem>
                      )}
                      {message.metadata?.tokensUsed ? (
                        <>
                          <DropdownMenuSeparator />
                          <div className="px-2 py-1.5">
                            <TokenUsageDisplay
                              variant="detailed"
                              tokensUsed={message.metadata.tokensUsed}
                              inputTokens={message.metadata.inputTokens}
                              outputTokens={message.metadata.outputTokens}
                              model={message.metadata.model}
                              cost={
                                typeof message.metadata.cost === 'number'
                                  ? message.metadata.cost / 100
                                  : undefined
                              }
                            />
                            {typeof message.metadata.totalDurationMs === 'number' && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {(message.metadata.totalDurationMs / 1000).toFixed(1)}s
                              </div>
                            )}
                          </div>
                        </>
                      ) : null}
                      {(onDelete || canDeleteVariant) && <DropdownMenuSeparator />}
                      {canDeleteVariant && (
                        <DropdownMenuItem
                          onClick={handleDeleteVariantWithConfirm}
                          className="text-danger focus:text-danger"
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          Delete this response and what follows
                        </DropdownMenuItem>
                      )}
                      {onDelete && (
                        <DropdownMenuItem
                          onClick={handleDeleteWithConfirm}
                          className="text-danger focus:text-danger"
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipProvider>
              )}
            </div>
          )}
        </div>
        {/* closes .message-inner */}
      </div>
    </motion.div>
  );
};

/**
 * AUDIT-FIX BUG-28: attachment descriptors, compared field by field.
 *
 * `attachments` was absent from the comparator entirely while the parent
 * (ChatMessageList) hands this component a freshly built array. When an upload
 * finished and nothing else on the message changed, the comparator answered
 * "equal" and the card kept rendering the pre-upload state forever. A custom
 * comparator that omits a real prop is worse than no comparator at all.
 */
function attachmentsEqual(prev?: Attachment[], next?: Attachment[]): boolean {
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
      left.url !== right.url ||
      left.thumbnailUrl !== right.thumbnailUrl
    ) {
      return false;
    }
  }
  return true;
}

/**
 * AUDIT-FIX STR-17: every tool entry, not a sample of the ends.
 * With three or more parallel tools the middle cards never left 'running', and
 * Approve/Reject: which flips one entry, usually an interior one, produced no
 * visible feedback until the whole batch resolved.
 */
function toolEntriesEqual(prev?: ToolEntry[], next?: ToolEntry[]): boolean {
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
 * AUDIT-FIX BUG-29 / STR-17: metadata equality without serializing the bag.
 *
 * The previous implementation ran `JSON.stringify` over BOTH metadata objects
 * on every comparison, once per streamed token per visible message, on the
 * render-critical path, in a list with no virtualization, over a bag that
 * carries the full tool timeline, search results, thinking segments and file
 * descriptors. It was also key-order sensitive, so a re-serialized bag with
 * reordered keys reported "changed" even when nothing had.
 *
 * Field comparison replaces it. Reference identity is the right test for the
 * object-valued spines because the store patches metadata immutably
 * (`{ ...m.metadata, ...patch }` in web-chat-store) and the activity reducer
 * returns a new object for every event it applies, so `!==` means "changed"
 * with no traversal.
 */
function metadataEqual(prev: Message['metadata'], next: Message['metadata']): boolean {
  if (prev === next) return true;
  return (
    prev?.isPinned === next?.isPinned &&
    prev?.isPasted === next?.isPasted &&
    prev?.reaction === next?.reaction &&
    prev?.model === next?.model &&
    prev?.tokensUsed === next?.tokensUsed &&
    prev?.inputTokens === next?.inputTokens &&
    prev?.outputTokens === next?.outputTokens &&
    prev?.cost === next?.cost &&
    prev?.thinkingContent === next?.thinkingContent &&
    prev?.isThinkingStreaming === next?.isThinkingStreaming &&
    prev?.thinkingDurationSeconds === next?.thinkingDurationSeconds &&
    prev?.thinkingSegments === next?.thinkingSegments &&
    prev?.thinkingSteps === next?.thinkingSteps &&
    prev?.isThinking === next?.isThinking &&
    prev?.agentActivity === next?.agentActivity &&
    prev?.research === next?.research &&
    prev?.generatedFiles === next?.generatedFiles &&
    prev?.generatedFile === next?.generatedFile &&
    prev?.artifactManifest === next?.artifactManifest &&
    prev?.computeSession === next?.computeSession &&
    prev?.documentData === next?.documentData &&
    prev?.searchResults === next?.searchResults &&
    prev?.isSearching === next?.isSearching &&
    prev?.isExecutingCode === next?.isExecutingCode &&
    prev?.codeExecutionResult === next?.codeExecutionResult &&
    prev?.citations === next?.citations &&
    prev?.comparisonOptions === next?.comparisonOptions &&
    prev?.comparisonChoice === next?.comparisonChoice &&
    prev?.collaborationMessages === next?.collaborationMessages &&
    prev?.isMultiAgent === next?.isMultiAgent &&
    prev?.paywall === next?.paywall &&
    prev?.interactiveCards === next?.interactiveCards &&
    prev?.imageUrl === next?.imageUrl &&
    prev?.imageData === next?.imageData &&
    prev?.imageGenPrompt === next?.imageGenPrompt &&
    prev?.imageGenAspect === next?.imageGenAspect &&
    prev?.imageGenModel === next?.imageGenModel &&
    prev?.imageRetryAt === next?.imageRetryAt &&
    prev?.videoUrl === next?.videoUrl &&
    prev?.videoTaskId === next?.videoTaskId &&
    prev?.videoStatus === next?.videoStatus &&
    prev?.videoProvider === next?.videoProvider &&
    prev?.videoModel === next?.videoModel &&
    prev?.videoProgress === next?.videoProgress &&
    prev?.videoError === next?.videoError &&
    prev?.videoRetryable === next?.videoRetryable &&
    prev?.videoData === next?.videoData &&
    prev?.thumbnailUrl === next?.thumbnailUrl &&
    prev?.toolResult === next?.toolResult &&
    prev?.toolType === next?.toolType &&
    prev?.isDocument === next?.isDocument &&
    prev?.documentTitle === next?.documentTitle &&
    toolEntriesEqual(prev?.tools, next?.tools)
  );
}

/**
 * MessageBubble with memoization to prevent unnecessary re-renders.
 *
 * Custom comparison function checks:
 * - message.id, message.content, message.role, message.timestamp, attachments
 * - Callback references (onEdit, onRegenerate, etc.)
 * - every metadata field the component actually renders
 */
export const MessageBubble = React.memo(MessageBubbleComponent, (prev, next) => {
  // Return true if props are EQUAL (skip re-render), false if different (re-render)

  // Check message identity
  if (
    prev.message.id !== next.message.id ||
    prev.message.content !== next.message.content ||
    prev.message.role !== next.message.role
  ) {
    return false;
  }

  // Check timestamp (may update for streaming messages)
  if (prev.message.timestamp.getTime() !== next.message.timestamp.getTime()) {
    return false;
  }

  // Streaming flag flip must re-render even when content is unchanged (it
  // drives the action row, the live-artifact overlay teardown, and the
  // streaming placeholder).
  if (prev.message.isStreaming !== next.message.isStreaming) {
    return false;
  }

  // AUDIT-FIX BUG-28: attachments participate.
  if (!attachmentsEqual(prev.message.attachments, next.message.attachments)) return false;

  // AUDIT-FIX BUG-29: targeted comparison, no per-token JSON.stringify.
  if (!metadataEqual(prev.message.metadata, next.message.metadata)) return false;

  // Check callback references (they should be memoized by parent)
  if (prev.onEdit !== next.onEdit) return false;
  if (prev.onRegenerate !== next.onRegenerate) return false;
  if (prev.onDelete !== next.onDelete) return false;
  if (prev.onDeleteVariant !== next.onDeleteVariant) return false;
  if (prev.countVariantFollowers !== next.countVariantFollowers) return false;
  if (prev.onPin !== next.onPin) return false;
  if (prev.onReact !== next.onReact) return false;
  if (prev.onBranch !== next.onBranch) return false;
  if (prev.onReadAloud !== next.onReadAloud) return false;
  if (prev.onRegenerateImage !== next.onRegenerateImage) return false;
  if (prev.onResumeVideo !== next.onResumeVideo) return false;
  if (prev.onRetryVideo !== next.onRetryVideo) return false;
  if (prev.onSelectVariant !== next.onSelectVariant) return false;

  // Check flags
  if (prev.isBranching !== next.isBranching) return false;
  if (prev.branchNavigation !== next.branchNavigation) return false;
  // BUG-27/BUG-28 class: a comparator that does not name a prop swallows every
  // update to it. Regenerating turns a 1/1 into a 2/2 without touching the
  // message, so the pager would keep reporting the count it first rendered.
  if (prev.variantInfo !== next.variantInfo) return false;
  if (prev.isConversationStreaming !== next.isConversationStreaming) return false;
  if (prev.isReadingAloud !== next.isReadingAloud) return false;
  if (prev.isReadAloudSupported !== next.isReadAloudSupported) return false;
  if (prev.isLatestTurn !== next.isLatestTurn) return false;
  if (prev.onRegenerateWithModel !== next.onRegenerateWithModel) return false;
  if (prev.regenerateModelOptions !== next.regenerateModelOptions) return false;
  if (prev.hasBranches !== next.hasBranches) return false;
  if (prev.animationIndex !== next.animationIndex) return false;

  // All props are equal, skip re-render
  return true;
});

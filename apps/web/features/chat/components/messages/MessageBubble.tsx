/**
 * MessageBubble - Clean, minimal message display
 *
 * Redesigned with:
 * - Progressive disclosure (details on hover/click)
 * - Minimal metadata inline
 * - Clean visual hierarchy
 * - Token usage hidden by default
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@agiworkforce/ui';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@agiworkforce/ui';
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Brain,
  MoreHorizontal,
  Pin,
  Pencil,
  RefreshCw,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  GitFork,
  FileText,
  File,
  ImageOff,
  ZoomIn,
  Volume2,
  Square,
  Download,
  Video,
  Flag,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { toast } from 'sonner';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { TokenUsageDisplay } from '../tokens/TokenUsageDisplay';
import type { ArtifactManifest, ComputeSession, GeneratedFile } from '@agiworkforce/types';
import {
  AgentActivityTimeline,
  BranchNavigator,
  type BranchItem,
} from '@agiworkforce/unified-chat';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

const MarkdownContent = dynamic(
  () => import('@agiworkforce/unified-chat').then((mod) => mod.MarkdownContent),
  {
    loading: () => <div className="h-4 w-32 animate-pulse rounded bg-muted" />,
  },
);

import type { ArtifactData } from '../artifacts/ArtifactPreview';
import { InlineArtifactCards } from '../artifacts/InlineArtifactCards';
import { extractArtifacts, removeArtifactBlocks } from '../../utils/artifact-detector';
import { extractTrailingUnclosedBlock, isRenderableArtifact } from '@agiworkforce/artifacts';
import { useStreamingArtifactSync } from '../../hooks/use-streaming-artifact';
import { useArtifactsStore } from '../../stores/artifacts-store';
import {
  useChatStore,
  type GeneratedFileMetadataEntry,
  type MessageMetadata as StoreMessageMetadata,
} from '@shared/stores/web-chat-store';
import { useToolApprovalResolver, isApprovalTurnLive } from '@/lib/hooks/useChatStream';
import { ToolTimeline, type ToolEntry } from './ToolTimeline';
import type { SearchResponse, SearchResult, MediaGenerationResult } from '../../types/search-media';
import type { GeneratedDocument } from '../../types/message-metadata';
import { ThinkingBlock } from '../ThinkingBlock';
import { ComparisonResponse } from './ComparisonResponse';
import { InlineSourceTags, type Citation } from './InlineSourceTags';
import type { InteractiveCard } from '@agiworkforce/types';
import { InteractiveCardBlock } from './InteractiveCardBlock';
import { useComparisonStore } from '../../stores/comparison-store';
import { InlineSourcesList } from '../research/ResearchPanel';
import { useResearchPanelStore, type ResearchSource } from '../../stores/research-panel-store';
import { ResearchActivity } from '../research/ResearchActivity';
import type { MessageResearchState } from '@shared/stores/web-chat-store';
import { dedupeResearchSources } from '../../utils/research-sources';
import { ImageGenerationCard } from '../ImageGenerationCard';
import { ImageLightbox } from '../ImageLightbox';
import type { ImageAspectRatio } from '../Composer/ChatComposerNew';
import { CodeExecutionBlock } from './CodeExecutionBlock';

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

/**
 * AUDIT-FIX GOV-38: message action buttons were `h-7 w-7` — a 28px target,
 * below the 44px minimum, across every site in the action row. Touch viewports
 * now get a true 44px control; pointer viewports (sm and up, where the row is
 * hover-revealed anyway) keep a compact 32px button. `touch-manipulation`
 * removes the 300ms tap delay that made the small targets feel unresponsive.
 */
const ACTION_BUTTON_SIZE = 'h-11 w-11 touch-manipulation sm:h-8 sm:w-8';

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
 * For every other language — python, sql, a bare fence with no info string —
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

interface Message {
  id: string;
  sessionId?: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  /** Provider/model string set by useChatStream (e.g. "anthropic/claude-sonnet-5"). */
  model?: string;
  employeeId?: string;
  employeeName?: string;
  employeeAvatar?: string;
  employeeColor?: string;
  isStreaming?: boolean;
  reactions?: Array<{ type: string; userId: string }>;
  attachments?: Attachment[];
  metadata?: {
    isDocument?: boolean;
    documentTitle?: string;
    hasWorkStream?: boolean;
    workStreamData?: Record<string, unknown>;
    isPinned?: boolean;
    tokensUsed?: number;
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
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
    imageData?: MediaGenerationResult;
    videoUrl?: string;
    thumbnailUrl?: string;
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
    paywall?: { feature: string; requiredTier: string };
    /**
     * Parsed interactive cards. The union already encodes whether a body was
     * validated, so this renderer never sees an unvalidated payload — an
     * unrecognized card carries only its envelope and its authored fallback.
     */
    interactiveCards?: InteractiveCard[];
    /** Deep Research run state (activity header + persistence). */
    research?: MessageResearchState;
  };
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
  /** True while a research retry for THIS message is in flight. */
  isRetryingResearch?: boolean;
  onDelete?: (messageId: string) => void;
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
  hasBranches?: boolean;
  /** Re-generates an image result in-place (edit/aspect-ratio change). */
  onRegenerateImage?: (opts: {
    prompt: string;
    aspectRatio: ImageAspectRatio;
    modelId?: string;
  }) => Promise<string>;
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
  isRetryingResearch = false,
  onDelete,
  onPin,
  onBranch,
  isBranching = false,
  branchNavigation,
  onReact,
  onReadAloud,
  isReadingAloud = false,
  isReadAloudSupported = false,
  hasBranches,
  animationIndex = 0,
  onRegenerateImage,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
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
   * reach — it only caps CSS transitions and animations. The preference has to
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

  // Manual tool-approval wiring: an awaiting_approval tool card's approve/reject
  // buttons drive the resume request. The resolver comes from ToolApprovalContext
  // (mounted by the chat page, which owns the Clerk-authenticated resolver), via
  // useContext — so MessageBubble stays provider-independent and renderable
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

  const [reportState, setReportState] = useState<'idle' | 'sending' | 'sent'>('idle');

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
      toast.success('Reported. Thank you — our trust and safety team will review it.');
    } catch {
      setReportState('idle');
      toast.error('Could not send the report. Please try again.');
    }
  }, [activeConversationId, message.content, message.id, message.sessionId, reportState]);
  const artifactConversationId = message.sessionId ?? activeConversationId ?? undefined;
  const setComparisonChoice = useComparisonStore((state) => state.setComparisonChoice);
  const storedChoice = useComparisonStore((state) =>
    state.getComparisonChoice(message.sessionId ?? '', message.id),
  );

  // Artifact handling
  const existingArtifacts = getMessageArtifacts(message.id);
  const extractedArtifacts = useMemo(() => {
    if (isUser) return [];
    // Pass message context so derived ids are deterministic + cross-surface
    // stable (the shared derivation keys on conversationId:messageId:ordinal).
    return extractArtifacts(message.content, {
      conversationId: artifactConversationId,
      messageId: message.id,
    });
  }, [message.content, isUser, artifactConversationId, message.id]);

  // Live artifact streaming (Claude parity): while this assistant message is
  // still streaming and its buffer ends in an UNCLOSED renderable fence, parse
  // the partial block on every chunk. The sync hook mirrors it into the
  // ephemeral streaming-artifact store (auto-opening the Artifacts panel) so
  // the panel shows the file being written line-by-line instead of nothing.
  // Once the closing fence arrives, extractArtifacts sees the completed block,
  // the persisted artifact lands under the SAME deterministic id, and the
  // streaming overlay clears — a seamless handoff to the Preview tab.
  const streamingBlock = useMemo(() => {
    if (isUser || !message.isStreaming) return null;
    const block = extractTrailingUnclosedBlock(message.content);
    if (!block || !isRenderableArtifact(block.language, block.content)) return null;
    return block;
  }, [isUser, message.isStreaming, message.content]);

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
  const [generatedTextContent, setGeneratedTextContent] = useState<
    Record<string, string | 'error'>
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
          if (!cancelled) setGeneratedTextContent((prev) => ({ ...prev, [file.id]: 'error' }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [generatedFiles, generatedTextContent]);

  const toGeneratedFile = useCallback(
    (f: GeneratedFileMetadataEntry): GeneratedFile => ({
      id: f.id,
      computeSessionId: `generated-${message.id}`,
      ownerUserId: '',
      sourceSurface: 'web',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      kind: (f.kind || 'other') as GeneratedFile['kind'],
      fileName: f.fileName,
      mimeType: f.mimeType,
      uri: f.uri,
      byteCount: f.byteCount,
      checksumSha256: f.checksumSha256 ?? '',
      previewDerivatives: [],
      createdAt: message.timestamp.toISOString(),
    }),
    [message.id, message.timestamp],
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
          id: `genfile-${f.id}`,
          type: 'image',
          language: generatedFileLanguage(f),
          title: f.fileName,
          content: f.uri,
          generatedFile: toGeneratedFile(f),
        });
      } else if (f.kind === 'pdf') {
        out.push({
          id: `genfile-${f.id}`,
          type: 'document',
          language: 'pdf',
          title: f.fileName,
          content: '',
          generatedFile: toGeneratedFile(f),
        });
      } else if (isGeneratedTextArtifact(f)) {
        const source = generatedTextContent[f.id];
        if (typeof source === 'string' && source !== 'error') {
          const language = generatedFileLanguage(f);
          out.push({
            id: `genfile-${f.id}`,
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
    // existingArtifacts — without this they would render twice. Persisted
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
        id: `genfile-${f.id}`,
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
    // — mirroring how completed artifact blocks are stripped below.
    const base = streamingBlock
      ? message.content.slice(0, streamingBlock.startIndex).trimEnd()
      : message.content;
    const stripped = artifacts.length === 0 ? base : removeArtifactBlocks(base, artifacts);
    // AUDIT-FIX BUG-31: non-artifact languages get the same "don't hand the
    // renderer a half-open fence" treatment the artifact path already gets.
    return closeUnterminatedFence(stripped);
  }, [message.content, artifacts, streamingBlock]);

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
  const canonicalActivity = !isUser ? message.metadata?.agentActivity : undefined;
  const toolTimeline =
    !isUser && !canonicalActivity && message.metadata?.tools ? message.metadata.tools : [];

  // Collect web-search sources from metadata (searchResults and/or citations).
  // These are passed INTO the ToolTimeline so they render inside the web-search step box
  // (matching the Claude reference). A fallback renders them if there is no tool timeline.
  const { searchSources, searchQuery } = useMemo(() => {
    if (isUser) return { searchSources: [] as ResearchSource[], searchQuery: undefined };

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

    const citations = message.metadata?.citations;
    if (citations && citations.length > 0 && collected.length === 0) {
      citations
        .filter(
          (c): c is { url: string; title: string; cited_text?: string; type?: string } =>
            !!(c.url && c.title),
        )
        .forEach((c, i) => {
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
    return { searchSources: dedupeResearchSources(collected), searchQuery: query };
  }, [isUser, message.metadata?.searchResults, message.metadata?.citations]);
  const inlineCitations = useMemo<Citation[]>(
    () =>
      searchSources.map((source, index) => ({
        index: source.citationIndex ?? index + 1,
        url: source.url,
        title: source.title,
        snippet: source.snippet,
      })),
    [searchSources],
  );

  // Mirror this message's web-search sources into the right-hand Sources panel
  // (research-panel store) so the "Sources" view showcases them, not just the
  // inline cards inside the tool box.
  const setResearchSources = useResearchPanelStore((s) => s.setSources);
  useEffect(() => {
    if (!isUser && searchSources.length > 0) {
      // Scope the sources to this conversation so the Sources panel never shows
      // a previous chat's sources in a chat that didn't run a web search.
      setResearchSources(artifactConversationId ?? null, searchSources, searchQuery);
    }
  }, [isUser, searchSources, searchQuery, setResearchSources, artifactConversationId]);

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
      {/* Inner content row · constrained to max-w-3xl. No avatars: user messages
          read as a right-aligned bubble, assistant messages as a flat left column. */}
      <div className={cn('message-inner', isUser && 'flex-row-reverse')}>
        {/* Content */}
        <div
          className={cn(
            'message-body',
            isUser ? 'flex max-w-[85%] flex-col items-end' : 'flex-1 min-w-0',
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
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
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
            />
          )}

          {/* One canonical Cloud run spine. It is collapsed inline by default,
              expands in place, and each tool then owns its own request/response
              disclosure. Legacy tool events below are a migration fallback only. */}
          {!isUser && canonicalActivity && (
            <div className="mb-3">
              <AgentActivityTimeline
                activity={canonicalActivity}
                onApprove={resolveToolApproval ? handleApproveTool : undefined}
                onReject={resolveToolApproval ? handleRejectTool : undefined}
                isApprovalExpired={() => approvalTurnExpired}
                onResend={resolveToolApproval && onRegenerate ? handleResendTool : undefined}
                {...connectRetryHandler}
              />
            </div>
          )}

          {/* Interleaved reasoning + tool flow */}
          {!isUser &&
            (() => {
              const segments = message.metadata?.thinkingSegments;
              const tools =
                !isUser && !canonicalActivity && message.metadata?.tools
                  ? message.metadata.tools
                  : [];

              // Multi-segment interleaved path: thinking[0], tool[0], thinking[1], tool[1], ...
              if (segments && segments.length > 0) {
                const maxLen = Math.max(segments.length, tools.length);
                const blocks: React.ReactNode[] = [];

                for (let i = 0; i < maxLen; i++) {
                  const seg = segments[i];
                  const tool = tools[i];

                  if (seg) {
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
                  }

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
                }

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

          {/* Message Content · 15 px body matching desktop .message-text */}
          <div
            className={cn(
              'prose dark:prose-invert max-w-none',
              'message-text', // 15 px / 1.6 lh (defined in globals.css .message-text)
              'break-words overflow-wrap-anywhere text-left',
              isUser && 'user-bubble', // right-aligned rounded bubble (assistant stays flat)
              !isUser && message.metadata?.comparisonOptions && 'hidden',
            )}
          >
            {message.isStreaming &&
            !cleanedContent.trim() &&
            !streamingBlock &&
            !canonicalActivity &&
            !message.metadata?.isExecutingCode &&
            !message.metadata?.codeExecutionResult &&
            message.metadata?.toolType !== 'image-generation' &&
            // Same reason as image: the media card below IS the progress
            // indicator. Observed live — the video shimmer rendered with a
            // "Thinking..." line stacked on top of it, claiming a reasoning
            // step that is not happening.
            message.metadata?.toolType !== 'video-generation' ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span className="text-sm">Thinking...</span>
              </div>
            ) : (
              <MarkdownContent content={cleanedContent} isStreaming={message.isStreaming} />
            )}
          </div>
          {!isUser && inlineCitations.length > 0 && (
            <InlineSourceTags citations={inlineCitations} />
          )}

          {/* Interactive cards sit AFTER the prose that motivated them and
              before the artifact chip, matching where the model emitted them.
              A card that fails to render its kind still renders its authored
              fallback, so this block never leaves a gap in the answer. */}
          {!isUser && message.metadata?.interactiveCards?.length ? (
            <InteractiveCardBlock cards={message.metadata.interactiveCards} />
          ) : null}

          {/* Compact chip while an artifact block streams into the panel — the raw
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
            <div className="mt-2 flex flex-wrap gap-2">
              {displayAttachments.map((attachment) => {
                const isImage = attachment.type.startsWith('image/');
                const isDoc =
                  attachment.type === 'application/pdf' ||
                  attachment.type.includes('word') ||
                  attachment.type.includes('document');
                const shouldPreview = attachment.type === 'application/pdf';

                if (isImage) {
                  // Broken-image fallback: never leave a torn-image glyph — show
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
                    <span className="max-w-[160px] truncate text-xs text-foreground">
                      {attachment.name}
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
              (syntax-highlighted via rehype-highlight, with a copy button + lang
              label). A previous <ArtifactBlock content={cleanedContent}> here
              RE-rendered every fenced block a second time, so non-renderable
              blocks (python/csv/json/generic — the ones NOT stripped from
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
              only condition was a missing videoUrl, a FAILED generation — which
              also has no URL — kept shimmering forever directly above its own
              "Video generation failed" text, so a dead turn was indistinguishable
              from a live one. Observed against the real route (503, no provider
              key configured) on 2026-07-27. The writer clears `isStreaming` on
              every exit, success or failure. */}
          {!isUser &&
            message.metadata?.toolType === 'video-generation' &&
            message.isStreaming === true &&
            !message.metadata?.videoUrl &&
            !videoError && (
              <div
                className="mt-4 relative w-full max-w-lg aspect-video overflow-hidden rounded-xl bg-muted"
                role="status"
                aria-live="polite"
                aria-label="Generating your video"
              >
                {/* Drives @keyframes shimmer in globals.css, which animates
                    background-position — so the highlight must be an oversized
                    background gradient. A translate-based sweep would not move. */}
                <div
                  className={cn(
                    'absolute inset-0',
                    'bg-[linear-gradient(90deg,transparent,var(--color-accent),transparent)]',
                    'bg-[length:200%_100%]',
                    'motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite]',
                  )}
                />
                {/* Visible only when animation is suppressed, so reduced-motion
                    users still get a "working" cue instead of a blank box. */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 motion-safe:opacity-0">
                  <Video className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <span className="text-[13px] text-muted-foreground">Generating your video…</span>
                </div>
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

          {/* Search sources fallback · shown ONLY when there is no tool timeline to host them.
              When a tool timeline is present, sources render inside the web-search step
              (via the searchSources prop). For non-tool paths (e.g. Perplexity answer-only
              responses), this fallback ensures sources are never silently lost. */}
          {!isUser &&
            !canonicalActivity &&
            searchSources.length > 0 &&
            toolTimeline.length === 0 && (
              <InlineSourcesList sources={searchSources} query={searchQuery} />
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
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
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
                          className="text-[10px] font-semibold text-white"
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
                        <Badge variant="secondary" className="h-4 text-[10px]">
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

          {/* Model name · shown under completed assistant messages, hidden while streaming.
              Read from top-level message.model first (set by useChatStream), then fall
              back to message.metadata.model (set on messages loaded from DB). */}
          {!isUser && !message.isStreaming && (message.model ?? message.metadata?.model) && (
            <div className="mt-1.5 text-[11px] text-[var(--chat-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {
                (message.model ?? message.metadata?.model ?? '')
                  .replace(
                    /^(anthropic|openai|google|xai|deepseek|perplexity|qwen|moonshot|zhipu|ollama|lmstudio)\//i,
                    '',
                  )
                  .replace(/-(\d{8})$/, '') /* strip date suffixes like -20250219 */
              }
            </div>
          )}

          {/* Action row visibility (claude.ai parity): ASSISTANT actions (copy /
              read-aloud / thumbs / retry) are ALWAYS visible below the message;
              USER actions are HOVER-ONLY. Do not invert this. */}
          {!message.isStreaming && (
            <div
              className={cn(
                // AUDIT-FIX GOV-30: `opacity-0 group-hover:opacity-100` with no
                // focus counterpart meant a keyboard user tabbed into copy /
                // edit / delete while they were fully transparent —
                // focus-visible ring and all. `group-focus-within` reveals the
                // row the moment focus enters it. The row also stays flex-wrap
                // so the larger touch targets (GOV-38) cannot overflow a phone.
                'mt-2 flex flex-wrap items-center gap-1 transition-opacity',
                isUser
                  ? 'justify-end opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                  : 'opacity-100',
              )}
            >
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={ACTION_BUTTON_SIZE}
                      onClick={handleCopy}
                      aria-label={copied ? 'Message copied' : 'Copy message'}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy</TooltipContent>
                </Tooltip>

                {onPin && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          ACTION_BUTTON_SIZE,
                          message.metadata?.isPinned && 'text-amber-500',
                        )}
                        onClick={() => onPin(message.id)}
                        aria-label={message.metadata?.isPinned ? 'Unpin message' : 'Pin message'}
                        aria-pressed={Boolean(message.metadata?.isPinned)}
                      >
                        <Pin
                          className={cn(
                            'h-3.5 w-3.5',
                            message.metadata?.isPinned && 'fill-current',
                          )}
                          aria-hidden="true"
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{message.metadata?.isPinned ? 'Unpin' : 'Pin'}</TooltipContent>
                  </Tooltip>
                )}

                {!isUser && isReadAloudSupported && onReadAloud && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={ACTION_BUTTON_SIZE}
                        onClick={() => onReadAloud(message.id, message.content)}
                        aria-label={isReadingAloud ? 'Stop reading message' : 'Read message aloud'}
                        aria-pressed={isReadingAloud}
                      >
                        {isReadingAloud ? (
                          <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isReadingAloud ? 'Stop reading' : 'Read aloud'}
                    </TooltipContent>
                  </Tooltip>
                )}

                {!isUser && onReact && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            ACTION_BUTTON_SIZE,
                            message.metadata?.reaction === 'thumbsUp' &&
                              'text-[var(--chat-accent-primary)]',
                          )}
                          onClick={() =>
                            onReact(
                              message.id,
                              message.metadata?.reaction === 'thumbsUp' ? null : 'up',
                            )
                          }
                          aria-label={
                            message.metadata?.reaction === 'thumbsUp'
                              ? 'Remove good response rating'
                              : 'Rate as good response'
                          }
                          aria-pressed={message.metadata?.reaction === 'thumbsUp'}
                        >
                          <ThumbsUp
                            className={cn(
                              'h-3.5 w-3.5',
                              message.metadata?.reaction === 'thumbsUp' && 'fill-current',
                            )}
                            aria-hidden="true"
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {message.metadata?.reaction === 'thumbsUp'
                          ? 'Remove rating'
                          : 'Good response'}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            ACTION_BUTTON_SIZE,
                            message.metadata?.reaction === 'thumbsDown' &&
                              'text-[var(--chat-accent-primary)]',
                          )}
                          onClick={() =>
                            onReact(
                              message.id,
                              message.metadata?.reaction === 'thumbsDown' ? null : 'down',
                            )
                          }
                          aria-label={
                            message.metadata?.reaction === 'thumbsDown'
                              ? 'Remove poor response rating'
                              : 'Rate as poor response'
                          }
                          aria-pressed={message.metadata?.reaction === 'thumbsDown'}
                        >
                          <ThumbsDown
                            className={cn(
                              'h-3.5 w-3.5',
                              message.metadata?.reaction === 'thumbsDown' && 'fill-current',
                            )}
                            aria-hidden="true"
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {message.metadata?.reaction === 'thumbsDown'
                          ? 'Remove rating'
                          : 'Poor response'}
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}

                {/* Regenerate — primary action for assistant messages */}
                {!isUser && onRegenerate && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={ACTION_BUTTON_SIZE}
                        onClick={() => onRegenerate(message.id)}
                        aria-label="Regenerate response"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Regenerate</TooltipContent>
                  </Tooltip>
                )}

                {/* More actions menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={ACTION_BUTTON_SIZE}
                      aria-label="More message actions"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={isUser ? 'end' : 'start'}>
                    {isUser && onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(message.id)}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {/*
                      Report an answer as harmful or inaccurate. The web app had
                      no such action: the only routes out were a general
                      feedback link and a refusal APPEAL, which is the opposite
                      complaint. Assistant messages only — reporting your own
                      message to us is not a thing.
                    */}
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
                    {onBranch && (
                      <DropdownMenuItem disabled={isBranching} onClick={() => onBranch(message.id)}>
                        <GitFork className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isBranching ? 'Creating branch…' : 'Branch conversation'}
                      </DropdownMenuItem>
                    )}
                    {message.metadata?.tokensUsed ? (
                      <>
                        <DropdownMenuSeparator />
                        <div className="px-2 py-1.5">
                          {/*
                            Token breakdown for the turn. `tokensUsed` comes
                            from the PERSISTED message row via `toChatMessage`
                            (no terminal usage stream frame exists — one was
                            built and reverted, see docs/adr/wire-or-cut.md
                            "Per-message token/cost"), so it appears after the
                            turn is saved. `cost` has no producer at all today:
                            managed cost stays server-side, so the dollar line
                            below stays hidden until that policy changes. It is
                            typed in CENTS, hence the /100.
                          */}
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
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            // Confirm before deleting so a stray click in the ... menu
                            // can never silently drop a message — matches the
                            // conversation/project delete guard (WebChatPage
                            // handleDeleteSession/handleProjectDelete).
                            if (
                              typeof window !== 'undefined' &&
                              !window.confirm("Delete this message? This can't be undone.")
                            ) {
                              return;
                            }
                            onDelete(message.id);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipProvider>
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
 * Approve/Reject — which flips one entry, usually an interior one — produced no
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
 * on every comparison — once per streamed token per visible message, on the
 * render-critical path, in a list with no virtualization, over a bag that
 * carries the full tool timeline, search results, thinking segments and file
 * descriptors. It was also key-order sensitive, so a re-serialized bag with
 * reordered keys reported "changed" even when nothing had.
 *
 * Field comparison replaces it. Reference identity is the right test for the
 * object-valued spines because the store patches metadata immutably
 * (`{ ...m.metadata, ...patch }` in web-chat-store) and the activity reducer
 * returns a new object for every event it applies — so `!==` means "changed"
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
    prev?.videoUrl === next?.videoUrl &&
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
  if (prev.onPin !== next.onPin) return false;
  if (prev.onReact !== next.onReact) return false;
  if (prev.onBranch !== next.onBranch) return false;
  if (prev.onReadAloud !== next.onReadAloud) return false;
  if (prev.onRegenerateImage !== next.onRegenerateImage) return false;

  // Check flags
  if (prev.isBranching !== next.isBranching) return false;
  if (prev.branchNavigation !== next.branchNavigation) return false;
  if (prev.isReadingAloud !== next.isReadingAloud) return false;
  if (prev.isReadAloudSupported !== next.isReadAloudSupported) return false;
  if (prev.hasBranches !== next.hasBranches) return false;
  if (prev.animationIndex !== next.animationIndex) return false;

  // All props are equal, skip re-render
  return true;
});

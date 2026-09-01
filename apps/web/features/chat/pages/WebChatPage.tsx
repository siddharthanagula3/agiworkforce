'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { retryableUserMessageId } from '@/features/chat/lib/retryable-turn';
import { useTranslation } from 'react-i18next';
import { useAuth, useClerk, useUser } from '@clerk/nextjs';
import { useRouter, useParams, useSearchParams, usePathname } from 'next/navigation';
import { ToolApprovalProvider } from '@/lib/hooks/useChatStream';
import { useChatStreamRuntime } from '../components/ChatStreamRuntimeProvider';
import { useConversations } from '@/lib/hooks/useConversations';
import { managedCloudConversationPath } from '@agiworkforce/cloud-contracts';
// GOV-19: remaining managed quota, shared with Settings > Usage.
import {
  getWorstUsagePercent,
  readManagedUsageBuckets,
  useManagedUsageSummary,
} from '@/lib/hooks/useManagedUsageSummary';
import { selectUsageWarning } from '@agiworkforce/types';
import { UsageWarningBanner } from '@agiworkforce/unified-chat';
import {
  isTemporaryConversationById,
  persistImageGenerationUserMessage,
  persistImageGenerationAssistantMessage,
  requireImageMessagePersistence,
  // PER-29/PER-30: metadata builders that MERGE rather than replace, so a
  // failure or a pending regeneration cannot discard the retry parameters.
  imageGenerationFailureMetadata,
  imageRegenerationPendingMetadata,
  mergeImageGenerationMetadata,
} from '../lib/imageGenerationPersistence';
import { runDurableImageGenerationTurn } from '../lib/durableImageGenerationTurn';
import { startVideoAfterTranscriptCommit } from '../lib/durableVideoGenerationTurn';
import {
  useChatStore,
  selectActiveLeafId,
  selectConversationAllRows,
  selectConversationMessages,
  selectIsConversationLoading,
  selectIsConversationStreaming,
  PENDING_CONVERSATION_KEY,
  DEFAULT_COMPOSER_TOGGLES,
} from '@shared/stores/web-chat-store';
import {
  EMPTY_VARIANT_INFO,
  resolveLeafForSibling,
  sameVariantInfoMap,
  variantInfoByMessage,
  type VariantInfoByMessageId,
} from '../lib/messageThread';
import {
  resolveMessageVariantsBuildEnabled,
  resolveMessageVariantsEnabled,
} from '../lib/message-variants-gate';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { resolveSelectableModelId, useModelStore } from '@shared/stores/model-store';
import { useNotificationStore } from '@shared/stores/notification-store';
import { useUIStore } from '@shared/stores/layout-store';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { getBestAutoModeForTier } from '@shared/config/llm';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import {
  getBillingPlanPricing,
  summarizeSendPreview,
  type BillingPlanTier,
  type CloudWorkMode,
  type ProviderMode,
  type SendPreviewPresentation,
  hasSelfServeUpgradePath,
} from '@agiworkforce/types';
import { accountInitial, normalizeDisplayName } from '@agiworkforce/utils/display-name';
import {
  Menu,
  Share2,
  PanelsTopLeft,
  Bell,
  X as XIcon,
  Settings,
  ChevronUp,
  CreditCard,
  Download,
  HelpCircle,
  Keyboard,
  LogOut,
} from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { ShareConversationDialog } from '../components/share/ShareConversationDialog';
import { useArtifactCloudSync } from '../hooks/use-artifact-cloud-sync';
import { useBrowserReplyReadyPreference } from '../hooks/use-browser-reply-ready-preference';
import { _sharedArtifactStore } from '../stores/artifacts-store';
import { useConversationBranches } from '../hooks/use-conversation-branches';
import { uploadChatAttachments } from '../services/chat-attachment-upload';
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import { KEYBOARD_SHORTCUT_DOCS } from '../hooks/use-keyboard-shortcuts';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  Sidebar,
  useConfirm,
  type SidebarSession,
  type SidebarNavItem,
  type SidebarProject,
} from '@agiworkforce/ui';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useToolPermissionsStore } from '@/features/connectors/stores/tool-permissions-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  shortcutLabel,
} from '@agiworkforce/ui';
import { useSettingsModal } from '@features/settings/components/SettingsModalProvider';
import { WorkspaceMenuItems } from '@/features/workspaces/components/WorkspaceMenuItems';
import { GlobalSearchDialog } from '../components/dialogs/GlobalSearchDialog';
import { KeyboardShortcutsDialog } from '../components/dialogs/KeyboardShortcutsDialog';
import { EnhancedExportDialog } from '../components/dialogs/EnhancedExportDialog';
import { printConversation } from '../lib/print-conversation';
import { ChatMessageList } from '../components/messages/ChatMessageList';
import {
  MessageInlineEditProvider,
  type MessageInlineEditController,
} from '../components/messages/MessageBubble';
import { ChatLoadingState } from '../components/messages/ChatLoadingState';
import { ImageTranscriptRecoveryNotice } from '../components/ImageTranscriptRecoveryNotice';
import { ChatComposerNew } from '../components/Composer/ChatComposerNew';
import { GreetingBanner } from '../components/GreetingBanner/GreetingBanner';
import { SidebarWordmark } from '@shared/components/agi/SidebarWordmark';
import { buildAppNavItems } from '@shared/components/layout/app-nav-items';
import {
  conversationDeleteConfirm,
  projectDeleteConfirm,
} from '@shared/components/layout/sidebar-session-actions';
import { SidebarFreePlanNudge, SidebarPlanBadge } from '@shared/components/layout/SidebarPlanNudge';
import { useIsWorkspaceAdmin } from '@shared/hooks/use-workspace-admin';
import { ConversationTitleMenu } from '../components/ConversationTitleMenu';
import { ApprovalInbox } from '../components/approvals/ApprovalInbox';
import {
  hasWorkSession,
  WorkSessionPanel,
  WorkSessionToggleButton,
} from '../components/work-session/WorkSessionPanel';
import { ArtifactsPanel, ArtifactsToggleButton } from '../components/artifacts/ArtifactsPanel';
import { ResearchPanel, ResearchToggleButton } from '../components/research/ResearchPanel';
import type { ResearchPlanDecision } from '../components/research/ResearchActivity';
import { CreateProjectDialog } from '../components/dialogs/CreateProjectDialog';
import { UpgradePlanDialog, type UpgradeTarget } from '../components/dialogs/UpgradePlanDialog';
import { TimeFocusReminder } from '@/features/time-focus/TimeFocusReminder';
import { toast } from 'sonner';
import { safeClipboard } from '@shared/utils/browser-utils';
import {
  upgradeToBasicPlan,
  upgradeToProPlan,
  upgradeToMaxPlan,
  upgradeToMax15xPlan,
} from '@features/billing/services/stripe-payments';
import {
  UpgradeConfirmDialog,
  type UpgradeConfirmRequest,
} from '@features/billing/components/UpgradeConfirmDialog';
import { billingOwnerPlanChangeMessage } from '@features/billing/lib/subscription-owner-presentation';
import {
  buildAcceptedHandoffSystemMessage,
  buildWebLocalToByokPreview,
  getByokTargetProviderLabel,
  resolveRegenerateBoundaryRefusal,
  routeLocalToByokSend,
  type WebHandoffContextCandidate,
  type WebLocalToByokPreview,
} from '../lib/localByokHandoff';
import { getRegenerateReplayDecision, replayToSendOptions } from '../lib/regenerateReplay';
import { approvedResearchSteps, completedResearchSteps } from '../utils/research-plan';
import type { AgiWorkGoalInput } from '../utils/agiwork-plan';
import {
  planEditRollback,
  planRegenerateRollback,
  consumePendingEdit,
  type PendingEditRollback,
} from '../lib/pendingEdit';
import { runReplacingSend } from '../lib/replacingSend';
import {
  isConversationListPending,
  isConversationRoutePending,
  isStaleActiveConversation,
} from '../lib/staleActiveConversation';
import type { Conversation, Message, MessageMetadata } from '@shared/stores/web-chat-store';
import type { ChatSession } from '@shared/types';
import { describeModelSubstitution, type ModelSubstitution } from '@shared/stores/model-store';
import { UnavailableModelNotice } from '../components/UnavailableModelNotice';
import { LocalByokHandoffDialog, type ChatMessage } from '@agiworkforce/unified-chat';
import { countWebSearchSources, type WebChatMessageMetadata } from '../types/message-metadata';
import { useFreeTrialStore } from '../stores/freeTrialStore';
import { cn } from '@shared/lib/utils';
import {
  useManagedCloudProjects,
  useProjectStore,
  ProjectSettingsDialog,
} from '@features/projects';
import { webManagedCloudProjects } from '@features/projects/services/managed-cloud-projects';
import {
  acknowledgeProjectChatHandoff,
  readProjectChatHandoff,
} from '@features/projects/lib/project-chat-handoff';
import {
  useMediaGeneration,
  MediaGenerationApiError,
  type GeneratedImageResult,
  type GenerateVideoOptions,
  type MediaPaywallRecoveryAction,
} from '@/lib/hooks/useMediaGeneration';
import { classifyTaskLocally } from '@agiworkforce/routing';
import {
  IMAGE_MODELS,
  resolveImageGenerationRequestOptions,
  type ImageAspectRatio,
} from '../lib/imageGenerationOptions';
import { resolveMediaPaywallSlot, runMediaPaywallRecovery } from '../lib/mediaPaywallRecovery';
import { useDocumentTitleSync } from '../components/DocumentTitleSync';
import {
  imageTranscriptMutationKeys,
  useImageTranscriptRecoveryStore,
  type ImagePromptTranscriptRecovery,
  type ImageTranscriptRecovery,
} from '../stores/image-transcript-recovery-store';
import { toUserMessage } from '@/lib/user-error-message';
import type { McpContextSelection } from '@/features/connectors/lib/mcp-context-selection';

// A fresh [] each render changes the identity every time and defeats the
// memoization below, which is what the exhaustive-deps warning was pointing at.
const EMPTY_NAV_IDS: string[] = [];

type SendMeta = {
  /** Composer work mode at send time ('chat' | 'agiwork'). */
  workMode?: CloudWorkMode;
  /** Project scoping the send; threads into createConversation → project_id. */
  projectId?: string | null;
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  officeCreationEnabled?: boolean;
  /** Deep Research mode: server injects research system prompt and forces web search. */
  researchEnabled?: boolean;
  /** Output style hint (concise / formal / explanatory / normal). Omitted = normal. */
  styleMode?: string;
  /** Resolved Response-Style instruction (preset or custom) from StyleSelector. */
  styleInstruction?: string;
  /** Exact server-catalog skill name. */
  skillName?: string;
  mcpContext?: McpContextSelection;
  /** CAP-048: structured AGI Work goal captured by the composer. */
  agiWorkGoal?: AgiWorkGoalInput;
};

type NewImageGenerationTurn = Omit<ImagePromptTranscriptRecovery, 'phase' | 'status'> & {
  temporary: boolean;
};

/**
 * AUDIT-FIX STR-6: reentrancy key for a send issued before its conversation
 * exists. All pre-create sends share it, which is exactly right -- two rapid
 * submits on the empty new-chat surface must not create two conversations --
 * while a send addressed to a real conversation is keyed by that id and can run
 * concurrently with any other chat's send.
 */
const NEW_CHAT_SEND_GUARD_KEY = '__new_conversation__';

/** Placeholder title every lazily created chat conversation starts with. */
const NEW_CHAT_TITLE = 'New Chat';
/** Placeholder titles the image / video harnesses create their conversation with. */
const IMAGE_GENERATION_TITLE = 'Image generation';
const VIDEO_GENERATION_TITLE = 'Video generation';

/**
 * MEDIA-TITLE-03: titles the auto-titler is allowed to replace.
 *
 * These are the three literals the app itself assigns at creation time — never
 * something a user typed — so overwriting one with the first prompt is a repair,
 * not a surprise. Anything else (a rename, or a title this effect already set)
 * is left alone.
 */
const AUTO_TITLE_PLACEHOLDERS: ReadonlySet<string> = new Set([
  NEW_CHAT_TITLE,
  IMAGE_GENERATION_TITLE,
  VIDEO_GENERATION_TITLE,
]);

/**
 * Read schedule for the server's two-stage title (see
 * app/api/chat/conversations/[id]/messages/route.ts): the stage-1 truncation is
 * already committed by the time a turn's second message renders, and the
 * LLM-written title replaces it in the background a beat later. Read once
 * immediately, then twice more across the window that second write lands in.
 */
const SERVER_TITLE_READ_DELAYS_MS = [0, 1200, 3000] as const;

const CLIENT_FALLBACK_TITLE_LENGTH = 60;

function clientFallbackTitle(firstUserContent: string): string {
  return firstUserContent.trim().slice(0, CLIENT_FALLBACK_TITLE_LENGTH).replace(/\n/g, ' ');
}

async function fetchServerConversationTitle(
  conversationId: string,
  authToken: string,
): Promise<string | null> {
  // limit=1: this read only wants the conversation's title, not its transcript.
  const response = await fetch(`${managedCloudConversationPath(conversationId)}?limit=1`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { conversation?: { title?: string | null } };
  return data.conversation?.title?.trim() || null;
}

type PendingByokHandoff = {
  sourceConversationId: string;
  conversationTitle: string;
  content: string;
  attachments?: File[];
  meta?: SendMeta;
  candidates: WebHandoffContextCandidate[];
};

interface ChatAccountIdentity {
  id: string;
  email?: string;
  name?: string;
}

/**
 * `/api/me` is the canonical identity source. Keep the compatibility auth
 * store only as a short-lived fallback while it finishes hydrating, never as
 * the preferred source for the account footer or checkout metadata.
 */
export function resolveChatAccountUser(
  canonicalUser: ChatAccountIdentity | null,
  compatibilityUser: ChatAccountIdentity | null,
  clerkUser: ChatAccountIdentity | null = null,
): ChatAccountIdentity | null {
  return canonicalUser ?? compatibilityUser ?? clerkUser;
}

export function resolveChatAccountDisplay(
  user: ChatAccountIdentity | null,
  subscriptionTier: BillingPlanTier | null | undefined,
  billingPolicyReady: boolean,
): {
  displayName: string;
  userInitial: string;
  tierLabel: string | null;
  showFreeUpgrade: boolean;
  isLoading: boolean;
} {
  // Shared normalisation (see @agiworkforce/utils/display-name): the identity
  // provider's stored casing is not a presentation decision. Without this the
  // chat sidebar shouted "SIDDHARTHA NAGULA" under a greeting that read
  // "Siddhartha".
  const rawName = user?.name?.trim() || user?.email?.trim().split('@')[0]?.trim();
  const displayName = rawName ? normalizeDisplayName(rawName) : undefined;

  if (!billingPolicyReady) {
    if (displayName) {
      return {
        displayName,
        userInitial: accountInitial(displayName),
        tierLabel: null,
        showFreeUpgrade: false,
        isLoading: false,
      };
    }
    return {
      displayName: 'Loading account',
      userInitial: '…',
      tierLabel: null,
      showFreeUpgrade: false,
      isLoading: true,
    };
  }

  const settledDisplayName = displayName || 'User';

  // An absent tier is NOT Free. `user` resolves from Clerk the moment the
  // session hydrates (see resolveChatAccountUser), but `subscription` has no
  // such fallback, so this ran with a real name beside an unknown plan and
  // filled the gap with 'free'. A Basic subscriber was then shown "Free plan"
  // with an Upgrade button that starts Stripe CHECKOUT — which the server
  // refuses, correctly, because a second subscription alongside the existing
  // one is a double charge. Render no tier until one is actually known.
  if (subscriptionTier == null) {
    return {
      displayName: settledDisplayName,
      userInitial: accountInitial(settledDisplayName),
      tierLabel: null,
      showFreeUpgrade: false,
      isLoading: false,
    };
  }

  return {
    displayName: settledDisplayName,
    userInitial: accountInitial(settledDisplayName),
    tierLabel: getBillingPlanPricing(subscriptionTier).label,
    showFreeUpgrade: subscriptionTier === 'free',
    isLoading: false,
  };
}

export function toChatMessage(m: Message, conversationId: string): ChatMessage {
  const thinkingContent = m.metadata?.thinkingContent;
  // MessageBubble renders `thinkingContent` as a ThinkingBlock above the
  // message AND (separately) a "Thinking process" collapsible from
  // `thinkingSteps`. Previously this derived thinkingSteps=[thinkingContent]
  // whenever thinkingContent was set, so the same reasoning text rendered
  // twice. Only pass through thinkingSteps when it's the model's own
  // distinct multi-step breakdown (no thinkingContent present) — when
  // thinkingContent exists, ThinkingBlock already owns showing it.
  const thinkingSteps = thinkingContent ? undefined : m.metadata?.thinkingSteps;
  // Per-message usage. `messages.input_tokens` / `output_tokens` are written by
  // the server's assistant-turn persistence and returned by the load path, but
  // nothing lifted them into metadata — so `tokensUsed` had no producer and
  // every per-message cost surface rendered empty.
  //
  // Sourced from the PERSISTED row rather than a stream frame on purpose: these
  // are the settled numbers, they survive a reload, and adding a frame to the
  // stream would break the byte-parity contract between the two response
  // builders (see stream-transform.byte-parity.test.ts).
  const inputTokens = typeof m.inputTokens === 'number' ? m.inputTokens : undefined;
  const outputTokens = typeof m.outputTokens === 'number' ? m.outputTokens : undefined;
  const tokensUsed =
    inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined;

  const metadata: Record<string, unknown> | undefined =
    m.metadata || m.model || m.fallbackReason || tokensUsed !== undefined
      ? {
          ...m.metadata,
          model: m.model ?? m.metadata?.model,
          ...(m.fallbackReason ? { fallbackReason: m.fallbackReason } : {}),
          ...(inputTokens !== undefined ? { inputTokens } : {}),
          ...(outputTokens !== undefined ? { outputTokens } : {}),
          ...(tokensUsed !== undefined ? { tokensUsed } : {}),
          thinkingSteps,
          isThinkingStreaming: m.metadata?.isThinkingStreaming,
          isSearching: m.metadata?.isSearching,
          searchResults: m.metadata?.searchResults,
          isExecutingCode: m.metadata?.isExecutingCode,
          codeExecutionResult: m.metadata?.codeExecutionResult,
          reaction: m.metadata?.reaction,
        }
      : undefined;

  return {
    id: m.id,
    conversationId,
    role: m.role === 'system' ? 'assistant' : m.role,
    content: m.content,
    createdAt: m.createdAt,
    isStreaming: m.isStreaming,
    attachments: m.attachments,
    metadata,
  };
}

export function toChatSession(conversation: Conversation, messageCount: number): ChatSession {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: new Date(conversation.createdAt),
    updatedAt: new Date(conversation.updatedAt),
    messageCount: conversation.messageCount ?? messageCount,
    isPinned: conversation.isPinned ?? false,
    isArchived: conversation.isArchived ?? false,
    isStarred: conversation.isStarred ?? false,
    tags: [],
    participants: [],
  };
}

async function saveSystemMessage(params: {
  conversationId: string;
  content: string;
  metadata: MessageMetadata;
  authToken: string;
}): Promise<Message> {
  const headers = await addCsrfHeaders({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.authToken}`,
  });
  const response = await fetch(`/api/chat/conversations/${params.conversationId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      role: 'system',
      content: params.content,
      metadata: params.metadata,
      skipLlm: true,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to save BYOK handoff context');
  }

  const data = await response.json();
  const raw = data.message as { id?: string; created_at?: string; metadata?: MessageMetadata };

  return {
    id: raw.id ?? crypto.randomUUID(),
    role: 'system',
    content: params.content,
    createdAt: raw.created_at ?? new Date().toISOString(),
    metadata: raw.metadata ?? params.metadata,
  };
}

async function readChatMutationError(response: Response, fallback: string): Promise<string> {
  const errorData = await response.json().catch(() => ({}));
  if (
    errorData &&
    typeof errorData === 'object' &&
    'error' in errorData &&
    errorData.error &&
    typeof errorData.error === 'object' &&
    'message' in errorData.error &&
    typeof errorData.error.message === 'string'
  ) {
    return errorData.error.message;
  }
  return fallback;
}

async function deleteConversationMessage(params: {
  conversationId: string;
  messageId: string;
  authToken: string;
}): Promise<void> {
  const headers = await addCsrfHeaders({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.authToken}`,
  });
  const response = await fetch(
    `/api/chat/conversations/${params.conversationId}/messages/${params.messageId}`,
    {
      method: 'DELETE',
      headers,
    },
  );

  if (!response.ok) {
    throw new Error(await readChatMutationError(response, 'Failed to delete message'));
  }
}

/**
 * Records which variant the reader is on, so opening the chat again — here or on
 * another device — restores the answer they chose rather than the newest one.
 */
async function putActiveLeafMessageId(params: {
  conversationId: string;
  activeLeafMessageId: string;
  authToken: string;
}): Promise<void> {
  const headers = await addCsrfHeaders({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.authToken}`,
  });
  const response = await fetch(managedCloudConversationPath(params.conversationId), {
    method: 'PUT',
    headers,
    body: JSON.stringify({ activeLeafMessageId: params.activeLeafMessageId }),
  });

  if (!response.ok) {
    throw new Error(await readChatMutationError(response, 'Failed to select this response'));
  }
}

/**
 * The two overrides the variants gate reads are client-only, so a server render
 * that honoured them would hand the browser an action row with a different
 * number of controls in it. `getServerSnapshot` pins the first client render to
 * the build default and React re-renders once hydration is done — the same
 * idiom ComposerInput uses for the composer editor gate.
 */
const subscribeToMessageVariantsMode = () => () => {};

function useMessageVariantsEnabled(): boolean {
  return useSyncExternalStore(
    subscribeToMessageVariantsMode,
    resolveMessageVariantsEnabled,
    resolveMessageVariantsBuildEnabled,
  );
}

// Generic message-metadata patch (the route merges the body into
// messages.metadata and syncs it cross-device). Backs reactions and pins.
async function patchConversationMessageMetadata(params: {
  conversationId: string;
  messageId: string;
  patch: Record<string, unknown>;
  authToken: string;
}): Promise<void> {
  const headers = await addCsrfHeaders({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.authToken}`,
  });
  const response = await fetch(
    `/api/chat/conversations/${params.conversationId}/messages/${params.messageId}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(params.patch),
    },
  );

  if (!response.ok) {
    throw new Error(await readChatMutationError(response, 'Failed to update message'));
  }
}

interface VideoStartFailureProjection {
  applied: boolean;
  content: string;
  model?: string;
  provider?: 'google' | 'runway' | 'openrouter';
  metadata: MessageMetadata;
}

function readVideoStartFailureProjection(value: unknown): VideoStartFailureProjection {
  if (!value || typeof value !== 'object') throw new Error('Invalid video recovery response');
  const response = value as Record<string, unknown>;
  const message = response['message'];
  if (typeof response['applied'] !== 'boolean' || !message || typeof message !== 'object') {
    throw new Error('Invalid video recovery response');
  }
  const row = message as Record<string, unknown>;
  const rawMetadata = row['metadata'];
  if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
    throw new Error('Invalid video recovery metadata');
  }
  const metadata = rawMetadata as Record<string, unknown>;
  const status = metadata['videoStatus'];
  if (
    metadata['toolType'] !== 'video-generation' ||
    (status !== 'queued' &&
      status !== 'processing' &&
      status !== 'completed' &&
      status !== 'failed')
  ) {
    throw new Error('Invalid video recovery state');
  }
  const provider = row['provider'];
  const safeProvider =
    provider === 'google' || provider === 'runway' || provider === 'openrouter'
      ? provider
      : undefined;
  const safeMetadata: MessageMetadata = {
    toolType: 'video-generation',
    videoStatus: status,
    ...(typeof metadata['videoTaskId'] === 'string'
      ? { videoTaskId: metadata['videoTaskId'] }
      : {}),
    ...(typeof metadata['videoModel'] === 'string' ? { videoModel: metadata['videoModel'] } : {}),
    ...(metadata['videoProvider'] === 'google' ||
    metadata['videoProvider'] === 'runway' ||
    metadata['videoProvider'] === 'openrouter'
      ? { videoProvider: metadata['videoProvider'] }
      : {}),
    ...(typeof metadata['videoProgress'] === 'number'
      ? { videoProgress: metadata['videoProgress'] }
      : {}),
    ...(typeof metadata['videoUrl'] === 'string' ? { videoUrl: metadata['videoUrl'] } : {}),
    ...(typeof metadata['thumbnailUrl'] === 'string'
      ? { thumbnailUrl: metadata['thumbnailUrl'] }
      : {}),
    ...(typeof metadata['videoError'] === 'string' ? { videoError: metadata['videoError'] } : {}),
    ...(typeof metadata['videoRetryable'] === 'boolean'
      ? { videoRetryable: metadata['videoRetryable'] }
      : {}),
  };
  return {
    applied: response['applied'],
    content: typeof row['content'] === 'string' ? row['content'] : '',
    ...(typeof row['model'] === 'string' ? { model: row['model'] } : {}),
    ...(safeProvider ? { provider: safeProvider } : {}),
    metadata: safeMetadata,
  };
}

async function persistDefiniteVideoStartFailure(params: {
  conversationId: string;
  messageId: string;
  publicError: string;
  authToken: string;
}): Promise<VideoStartFailureProjection> {
  const headers = await addCsrfHeaders({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${params.authToken}`,
  });
  const response = await fetch(
    `/api/chat/conversations/${params.conversationId}/messages/${params.messageId}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ videoStartFailure: { publicError: params.publicError } }),
    },
  );
  if (!response.ok) {
    throw new Error(await readChatMutationError(response, 'Failed to recover video transcript'));
  }
  return readVideoStartFailureProjection(await response.json());
}

const MOBILE_NAV_DRAWER_ID = 'chat-mobile-navigation';
const MOBILE_NAV_DRAWER_WIDTH = 280;

// `highlightMessage` arrives verbatim from the URL, so matching on the dataset
// value keeps a crafted id (quotes, brackets) out of a selector string it could
// otherwise break, which would throw a DOMException out of the effect below.
function findHighlightableMessageElement(messageId: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('[data-message-id]')).find(
      (element) => element.dataset['messageId'] === messageId,
    ) ?? null
  );
}

export default function WebChatPage() {
  useArtifactCloudSync();

  /**
   * Destructive-action confirmation (shell-nav-ia-gap-01).
   *
   * Delete-conversation and delete-project used to call native `window.confirm()`
   * from this page while the SAME project delete, reached from
   * ProjectSettingsDialog, showed the styled AlertDialog with a red confirm.
   * `useConfirm` is the shared promise-based wrapper around that exact
   * AlertDialog primitive (packages/ui/ui/src/primitives/ConfirmDialog.tsx) — it
   * existed with zero call sites in the whole repo. Same await-a-boolean shape
   * as `window.confirm`, so the guards below read the same but the user sees the
   * product's own dialog with a red confirm and specific consequence copy.
   */
  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirm();

  // Only a handful of strings on this surface are translated. Display language
  // is chosen in Settings → General, which states that coverage honestly
  // instead of implying the whole chat UI switches language.
  const { t } = useTranslation(['chat', 'common']);
  const { getToken, isLoaded: authLoaded, userId } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const urlConversationId = params?.['sessionId'] as string | undefined;
  const highlightMessageId = searchParams?.get('highlightMessage') ?? null;
  const openSearchParam = searchParams?.get('search') ?? null;

  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  // Below the mobile breakpoint the rail leaves the flow entirely, so the
  // composer never gets squeezed into a few px of width on a phone-sized
  // viewport. Tracked separately from the user's manual collapse toggle so
  // widening the window back out restores whatever the user had chosen.
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(max-width: 768px)');
    const update = () => setIsNarrowViewport(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  // Compact viewports render the sidebar in the shared Sheet drawer instead of
  // an in-flow rail; this tracks whether that drawer is open. The Radix dialog
  // behind Sheet owns the modal contract — focus trap, Escape, scroll lock —
  // so this page holds nothing but the open flag and the trigger it restores
  // focus to.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const [workSessionPanelOpen, setWorkSessionPanelOpen] = useState(false);

  // Hydrate server-persisted connector per-tool permission verdicts once when
  // signed in, so a "block/allow this tool" choice follows the user across
  // devices (the tool-approval timeline reads this store). Best-effort.
  useEffect(() => {
    if (!userId) return;
    void useToolPermissionsStore.getState().hydrateFromServer();
  }, [userId]);

  // Model from the model store · needed by the access gate below before the composer hooks.
  const availableModels = useModelStore((s) => s.availableModels);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const billingSubscription = useBillingStore((s) => s.subscription);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);
  const subscriptionTier = billingSubscription?.tier ?? 'free';
  // Never temporarily downgrade a signed-in paid user while /api/me is still
  // hydrating. That race used to replace a persisted Auto/paid selection with
  // the Free workhorse, so the model unexpectedly changed after reload.
  const isWebsiteFreeTrial = billingPolicyReady && subscriptionTier === 'free';
  const freeTrialModelId = getBestAutoModeForTier('free');
  const validatedSelectedModelId = resolveSelectableModelId(selectedModelId);
  const activeModelId =
    isWebsiteFreeTrial && !FREE_TRIAL_MODELS.includes(validatedSelectedModelId)
      ? freeTrialModelId
      : validatedSelectedModelId;
  const selectedModel = availableModels.find((m) => m.id === activeModelId);
  const freeUsageLimitReached = useFreeTrialStore((s) => s.limitReached);
  const isTrialExhausted = isWebsiteFreeTrial && freeUsageLimitReached;

  useEffect(() => {
    if (!isWebsiteFreeTrial) return;
    // Free users may pick any model in the free tool set; only snap back to the
    // default when they're on something outside the set.
    if (!FREE_TRIAL_MODELS.includes(selectedModelId)) {
      setSelectedModelId(freeTrialModelId);
    }
  }, [freeTrialModelId, isWebsiteFreeTrial, selectedModelId, setSelectedModelId]);

  const [composerPrefill, setComposerPrefill] = useState<string | undefined>(undefined);

  // Pending message edit (DATA-LOSS FIX). Clicking "Edit" on a user message
  // prefills the composer; the destructive rollback (delete that message + all
  // later messages) is DEFERRED to the actual resubmission via sendContent — and the
  // delete itself is deferred to AFTER the resubmission commits (see
  // sendReplacingMessages), so neither abandoning the edit nor a send that bails
  // pre-commit can lose the original. `sendReplacingMessagesRef` bridges that helper to
  // sendContent, which is declared long before it.
  const pendingEditRollbackRef = useRef<PendingEditRollback | null>(null);
  const sendReplacingMessagesRef = useRef<
    | ((
        rollbackIds: string[],
        // AUDIT-FIX STR-22: `send` receives an early-commit callback it must
        // invoke once the replacement turn is durable, so the replaced turn's
        // server rows are dropped then -- not at stream end.
        send: (onTurnCommitted: () => void) => Promise<boolean>,
      ) => Promise<void>)
    | null
  >(null);

  // First-message send guard (DEMO-BLOCKER FIX). A brand-new-chat send runs
  // `createConversation` (which sets the store's `activeConversationId` +
  // clears messages) and only THEN commits `bareChatSessionId` and appends the
  // user/streaming-assistant messages. Between those two steps there is a render
  // where the store is active but `displayedConversationId` is still null and
  // neither `isStreaming` nor `isLoading` is set — which the stale-active
  // reconciler (below) misreads as a stale homepage and nulls
  // `activeConversationId`. That desync then makes the post-navigation
  // `loadConversation` refetch fire and clobber the in-flight streaming
  // assistant message (it never renders until a manual reload). This ref stays
  // true for the whole `sendContent` lifetime so the reconciler never clears an
  // active conversation mid-send. It is a ref (not state) so flipping it never
  // triggers a render; the reconciler reads it at effect-run time.
  //
  // AUDIT-FIX STR-6/STR-26: a COUNT, not a boolean. Three call sites claim this
  // window (sendContent, handleGenerateImage, handleConfirmHandoff) and they can
  // overlap; a shared boolean let whichever finished first clear a window still
  // owned by another, re-opening the exact race this guards. `claimSendWindow`
  // hands each owner an idempotent release so the count can only be balanced.
  const activeSendCountRef = useRef(0);
  const claimSendWindow = useCallback(() => {
    activeSendCountRef.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeSendCountRef.current = Math.max(0, activeSendCountRef.current - 1);
    };
  }, []);

  // DOUBLE-SUBMIT GUARD (streaming/approval cluster Finding 7): mirrors mobile's
  // ChatInput.tsx `sendPendingRef` -- ChatComposerNew's own `isLoading || disabled`
  // check in handleSubmit only blocks a SECOND click once the store's
  // `isLoading` has round-tripped through a React render, but `sendContent` is
  // an async function whose body runs SYNCHRONOUSLY up to its first `await` --
  // so a synchronous check at the very top closes the double-submit window with
  // zero render latency, without needing a second ref in the composer.
  //
  // AUDIT-FIX STR-6: keyed PER CONVERSATION. The old single boolean was held for
  // the ENTIRE stream (`await doSend()` -> `await sendMessage` -> `await
  // consumeAssistantStream`), so a send in ANY other conversation hit
  // `if (isSendingRef.current) return;` and vanished -- no error, no toast,
  // nothing. Scoped, it does what its comment claims (close the reentrancy
  // window for one conversation) instead of serialising the whole app.
  const sendingConversationsRef = useRef<Set<string>>(new Set());
  // Conversations whose auto-title read has already been started. The effect below
  // re-runs on every `conversations` change, including the one its own adoption
  // causes, so without this it would start a second read pass mid-flight.
  const autoTitledConversationsRef = useRef<Set<string>>(new Set());

  const [composerClearSignal, setComposerClearSignal] = useState(0);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [bareChatSessionId, setBareChatSessionId] = useState<string | null>(null);
  const [pendingByokHandoff, setPendingByokHandoff] = useState<PendingByokHandoff | null>(null);
  const [selectedHandoffContextIds, setSelectedHandoffContextIds] = useState<string[]>([]);
  const [handoffPreview, setHandoffPreview] = useState<WebLocalToByokPreview | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [isBuildingHandoff, setIsBuildingHandoff] = useState(false);
  const [isConfirmingHandoff, setIsConfirmingHandoff] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  // Whether CreateProjectDialog was opened from the composer picker (select the
  // new project as chat scope) vs the sidebar (navigate to the project page).
  const [createProjectFromComposer, setCreateProjectFromComposer] = useState(false);
  const [upgradePlanOpen, setUpgradePlanOpen] = useState(false);
  const [upgradePlanTarget, setUpgradePlanTarget] = useState<UpgradeTarget | null>(null);
  const [upgradeConfirm, setUpgradeConfirm] = useState<UpgradeConfirmRequest | null>(null);
  const imageTranscriptRecoveries = useImageTranscriptRecoveryStore((state) => state.recoveries);
  const setImageTranscriptRecovery = useImageTranscriptRecoveryStore((state) => state.setRecovery);
  const removeImageTranscriptRecovery = useImageTranscriptRecoveryStore(
    (state) => state.removeRecovery,
  );
  const removeImageTranscriptRecoveriesForMessages = useImageTranscriptRecoveryStore(
    (state) => state.removeRecoveriesForMessages,
  );
  const tryAcquireImageTranscriptMutation = useImageTranscriptRecoveryStore(
    (state) => state.tryAcquireMutation,
  );
  const releaseImageTranscriptMutation = useImageTranscriptRecoveryStore(
    (state) => state.releaseMutation,
  );
  const isImageTranscriptMutationInFlight = useImageTranscriptRecoveryStore(
    (state) => state.isMutationInFlight,
  );

  // Dialog state — lifted from ChatSidebar so they live at the page level and
  // work with the shared <Sidebar> component (which has no dialog state).
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);

  // Project settings dialog state (opened from sidebar row context menu)
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);

  // Web-specific hooks for the sidebar footer slot.
  const { signOut: clerkSignOut } = useClerk();
  const { user: clerkUser } = useUser();
  const isWorkspaceAdmin = useIsWorkspaceAdmin();
  const { user: compatibilityUser, logout } = useAuthStore();
  const canonicalUser = useBillingStore((s) => s.user);
  const clerkAccountUser = useMemo<ChatAccountIdentity | null>(() => {
    if (!clerkUser) return null;
    const name =
      clerkUser.fullName ||
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
      clerkUser.username ||
      undefined;
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
    return {
      id: clerkUser.id,
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    };
  }, [clerkUser]);
  const user = resolveChatAccountUser(canonicalUser, compatibilityUser, clerkAccountUser);
  const subscription = useBillingStore((s) => s.subscription);
  // Skills, Plugins, and Connectors live in the Settings modal (single home).
  const { openSettings } = useSettingsModal();

  // Project store — same data source already used by the filter dropdown in <Sidebar>
  const {
    projects: storeProjects,
    isReady: projectsReady,
    retry: refreshProjects,
  } = useManagedCloudProjects();
  const updateProjectInStore = useProjectStore((s) => s.updateProject);
  const removeProjectFromStore = useProjectStore((s) => s.removeProject);
  const setStoreProjects = useProjectStore((s) => s.setProjects);

  // Active project for the NEXT new chat. The shared store's activeProjectId is
  // the canonical selection (the /projects pages already write it); the composer
  // "Project or folder" picker reads/writes the same field, and createConversation
  // below threads it into POST /api/chat/conversations as projectId.
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  // Seed the active project from the URL. `?projectId=` is the ONE canonical
  // entry param (sidebar project row "New chat" and the project-detail
  // composer both emit it). Until this wiring nothing consumed it, so those
  // entries silently dropped the project scope. The composer flips itself
  // into AGI Work mode when it sees a preselected project.
  // `projectsReady` is a dependency on purpose: the managed-cloud hydrate
  // RESETS the store's activeProjectId to null when it lands (account-scope
  // safety in project-store.ts), which would clobber a seed that ran on
  // mount — re-seeding when readiness flips keeps the URL's intent.
  const urlProjectId = searchParams?.get('projectId') ?? null;
  useEffect(() => {
    if (urlProjectId) setActiveProject(urlProjectId);
  }, [urlProjectId, setActiveProject, projectsReady]);

  // Map store Project[] -> SidebarProject[] (no starred->pinned: use starred as pinned proxy)
  const sidebarProjects = useMemo<SidebarProject[]>(
    () =>
      storeProjects.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        accentColor: p.accentColor,
        iconEmoji: p.iconEmoji,
        description: p.description,
        // Use starred as the pinned signal (no dedicated pinned field on Project)
        pinned: p.starred ?? false,
      })),
    [storeProjects],
  );

  // Open the conversation-search dialog when arriving with ?search=true (the
  // command-palette "Search Conversations" action navigates here), then strip
  // the param so it isn't sticky on close/reload.
  useEffect(() => {
    if (openSearchParam !== 'true') return;
    setSearchDialogOpen(true);
    const next = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    next.delete('search');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : (pathname ?? '/chat'), { scroll: false });
  }, [openSearchParam, searchParams, router, pathname]);

  // Listen for sidebar-dispatched events so keyboard shortcuts and Cmd+K still work
  // regardless of which component dispatches them.
  useEffect(() => {
    const openSearch = () => setSearchDialogOpen(true);
    const openShortcuts = () => setKeyboardShortcutsOpen(true);
    window.addEventListener('agi:open-search', openSearch);
    window.addEventListener('agi:open-shortcuts', openShortcuts);
    return () => {
      window.removeEventListener('agi:open-search', openSearch);
      window.removeEventListener('agi:open-shortcuts', openShortcuts);
    };
  }, []);

  /**
   * Route ownership must win immediately, before the async conversation loader
   * updates `activeConversationId`. Otherwise the first render after selecting
   * chat B still reflects chat A's loading/streaming state and briefly shows
   * A's Stop button in B's composer.
   */
  const displayedConversationId = urlConversationId ?? bareChatSessionId;
  const displayedImageTranscriptRecoveries = useMemo(
    () =>
      Object.values(imageTranscriptRecoveries).filter(
        (recovery) => recovery.conversationId === displayedConversationId,
      ),
    [displayedConversationId, imageTranscriptRecoveries],
  );
  // Streaming send + store state
  const { sendMessage, stopGeneration, continueGeneration, resolveToolApproval } =
    useChatStreamRuntime();
  const isStreaming = useChatStore(selectIsConversationStreaming(displayedConversationId));
  const isLoading = useChatStore(selectIsConversationLoading(displayedConversationId));

  // Notification banner: appears after 3s of streaming if the user hasn't
  // already granted/denied the Notification permission in this session.
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const notifBannerDismissedRef = useRef(false);
  const notifBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (notifBannerDismissedRef.current) return;
    if (Notification.permission !== 'default') return;

    if (isStreaming) {
      if (!notifBannerTimerRef.current) {
        notifBannerTimerRef.current = setTimeout(() => {
          if (!notifBannerDismissedRef.current) {
            setShowNotifBanner(true);
          }
        }, 3000);
      }
    } else {
      if (notifBannerTimerRef.current) {
        clearTimeout(notifBannerTimerRef.current);
        notifBannerTimerRef.current = null;
      }
      setShowNotifBanner(false);
    }

    return () => {
      if (notifBannerTimerRef.current) {
        clearTimeout(notifBannerTimerRef.current);
      }
    };
  }, [isStreaming]);

  const handleRequestNotifPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    notifBannerDismissedRef.current = true;
    setShowNotifBanner(false);
    await Notification.requestPermission();
  }, []);

  const handleDismissNotifBanner = useCallback(() => {
    notifBannerDismissedRef.current = true;
    setShowNotifBanner(false);
  }, []);

  // Managed cloud is public-alpha-open: a signed-in user already reaches it.
  // The upgrade dialog only sells higher hosted capacity, it is not an access
  // gate, so opening it simply shows the plan comparison (no waitlist).
  const handleOpenUpgradeDialog = useCallback((targetTier: UpgradeTarget | null = null) => {
    setUpgradePlanTarget(targetTier);
    setUpgradePlanOpen(true);
  }, []);

  const handlePaywallRecovery = useCallback(
    (_messageId: string, requiredTier: string, recoveryAction: MediaPaywallRecoveryAction) => {
      runMediaPaywallRecovery(
        { recoveryAction, requiredTier },
        {
          openSettings,
          openUpgrade: handleOpenUpgradeDialog,
        },
      );
    },
    [handleOpenUpgradeDialog, openSettings],
  );

  // Route the upgrade CTA to the real Stripe checkout flow (same service the
  // billing dashboard uses). No waitlist email capture.
  const handleUpgradePlan = useCallback(
    async (plan: UpgradeTarget, annual: boolean) => {
      if (!user) {
        toast.error('Please sign in to upgrade.');
        return;
      }
      setUpgradePlanOpen(false);
      setUpgradePlanTarget(null);
      const billingPeriod = annual ? 'yearly' : 'monthly';
      const hasActivePaidPlan =
        subscription != null &&
        !['free', 'local-only', 'byok'].includes(subscription.tier) &&
        ['active', 'trialing'].includes(subscription.status);
      // A mid-cycle upgrade charges the saved card immediately with no Stripe
      // screen, so confirm the exact prorated amount first instead of charging
      // silently. UpgradeConfirmDialog owns the preview + the actual charge.
      if (hasActivePaidPlan) {
        if (!billingPolicyReady) {
          toast.error('Billing details are still loading. Please try again in a moment.');
          return;
        }
        if (subscription?.subscription_source !== 'stripe') {
          toast.error(billingOwnerPlanChangeMessage(subscription?.subscription_source));
          openSettings('billing');
          return;
        }
        setUpgradeConfirm({ plan, billingInterval: billingPeriod });
        return;
      }
      const toastId = toast.loading('Redirecting to checkout...');
      try {
        if (plan === 'basic') {
          await upgradeToBasicPlan({ userId: user.id, userEmail: user.email || '' });
        } else if (plan === 'pro') {
          await upgradeToProPlan({
            userId: user.id,
            userEmail: user.email || '',
            billingPeriod,
          });
        } else if (plan === 'max') {
          await upgradeToMaxPlan({
            userId: user.id,
            userEmail: user.email || '',
            billingPeriod: 'monthly',
          });
        } else if (plan === 'max_15x') {
          await upgradeToMax15xPlan({ userId: user.id, userEmail: user.email || '' });
        }
        // On success the service redirects to Stripe; the dismiss below only
        // runs if navigation has not yet replaced the page.
        toast.dismiss(toastId);
      } catch (err) {
        toast.dismiss(toastId);
        toast.error(toUserMessage(err, 'Failed to start checkout.'));
      }
    },
    [billingPolicyReady, openSettings, subscription, user],
  );

  /**
   * GOV-19 — the shared `Sidebar` has always exposed `showUsageWidget` /
   * `budgetPercent` and rendered a threshold bar for them, but no call site in
   * `apps/` or `packages/` passed either, so remaining quota was invisible in
   * the chat surface. Turning the widget on without this wiring would have
   * rendered a confident, permanent "0%", so the widget stays hidden until the
   * first successful fetch resolves and `budgetPercent` is a real number.
   *
   * The percentage is the WORST of the billing-period, rolling 5-hour, rolling
   * weekly and flagship-weekly windows — the one that will actually stop the
   * next turn.
   */
  const { usage: managedUsageSummary } = useManagedUsageSummary();
  /*
   * The one limit worth warning about, named in prose above the composer.
   * Usage was previously visible only in Settings, so the first signal a user
   * got was a refused message mid-task. `selectUsageWarning` picks the BINDING
   * bucket rather than the worst percentage with no name attached, which is
   * what `getWorstUsagePercent` (used by the sidebar widget) has to discard.
   */
  const usageWarning = useMemo(
    () => selectUsageWarning(readManagedUsageBuckets(managedUsageSummary)),
    [managedUsageSummary],
  );
  const [usageWarningDismissed, setUsageWarningDismissed] = useState(false);
  const liveUsageWarning = usageWarningDismissed ? null : usageWarning;
  const usageBanner = (
    <UsageWarningBanner
      warning={liveUsageWarning}
      // CRIT-008: `/settings/usage` renders a SettingsModalRedirect that
      // replaces back to /chat, so pushing it unmounted and remounted this
      // page one tick after leaving it. Open the modal in place instead.
      onUpgrade={() => openSettings('usage')}
      onDismiss={() => setUsageWarningDismissed(true)}
    />
  );
  const [modelSubstitution, setModelSubstitution] = useState<ModelSubstitution | null>(null);
  const unavailableModelNotice = (
    <UnavailableModelNotice
      substitution={modelSubstitution}
      onDismiss={() => setModelSubstitution(null)}
    />
  );
  const managedBudgetPercent = useMemo(
    () => getWorstUsagePercent(managedUsageSummary),
    [managedUsageSummary],
  );

  const messages = useChatStore((s) => s.messages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setActiveLeaf = useChatStore((s) => s.setActiveLeaf);
  const revealMessage = useChatStore((s) => s.revealMessage);
  const chatError = useChatStore((s) => s.error);
  const setChatError = useChatStore((s) => s.setError);
  const setResearchState = useChatStore((s) => s.setResearchState);

  /**
   * SendPreview presentation · outbound-route disclosure rendered as a compact
   * control below the composer. It stays visible before send without occupying
   * a banner row, and expands on demand to show the real active tool list.
   */
  const composerToggles = useChatStore(
    (s) =>
      s.composerTogglesByConversation[displayedConversationId ?? PENDING_CONVERSATION_KEY] ??
      DEFAULT_COMPOSER_TOGGLES,
  );
  const thinkingEnabled = useThinkingStore((s) => s.enabled);
  const sendPreviewToolNames = useMemo(() => {
    const names: string[] = [];
    if (composerToggles?.workMode === 'agiwork') names.push('AGI Work');
    if (composerToggles?.webSearchEnabled) names.push('Web search');
    if (composerToggles?.researchEnabled) names.push('Deep Research');
    if (composerToggles?.codeExecutionEnabled) names.push('Run code');
    if (composerToggles?.officeCreationEnabled) names.push('Office files');
    if (thinkingEnabled) names.push('Extended thinking');
    if (composerToggles?.selectedSkillName)
      names.push(`Skill: ${composerToggles.selectedSkillName}`);
    return names;
  }, [composerToggles, thinkingEnabled]);
  const sendPreviewPresentation = useMemo<SendPreviewPresentation>(() => {
    const providerMode: ProviderMode = 'ManagedGateway';
    return summarizeSendPreview({
      providerMode,
      modelLabel: selectedModel?.name ?? undefined,
      modelId: activeModelId,
      toolNames: sendPreviewToolNames,
      // User-facing label only — never leak the internal gateway hostname.
      destinationHost: 'AGI managed cloud',
    });
  }, [activeModelId, selectedModel, sendPreviewToolNames]);

  // Conversation CRUD
  const {
    conversations,
    // AUDIT-FIX STR-7/BUG-12: conversation-CRUD progress, now kept SEPARATE from
    // the store's turn-scoped `isLoading` (which gates the composer and Stop
    // button). It is still needed here so opening a conversation does not flash
    // the empty-chat greeting before its transcript arrives.
    isLoading: isConversationLoading,
    listError: conversationListError,
    createConversation,
    loadConversation,
    deleteConversation,
    updateConversation,
    setActiveConversation,
  } = useConversations();
  const adoptPendingComposerToggles = useChatStore((s) => s.adoptPendingComposerToggles);
  const {
    groupsByMessageId: branchGroupsByMessageId,
    branchingMessageId,
    createBranch,
    switchBranch,
  } = useConversationBranches(displayedConversationId);

  // A pending edit rollback is valid only for the conversation it began in and
  // only until the next send. Switching conversations abandons it (the messages
  // are never deleted), preventing a stale rollback from truncating the wrong
  // conversation on a later send.
  useEffect(() => {
    pendingEditRollbackRef.current = null;
  }, [displayedConversationId]);

  // Reconcile a stale active conversation with the empty/new-chat view. Navigating
  // back to `/chat` home via a route change (logo click, browser back) does NOT run
  // `handleNewChat`, so the store can still mark a prior conversation active with its
  // completed assistant turns in `messages` while the greeting shows. `ComposerFooter`
  // reads that raw store to gate the "Switch model mid-conversation?" cache warning, so
  // the dialog wrongly fires on the empty homepage (DEMO-BLOCKER). Clear the store when
  // the view is genuinely empty and no send/stream is in flight (see
  // `isStaleActiveConversation` for the race-safe guard).
  useEffect(() => {
    if (
      isStaleActiveConversation({
        displayedConversationId,
        activeConversationId,
        isStreaming,
        isLoading,
        isSending: activeSendCountRef.current > 0,
      })
    ) {
      setActiveConversation(null);
    }
  }, [
    displayedConversationId,
    activeConversationId,
    isStreaming,
    isLoading,
    setActiveConversation,
  ]);

  const displayedMessages = useMemo(
    () =>
      displayedConversationId && activeConversationId === displayedConversationId ? messages : [],
    [activeConversationId, displayedConversationId, messages],
  );
  const displayedConversation = useMemo(
    () =>
      displayedConversationId
        ? (conversations.find((c) => c.id === displayedConversationId) ?? null)
        : null,
    [conversations, displayedConversationId],
  );

  const variantsEnabled = useMessageVariantsEnabled();
  const persistActiveLeaf = useCallback(
    async (conversationId: string, activeLeafMessageId: string): Promise<void> => {
      const authToken = await getToken();
      if (!authToken) return;
      try {
        await putActiveLeafMessageId({ conversationId, activeLeafMessageId, authToken });
      } catch {
        // The selection is local and already correct; only its durability is
        // lost, and the next selection or a fresh answer writes it again.
      }
    },
    [getToken],
  );
  const activeLeafId = useChatStore(selectActiveLeafId(displayedConversationId));
  const allConversationRows = useChatStore(selectConversationAllRows(displayedConversationId));
  /**
   * Pager state for the transcript, held at a stable identity for as long as its
   * content is unchanged.
   *
   * `allConversationRows` gets a new array on every streamed frame while saying
   * nothing new about the tree. Recomputing is cheap; handing every MessageRow a
   * new object 60 times a second is not — their comparators check this by
   * reference, and a fresh identity per frame would re-render the whole
   * transcript for the duration of every answer.
   */
  const variantInfoRef = useRef<VariantInfoByMessageId>(EMPTY_VARIANT_INFO);
  const variantInfoByMessageId = useMemo(() => {
    const next = variantsEnabled
      ? variantInfoByMessage(allConversationRows, activeLeafId)
      : EMPTY_VARIANT_INFO;
    if (sameVariantInfoMap(variantInfoRef.current, next)) return variantInfoRef.current;
    variantInfoRef.current = next;
    return next;
  }, [allConversationRows, activeLeafId, variantsEnabled]);

  /**
   * The sibling the reader last paged to, so the list can anchor on it rather
   * than jumping to the bottom. Cleared when the conversation changes, or a
   * stale id would anchor the next transcript on a message from this one.
   */
  const [variantAnchorMessageId, setVariantAnchorMessageId] = useState<string | null>(null);
  useEffect(() => setVariantAnchorMessageId(null), [displayedConversationId]);

  const handleSelectVariant = useCallback(
    (messageId: string) => {
      const conversationId = displayedConversationId;
      if (!conversationId || isStreaming) return;
      const rows = selectConversationAllRows(conversationId)(useChatStore.getState());
      if (!rows.some((row) => row.id === messageId)) return;
      // Selecting a sibling selects the whole tail it produced, so an earlier
      // question's other answer brings back the exchange that followed it.
      const leafId = resolveLeafForSibling(rows, messageId);
      setActiveLeaf(conversationId, leafId);
      setVariantAnchorMessageId(messageId);
      // Fire-and-forget: the selection is already on screen, and the durable
      // write only decides which variant the next device to open this chat sees.
      void persistActiveLeaf(conversationId, leafId);
    },
    [displayedConversationId, isStreaming, persistActiveLeaf, setActiveLeaf],
  );
  const displayedConversationIdRef = useRef(displayedConversationId);
  displayedConversationIdRef.current = displayedConversationId;
  const hydratedConversationModelRef = useRef<string | null>(null);

  // A saved conversation owns its model. Restore that validated value when a
  // chat is opened instead of silently continuing with whichever global
  // default happened to be selected in the previous chat. The identity+model
  // key prevents the Free-tier correction effect from fighting this on every
  // render after a downgrade.
  useEffect(() => {
    const persistedModel = displayedConversation?.model;
    if (!displayedConversationId || !persistedModel) {
      setModelSubstitution(null);
      return;
    }
    const hydrationKey = `${displayedConversationId}:${persistedModel}`;
    if (hydratedConversationModelRef.current === hydrationKey) return;
    hydratedConversationModelRef.current = hydrationKey;
    setSelectedModelId(resolveSelectableModelId(persistedModel));
    setModelSubstitution(describeModelSubstitution(persistedModel));
  }, [displayedConversation?.model, displayedConversationId, setSelectedModelId]);

  const handleConversationModelChange = useCallback(
    async (nextModelId: string): Promise<boolean> => {
      const modelId = resolveSelectableModelId(nextModelId);
      const targetConversationId = displayedConversationId;
      if (!targetConversationId) {
        setSelectedModelId(modelId);
        setModelSubstitution(null);
        return true;
      }

      const saved = await updateConversation(targetConversationId, { model: modelId });
      if (!saved) return false;
      if (displayedConversationIdRef.current === targetConversationId) {
        setSelectedModelId(modelId);
        setModelSubstitution(null);
      }
      return true;
    },
    [displayedConversationId, setSelectedModelId, updateConversation],
  );

  // Public sharing is always a two-step action: the visible Share control opens
  // a disclosure/expiry dialog, and only the dialog's explicit confirmation
  // creates a public snapshot.
  const activeConversationTitle = displayedConversation?.title;
  // Tab title follows the open conversation. Reuses the title already derived
  // above rather than re-selecting it, so the two can never disagree — the
  // Share dialog and the browser tab always name the same chat.
  useDocumentTitleSync(activeConversationId, activeConversationTitle);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const hasMessages = displayedMessages.length > 0;

  /*
   * A refused turn already states itself in the transcript as an
   * InlinePaywallCard with its own recovery buttons. The generic error banner
   * printed the identical sentence a second time at the top of the surface, in
   * destructive red beside the card's warning amber — one condition, two
   * severities, two copies.
   */
  const showsInlinePaywall = useMemo(
    () =>
      displayedMessages.some(
        (message) => (message.metadata as { paywall?: unknown } | undefined)?.paywall != null,
      ),
    [displayedMessages],
  );

  // "Reply ready" browser notification: fires once per completed stream while
  // the tab is backgrounded. Previously the permission banner above only
  // ever called Notification.requestPermission() — nothing consumed the
  // grant, so no notification ever fired. Respects the user's saved
  // "browserReplyReady" preference from Settings > Notifications.
  const wasStreamingRef = useRef(false);
  const browserReplyReady = useBrowserReplyReadyPreference();

  useEffect(() => {
    const justFinished = wasStreamingRef.current && !isStreaming;
    wasStreamingRef.current = isStreaming;
    if (!justFinished) return;
    if (typeof document === 'undefined' || typeof Notification === 'undefined') return;
    // Matches the Settings copy: "Shown as desktop popups when the AGI tab
    // is in the background." Don't interrupt an active, focused session.
    if (document.visibilityState !== 'hidden') return;
    if (Notification.permission !== 'granted') return;
    if (!browserReplyReady) return;
    if (chatError) return; // a failed turn isn't a "reply ready"

    const lastAssistant = [...displayedMessages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant?.content) return;

    useNotificationStore.getState().sendDesktopNotification({
      id: lastAssistant.id,
      type: 'info',
      title: 'Reply ready',
      message:
        lastAssistant.content.trim().slice(0, 140) ||
        displayedConversation?.title ||
        'Your response is ready.',
      timestamp: new Date(),
      read: false,
      persistent: false,
      priority: 'low',
      category: 'chat',
    });
  }, [isStreaming, displayedMessages, chatError, displayedConversation, browserReplyReady]);

  // On mount: if URL has a conversation ID, load it. Otherwise keep /chat as
  // the empty new-chat surface and create persistence only when the user sends.
  const routeInitializedRef = useRef(false);
  useEffect(() => {
    // Wait for Clerk auth to resolve before loading a conversation by URL. While the
    // session is still loading, loadConversation()'s getAuthHeaders throws and returns
    // false — without this guard a valid conversation opened by direct or fast navigation
    // gets wrongly redirected to /chat (losing it). Re-runs once authLoaded flips true.
    if (!authLoaded) return;
    if (routeInitializedRef.current && !urlConversationId) return;
    routeInitializedRef.current = true;

    if (urlConversationId) {
      if (urlConversationId !== activeConversationId) {
        void loadConversation(urlConversationId).then((ok) => {
          if (!ok) {
            // loadConversation set the store error (server's 404/403 message) before
            // returning false; capture it BEFORE setActiveConversation(null) resets it
            // to null, so the user gets feedback instead of a silent bounce to a blank
            // /chat surface.
            const reason = useChatStore.getState().error;
            setBareChatSessionId(null);
            setActiveConversation(null);
            router.replace('/chat');
            toast.error(reason || 'This conversation is unavailable — it may have been deleted.');
          }
        });
      }
    } else if (activeConversationId) {
      setBareChatSessionId(null);
      setActiveConversation(null);
    }
  }, [
    activeConversationId,
    authLoaded,
    loadConversation,
    router,
    setActiveConversation,
    urlConversationId,
  ]);

  const sendContent = useCallback(
    async (
      content: string,
      options: {
        conversationId?: string;
        attachments?: File[];
        meta?: SendMeta;
        userMessageId?: string;
        assistantMessageId?: string;
        /** Fires before provider egress once the exact user turn is durable. */
        onTurnCommitted?: () => void;
      } = {},
    ) => {
      // Double-submit guard (Finding 7): bails out synchronously if a send is
      // already in flight FOR THIS CONVERSATION -- see sendingConversationsRef's
      // doc comment above for why this check, positioned before any `await`, is
      // what actually closes the reentrancy window (a rapid double Enter/click
      // otherwise fires two concurrent turns since ChatComposerNew's
      // isLoading-based guard alone has a render-latency gap).
      //
      // AUDIT-FIX STR-6: the key is the conversation being sent to, so a send in
      // a DIFFERENT chat is never silently swallowed. A brand-new chat has no id
      // yet, so pre-create sends share one key -- which is exactly right: two
      // rapid submits on the empty surface must not create two conversations.
      const sendGuardKey =
        options.conversationId || urlConversationId || bareChatSessionId || NEW_CHAT_SEND_GUARD_KEY;
      if (sendingConversationsRef.current.has(sendGuardKey)) return;
      sendingConversationsRef.current.add(sendGuardKey);

      // Hold the send window for the entire flow (claimed BEFORE
      // createConversation, which is the first thing to mutate the store's
      // activeConversationId) so the stale-active reconciler can never null the
      // just-created conversation during the first-message → navigate window.
      // Released exactly once in `finally` (AUDIT-FIX STR-26).
      const releaseSendWindow = claimSendWindow();
      let targetConversationId =
        options.conversationId || urlConversationId || bareChatSessionId || null;
      try {
        // Project scope for a NEW conversation: the composer's send meta is the
        // value the user saw at submit time; fall back to the shared store for
        // sends that do not originate from the composer picker flow.
        const sendProjectId =
          options.meta?.projectId !== undefined ? options.meta.projectId : activeProjectId;
        let freshConvId: string | null = null;
        const convId =
          options.conversationId ||
          urlConversationId ||
          bareChatSessionId ||
          (await createConversation(NEW_CHAT_TITLE, activeModelId, sendProjectId).then((c) => {
            if (c) {
              freshConvId = c.id;
              // The composer's toggles live under the pending key until this
              // conversation exists. Move them now, before the send reads them
              // and before the route swaps — otherwise a chat started in Video
              // or Image mode reverts to text the moment it gets an id.
              adoptPendingComposerToggles(c.id);
              if (!urlConversationId) setBareChatSessionId(c.id);
              return c.id;
            }
            return null;
          }));

        if (!convId) return;
        targetConversationId = convId;
        if (!urlConversationId) setBareChatSessionId(convId);

        // Navigate to the canonical /chat/[id] URL after the first message so the
        // conversation is bookmarkable and survives a page refresh. Use replace so
        // the empty /chat entry is removed from browser history.
        if (freshConvId) {
          router.replace(`/chat/${freshConvId}`);
        }

        const resolvedAttachments = options.attachments?.length
          ? await uploadChatAttachments(options.attachments)
          : undefined;

        // AUDIT-FIX STR-22: `onTurnCommitted` fires as soon as the replacement
        // user turn is DURABLE (its row saved), not at stream end. The
        // edit/regenerate flow uses it to drop the replaced turn's server rows
        // at that moment instead of holding them for the whole stream -- the
        // window in which a reload showed a duplicated user message plus the
        // stale answer.
        const doSend = (replacementTurnCommitted?: () => void) =>
          sendMessage(content, {
            model: activeModelId,
            userMessageId: options.userMessageId,
            assistantMessageId: options.assistantMessageId,
            conversationId: convId,
            onTurnCommitted:
              replacementTurnCommitted || options.onTurnCommitted
                ? () => {
                    replacementTurnCommitted?.();
                    options.onTurnCommitted?.();
                  }
                : undefined,
            attachments: resolvedAttachments,
            webSearch: options.meta?.webSearchEnabled,
            // Search implies fetch (ChatGPT/Claude parity): with Search on, the model
            // can also open URLs — Anthropic via its native web_fetch server tool,
            // other providers via the platform url_fetch tool in the agentic loop.
            webFetch: options.meta?.webSearchEnabled,
            thinkingEnabled: options.meta?.thinkingEnabled,
            codeExecution: options.meta?.codeExecutionEnabled,
            officeCreation: options.meta?.officeCreationEnabled,
            workMode: options.meta?.workMode,
            agiWorkGoal: options.meta?.agiWorkGoal,
            research: options.meta?.researchEnabled,
            styleMode: options.meta?.styleMode,
            styleInstruction: options.meta?.styleInstruction,
            skillName: options.meta?.skillName,
            mcpContext: options.meta?.mcpContext,
          });

        // Deferred edit rollback: if this send is the resubmission of an edited
        // message, replace the original message + everything after it. The delete is
        // deferred to send time (not edit-click, so abandoning the edit loses nothing)
        // AND to AFTER the resubmission commits (so a send that bails pre-commit does
        // not lose the original) — see sendReplacingMessages.
        const pendingEdit = consumePendingEdit(pendingEditRollbackRef.current, convId);
        const replace = sendReplacingMessagesRef.current;
        if (pendingEdit && replace) {
          pendingEditRollbackRef.current = null;
          await replace(pendingEdit.rollbackIds, doSend);
        } else {
          await doSend();
        }
      } catch (error) {
        const message = toUserMessage(error, 'Could not attach the selected files.');
        setChatError(message, targetConversationId ?? undefined);
        toast.error(message);
      } finally {
        // Release the guard once the send has fully settled (or bailed). By now
        // `bareChatSessionId`/`urlConversationId` reflect the real conversation,
        // so the reconciler reads a consistent displayed id and never misfires.
        sendingConversationsRef.current.delete(sendGuardKey);
        releaseSendWindow();
      }
    },
    [
      urlConversationId,
      bareChatSessionId,
      createConversation,
      adoptPendingComposerToggles,
      sendMessage,
      activeModelId,
      activeProjectId,
      router,
      setChatError,
      claimSendWindow,
    ],
  );

  // The project-detail composer is itself a Send control, not a prefill
  // shortcut. Claim its handoff only after Clerk resolves, then acknowledge it
  // when the user row is durable (before provider egress). The ref closes React
  // Strict Mode replay while the claim is in flight; a pre-commit failure puts
  // the exact text back in the composer instead of losing it.
  const projectHandoffInFlightRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authLoaded || !userId) return;
    try {
      const handoff = readProjectChatHandoff(sessionStorage, urlProjectId);
      if (!handoff) return;
      if (projectHandoffInFlightRef.current === handoff.id) return;

      if (handoff.attachmentsUnavailable) {
        acknowledgeProjectChatHandoff(sessionStorage, handoff.id);
        setComposerPrefill(handoff.content);
        toast.error('Reattach the project files, then send again. No model was called.');
        return;
      }

      projectHandoffInFlightRef.current = handoff.id;
      let committed = false;
      void sendContent(handoff.content, {
        userMessageId: handoff.userMessageId,
        assistantMessageId: handoff.assistantMessageId,
        attachments: handoff.attachments,
        meta: {
          ...handoff.meta,
          projectId: handoff.projectId,
          workMode: 'agiwork',
          skillName: handoff.skillId ?? handoff.meta.skillName,
        },
        onTurnCommitted: () => {
          acknowledgeProjectChatHandoff(sessionStorage, handoff.id);
          committed = true;
        },
      }).finally(() => {
        projectHandoffInFlightRef.current = null;
        if (committed) return;
        acknowledgeProjectChatHandoff(sessionStorage, handoff.id);
        setComposerPrefill(handoff.content);
        toast.error('The project turn did not start. Your draft is ready to send again.');
      });
    } catch {
      // The source handler refuses navigation when storage is unavailable. If
      // it becomes unavailable after navigation, keep the destination usable.
    }
  }, [authLoaded, sendContent, urlProjectId, userId]);

  const { generateImage, startVideoGeneration, watchVideoGeneration } = useMediaGeneration();

  // ---------------------------------------------------------------------------
  // Shared helper: preserve exact catalog-supported ratios. Missing/retired
  // model metadata cannot prove a provider, so the catalog helper omits both
  // and lets the server select the deployment's configured default.
  // ---------------------------------------------------------------------------

  /**
   * PER-29/PER-30 — the message's CURRENT metadata, so a failure patch can be
   * built against it instead of replacing it. `updateMessage` shallow-merges
   * the MESSAGE, so a `metadata` key overwrites the whole metadata object.
   */
  const readMessageMetadata = useCallback(
    (conversationId: string | null, messageId: string): MessageMetadata | undefined => {
      if (!conversationId) return undefined;
      const state = useChatStore.getState();
      const bucket =
        state.messagesByConversation[conversationId] ??
        (state.activeConversationId === conversationId ? state.messages : []);
      return bucket.find((message) => message.id === messageId)?.metadata;
    },
    [],
  );

  // Shared paywall/error helper
  const applyImageError = useCallback(
    // AUDIT-FIX ROOT-CAUSE: image generation is a long async turn the user can
    // navigate away from, so the failure must land on the conversation it was
    // started in, not on whatever chat is displayed when it fails.
    (
      msgId: string,
      error: unknown,
      conversationId: string,
    ): { content: string; metadata: MessageMetadata } => {
      const apiError = error instanceof MediaGenerationApiError ? error : null;
      const raw = toUserMessage(error, String(error));
      const paywall = apiError
        ? resolveMediaPaywallSlot({
            feature: 'image',
            refusal: apiError,
            currentTier: subscriptionTier,
            usage: managedUsageSummary,
          })
        : null;
      const content = paywall ? '' : `Image generation failed: ${raw}`;
      // PER-30: `metadata: undefined` used to REPLACE the metadata object on
      // the non-paywall branch (and the paywall branch replaced it with a
      // paywall-only object), discarding imageGenPrompt / imageGenAspect /
      // imageGenModel — exactly the fields Retry needs. Merge onto the current
      // metadata instead so a failed image can still be retried.
      const metadata = imageGenerationFailureMetadata(readMessageMetadata(conversationId, msgId), {
        ...(paywall ? { paywall } : {}),
        ...(apiError?.resetAt ? { retryAt: apiError.resetAt } : {}),
      });
      updateMessage(
        msgId,
        {
          isStreaming: false,
          content,
          metadata,
        },
        conversationId,
      );
      return { content, metadata };
    },
    [updateMessage, readMessageMetadata, subscriptionTier, managedUsageSummary],
  );

  /**
   * One new-image transaction for both the initial composer submit and a
   * prompt-save retry. The coordinator owns the durability order; this page
   * action owns transcript state, billing/provider error presentation, and the
   * exact recovery payload shown to the user.
   */
  const executeNewImageGenerationTurn = useCallback(
    async (turn: NewImageGenerationTurn): Promise<void> => {
      let generatedImage: GeneratedImageResult | null = null;
      const updateOwnMessage = (id: string, updates: Partial<Message>) =>
        updateMessage(id, updates, turn.conversationId);
      const getAuthToken = async () => {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        return token;
      };
      const resultMetadata = (imageUrl: string): MessageMetadata => ({
        toolType: 'image-generation',
        imageUrl,
        imageGenPrompt: turn.prompt,
        imageGenAspect: turn.requestedAspect,
        ...((generatedImage?.model ?? turn.requestedModel)
          ? { imageGenModel: generatedImage?.model ?? turn.requestedModel }
          : {}),
      });

      const outcome = await runDurableImageGenerationTurn({
        mode: 'new',
        temporary: turn.temporary,
        persistPrompt: async () => {
          requireImageMessagePersistence(
            await persistImageGenerationUserMessage({
              conversationId: turn.conversationId,
              messageId: turn.userMessageId,
              content: turn.prompt,
              getAuthToken,
              updateMessage: updateOwnMessage,
            }),
          );
        },
        beforeGenerate: () => {
          // A prompt-recovery notice has reached its commit point. Remove it
          // before the paid request starts; any later transcript failure gets
          // its own result-phase recovery using this same assistant UUID.
          removeImageTranscriptRecovery(turn.assistantMessageId);
          addMessage(
            {
              id: turn.assistantMessageId,
              role: 'assistant',
              content: '',
              isStreaming: true,
              createdAt: new Date().toISOString(),
              metadata: {
                toolType: 'image-generation',
                imageGenPrompt: turn.prompt,
                imageGenAspect: turn.requestedAspect,
                ...(turn.requestedModel ? { imageGenModel: turn.requestedModel } : {}),
              },
            },
            turn.conversationId,
          );
        },
        generate: async () => {
          generatedImage = await generateImage(turn.prompt, {
            ...turn.imageRequest,
            ...(!turn.temporary ? { conversationId: turn.conversationId } : {}),
          });
          return generatedImage.imageUrl;
        },
        onGenerated: (imageUrl) => {
          updateOwnMessage(turn.assistantMessageId, {
            content: '',
            isStreaming: false,
            metadata: resultMetadata(imageUrl),
          });
        },
        persistResult: async (imageUrl) => {
          requireImageMessagePersistence(
            await persistImageGenerationAssistantMessage({
              conversationId: turn.conversationId,
              messageId: turn.assistantMessageId,
              model: generatedImage?.model ?? turn.requestedModel,
              metadata: resultMetadata(imageUrl),
              getAuthToken,
              updateMessage: updateOwnMessage,
            }),
          );
        },
      });

      if (outcome.status === 'prompt-persistence-failed') {
        setImageTranscriptRecovery({
          phase: 'prompt',
          status: 'failed',
          conversationId: turn.conversationId,
          userMessageId: turn.userMessageId,
          assistantMessageId: turn.assistantMessageId,
          prompt: turn.prompt,
          requestedAspect: turn.requestedAspect,
          imageRequest: turn.imageRequest,
          ...(turn.requestedModel ? { requestedModel: turn.requestedModel } : {}),
        });
        return;
      }

      if (outcome.status === 'generation-failed') {
        const failure = applyImageError(
          turn.assistantMessageId,
          outcome.error,
          turn.conversationId,
        );
        if (!turn.temporary) {
          const persistence = await persistImageGenerationAssistantMessage({
            conversationId: turn.conversationId,
            messageId: turn.assistantMessageId,
            model: turn.requestedModel,
            metadata: failure.metadata,
            content: failure.content,
            getAuthToken,
            updateMessage: updateOwnMessage,
          });
          if (!persistence.ok) {
            setImageTranscriptRecovery({
              phase: 'result',
              kind: 'generation-failure',
              status: 'failed',
              conversationId: turn.conversationId,
              assistantMessageId: turn.assistantMessageId,
              ...(failure.metadata.imageGenModel ? { model: failure.metadata.imageGenModel } : {}),
              metadata: failure.metadata,
              ...(failure.content ? { content: failure.content } : {}),
            });
          } else {
            removeImageTranscriptRecovery(turn.assistantMessageId);
          }
        }
        return;
      }

      if (outcome.status === 'result-persistence-failed') {
        const metadata = resultMetadata(outcome.imageUrl);
        setImageTranscriptRecovery({
          phase: 'result',
          status: 'failed',
          conversationId: turn.conversationId,
          assistantMessageId: turn.assistantMessageId,
          ...(metadata.imageGenModel ? { model: metadata.imageGenModel } : {}),
          metadata,
        });
        return;
      }

      removeImageTranscriptRecovery(turn.assistantMessageId);
    },
    [
      addMessage,
      applyImageError,
      generateImage,
      getToken,
      removeImageTranscriptRecovery,
      setImageTranscriptRecovery,
      updateMessage,
    ],
  );

  // ---------------------------------------------------------------------------
  // handleGenerateImage – called by composer; injects user + assistant messages
  // ---------------------------------------------------------------------------
  const handleGenerateImage = useCallback(
    (prompt: string, options: { aspectRatio: ImageAspectRatio; modelId: string }) => {
      // Same first-message send guard as sendContent: a lazy-created image
      // conversation has the identical createConversation → bareChatSessionId
      // gap that the stale-active reconciler would otherwise misread and clear.
      //
      // AUDIT-FIX STR-6/STR-26: claim the window with a balanced, idempotent
      // release (a bare `isSendingRef.current = false` here used to clear a
      // window still owned by a concurrent sendContent) and take the
      // reentrancy key for THIS conversation only, so an image generation in
      // one chat no longer blocks sends in every other chat.
      const imageGuardKey = displayedConversationId || NEW_CHAT_SEND_GUARD_KEY;
      if (sendingConversationsRef.current.has(imageGuardKey)) return;
      sendingConversationsRef.current.add(imageGuardKey);
      const releaseSendWindow = claimSendWindow();
      void (async () => {
        try {
          const imageRequest = resolveImageGenerationRequestOptions(
            options.aspectRatio,
            options.modelId,
          );
          const requestedAspect: ImageAspectRatio = imageRequest.aspectRatio ?? 'auto';
          const requestedModel = imageRequest.model;

          // Ensure a conversation exists (lazy-create, same pattern as sendContent).
          let convId = displayedConversationId;
          if (!convId) {
            const fresh = await createConversation(
              IMAGE_GENERATION_TITLE,
              activeModelId,
              activeProjectId,
            );
            if (fresh) {
              convId = fresh.id;
              if (!urlConversationId) setBareChatSessionId(fresh.id);
              router.replace(`/chat/${fresh.id}`);
            }
          }
          if (!convId) return;

          const temporary = isTemporaryConversationById(
            useChatStore.getState().conversations,
            convId,
          );

          // AUDIT-FIX ROOT-CAUSE: every write below names the conversation this
          // generation belongs to, so switching chats mid-generation can no
          // longer inject the prompt, the placeholder, or the finished image
          // into a different transcript.
          const userMessageId = crypto.randomUUID();
          const assistantMessageId = crypto.randomUUID();
          const mutationIds = [userMessageId, assistantMessageId];
          if (!tryAcquireImageTranscriptMutation(mutationIds)) {
            toast.error('This image turn is already being updated. Try again in a moment.');
            return;
          }
          try {
            addMessage(
              {
                id: userMessageId,
                role: 'user',
                content: prompt,
                createdAt: new Date().toISOString(),
              },
              convId,
            );
            await executeNewImageGenerationTurn({
              conversationId: convId,
              userMessageId,
              assistantMessageId,
              prompt,
              requestedAspect,
              imageRequest,
              temporary,
              ...(requestedModel ? { requestedModel } : {}),
            });
          } finally {
            releaseImageTranscriptMutation(mutationIds);
          }
        } finally {
          sendingConversationsRef.current.delete(imageGuardKey);
          releaseSendWindow();
        }
      })();
    },
    [
      displayedConversationId,
      urlConversationId,
      createConversation,
      activeModelId,
      activeProjectId,
      addMessage,
      executeNewImageGenerationTurn,
      releaseImageTranscriptMutation,
      router,
      claimSendWindow,
      tryAcquireImageTranscriptMutation,
    ],
  );

  // ---------------------------------------------------------------------------
  // handleRegenerateImageInPlace – called by ImageGenerationCard (edit panel /
  // aspect-ratio change).  Updates the EXISTING assistant message in-place;
  // does NOT inject new user/assistant messages.
  // Returns a Promise<string> so the card can update its local display state.
  // ---------------------------------------------------------------------------
  const handleRegenerateImageInPlace = useCallback(
    async (
      messageId: string,
      opts: { prompt: string; aspectRatio: ImageAspectRatio; modelId?: string },
    ): Promise<string> => {
      let generatedImage: GeneratedImageResult | null = null;
      const imageRequest = resolveImageGenerationRequestOptions(opts.aspectRatio, opts.modelId);
      const requestedAspect: ImageAspectRatio = imageRequest.aspectRatio ?? 'auto';
      const requestedModel = imageRequest.model;
      // AUDIT-FIX ROOT-CAUSE: capture the owning conversation up front; the
      // regeneration awaits a slow provider call the user can navigate away
      // from, and every write below must still land on THIS transcript.
      const ownerConversationId = displayedConversationId;
      if (!ownerConversationId) {
        throw new Error(
          'The owning conversation is unavailable, so the image was not regenerated.',
        );
      }
      const ownerConversationIsTemporary = isTemporaryConversationById(
        useChatStore.getState().conversations,
        ownerConversationId,
      );

      // PER-29: the pending state used to clear `metadata.imageUrl` and set
      // `isStreaming: true` BEFORE awaiting the provider, with no try/catch
      // around the await. Any failure therefore left a card spinning forever,
      // with the original image already erased and nothing persisted — an
      // unrecoverable state reachable by a single provider hiccup. The pending
      // metadata now KEEPS `imageUrl` (so the previous image stays visible and
      // is restorable), the await is wrapped, failure restores the retry
      // parameters, and `isStreaming` is cleared in a `finally` that runs on
      // every exit.
      const previousMetadata = readMessageMetadata(ownerConversationId, messageId);
      if (!tryAcquireImageTranscriptMutation([messageId])) {
        throw new Error(
          'Wait for this image card to finish saving before generating a new version.',
        );
      }

      try {
        updateMessage(
          messageId,
          {
            content: '',
            isStreaming: true,
            metadata: imageRegenerationPendingMetadata(previousMetadata, {
              prompt: opts.prompt,
              aspectRatio: requestedAspect,
              ...(requestedModel ? { modelId: requestedModel } : {}),
            }),
          },
          ownerConversationId,
        );
        const getAuthToken = async () => {
          const token = await getToken();
          if (!token) throw new Error('Not authenticated');
          return token;
        };
        const finalMetadata = (imageUrl: string): MessageMetadata =>
          mergeImageGenerationMetadata(previousMetadata, {
            toolType: 'image-generation',
            imageUrl,
            imageGenPrompt: opts.prompt,
            imageGenAspect: requestedAspect,
            imageRetryAt: undefined,
            ...((generatedImage?.model ?? requestedModel)
              ? { imageGenModel: generatedImage?.model ?? requestedModel }
              : {}),
          });

        const outcome = await runDurableImageGenerationTurn({
          mode: 'regenerate',
          temporary: ownerConversationIsTemporary,
          beforeGenerate: () => undefined,
          generate: async () => {
            generatedImage = await generateImage(opts.prompt, {
              ...imageRequest,
              ...(!ownerConversationIsTemporary ? { conversationId: ownerConversationId } : {}),
            });
            return generatedImage.imageUrl;
          },
          onGenerated: (imageUrl) => {
            updateMessage(
              messageId,
              {
                content: '',
                metadata: finalMetadata(imageUrl),
              },
              ownerConversationId,
            );
          },
          persistResult: async (imageUrl) => {
            requireImageMessagePersistence(
              await persistImageGenerationAssistantMessage({
                conversationId: ownerConversationId,
                messageId,
                model: generatedImage?.model ?? requestedModel,
                metadata: finalMetadata(imageUrl),
                getAuthToken,
                updateMessage: (id, updates) => updateMessage(id, updates, ownerConversationId),
              }),
            );
          },
        });

        if (outcome.status === 'completed') {
          removeImageTranscriptRecovery(messageId);
          return outcome.imageUrl;
        }

        if (outcome.status === 'result-persistence-failed') {
          const metadata = finalMetadata(outcome.imageUrl);
          setImageTranscriptRecovery({
            phase: 'result',
            status: 'failed',
            conversationId: ownerConversationId,
            assistantMessageId: messageId,
            ...(metadata.imageGenModel ? { model: metadata.imageGenModel } : {}),
            metadata,
          });
          // The provider work succeeded. Resolve with that asset so the open
          // revision panel displays it; the page-level notice above is the
          // explicit persistence failure and retries only this same row.
          return outcome.imageUrl;
        }

        const generationError = outcome.error;
        // Put the card back in a usable state, then durably save that exact
        // terminal state before rejecting back into the open revision panel.
        // This preserves a structured Retry-After across a reload without
        // issuing another provider request. A failed row save enters the same
        // explicit transcript-recovery flow as an already-created asset.
        const failure = applyImageError(messageId, generationError, ownerConversationId);
        if (!ownerConversationIsTemporary) {
          const persistence = await persistImageGenerationAssistantMessage({
            conversationId: ownerConversationId,
            messageId,
            model: failure.metadata.imageGenModel,
            metadata: failure.metadata,
            content: failure.content,
            getAuthToken,
            updateMessage: (id, updates) => updateMessage(id, updates, ownerConversationId),
          });
          if (!persistence.ok) {
            setImageTranscriptRecovery({
              phase: 'result',
              kind: 'generation-failure',
              status: 'failed',
              conversationId: ownerConversationId,
              assistantMessageId: messageId,
              ...(failure.metadata.imageGenModel ? { model: failure.metadata.imageGenModel } : {}),
              metadata: failure.metadata,
              ...(failure.content ? { content: failure.content } : {}),
            });
          } else {
            removeImageTranscriptRecovery(messageId);
          }
        }
        throw generationError;
      } finally {
        // PER-29: the spinner is cleared on EVERY exit, success or failure.
        updateMessage(messageId, { isStreaming: false }, ownerConversationId);
        releaseImageTranscriptMutation([messageId]);
      }
    },
    [
      updateMessage,
      applyImageError,
      generateImage,
      displayedConversationId,
      getToken,
      readMessageMetadata,
      releaseImageTranscriptMutation,
      removeImageTranscriptRecovery,
      setImageTranscriptRecovery,
      tryAcquireImageTranscriptMutation,
    ],
  );

  const handleRetryImageTranscriptRecovery = useCallback(
    async (recovery: ImageTranscriptRecovery): Promise<void> => {
      const mutationKeys = imageTranscriptMutationKeys(recovery);
      const ownerMessages = selectConversationMessages(recovery.conversationId)(
        useChatStore.getState(),
      );
      if (recovery.phase === 'prompt') {
        const promptMessage = ownerMessages.find(
          (message) => message.id === recovery.userMessageId && message.role === 'user',
        );
        if (!promptMessage || promptMessage.content !== recovery.prompt) {
          removeImageTranscriptRecovery(recovery.assistantMessageId);
          toast.error('That image prompt is no longer in this chat. No provider was called.');
          return;
        }
      } else {
        const resultMessage = ownerMessages.find(
          (message) => message.id === recovery.assistantMessageId,
        );
        if (!resultMessage) {
          removeImageTranscriptRecovery(recovery.assistantMessageId);
          toast.error('That chat card was removed. The image remains available in Library.');
          return;
        }
        if (resultMessage.isStreaming) {
          toast.error('Wait for the current image update to finish, then retry saving its card.');
          return;
        }
        if (resultMessage.metadata?.imageUrl !== recovery.metadata.imageUrl) {
          toast.error('A newer image is already shown here, so the older card was not restored.');
          return;
        }
      }

      if (
        recovery.phase === 'prompt' &&
        sendingConversationsRef.current.has(recovery.conversationId)
      ) {
        toast.error('Wait for the current turn to finish, then retry saving this image prompt.');
        return;
      }

      if (!tryAcquireImageTranscriptMutation(mutationKeys)) {
        toast.error(
          'Wait for the current chat change to finish, then retry saving this image turn.',
        );
        return;
      }
      setImageTranscriptRecovery({ ...recovery, status: 'retrying' });

      let releaseSendWindow: (() => void) | undefined;
      if (recovery.phase === 'prompt') {
        sendingConversationsRef.current.add(recovery.conversationId);
        releaseSendWindow = claimSendWindow();
      }

      try {
        if (recovery.phase === 'prompt') {
          await executeNewImageGenerationTurn({
            conversationId: recovery.conversationId,
            userMessageId: recovery.userMessageId,
            assistantMessageId: recovery.assistantMessageId,
            prompt: recovery.prompt,
            requestedAspect: recovery.requestedAspect,
            imageRequest: recovery.imageRequest,
            temporary: false,
            ...(recovery.requestedModel ? { requestedModel: recovery.requestedModel } : {}),
          });
          return;
        }

        const getAuthToken = async () => {
          const token = await getToken();
          if (!token) throw new Error('Not authenticated');
          return token;
        };
        requireImageMessagePersistence(
          await persistImageGenerationAssistantMessage({
            conversationId: recovery.conversationId,
            messageId: recovery.assistantMessageId,
            model: recovery.model,
            metadata: recovery.metadata,
            ...(recovery.content ? { content: recovery.content } : {}),
            getAuthToken,
            updateMessage: (id, updates) => updateMessage(id, updates, recovery.conversationId),
          }),
        );
        removeImageTranscriptRecovery(recovery.assistantMessageId);
      } catch {
        // The persistence mechanic already logs and toasts its exact error. Keep
        // the durable asset + same client UUID available for another safe retry.
        setImageTranscriptRecovery({ ...recovery, status: 'failed' });
      } finally {
        releaseImageTranscriptMutation(mutationKeys);
        if (recovery.phase === 'prompt') {
          sendingConversationsRef.current.delete(recovery.conversationId);
        }
        releaseSendWindow?.();
      }
    },
    [
      claimSendWindow,
      executeNewImageGenerationTurn,
      getToken,
      releaseImageTranscriptMutation,
      removeImageTranscriptRecovery,
      setImageTranscriptRecovery,
      tryAcquireImageTranscriptMutation,
      updateMessage,
    ],
  );

  const watchedVideoTasksRef = useRef<Set<string>>(new Set());
  const autoResumedVideoTasksRef = useRef<Set<string>>(new Set());

  /** Watch one durable task without ever repeating its provider-start POST. */
  const watchVideoMessage = useCallback(
    async (input: {
      conversationId: string;
      messageId: string;
      taskId: string;
      localJobId?: string;
    }) => {
      if (watchedVideoTasksRef.current.has(input.taskId)) return;
      watchedVideoTasksRef.current.add(input.taskId);

      const previous = readMessageMetadata(input.conversationId, input.messageId);
      updateMessage(
        input.messageId,
        {
          isStreaming: true,
          content: '',
          metadata: {
            ...(previous ?? {}),
            toolType: 'video-generation',
            videoTaskId: input.taskId,
            videoStatus:
              previous?.videoStatus === 'processing' ? 'processing' : ('queued' as const),
            videoError: undefined,
          },
        },
        input.conversationId,
      );

      try {
        const result = await watchVideoGeneration(input.taskId, {
          ...(input.localJobId ? { localJobId: input.localJobId } : {}),
        });
        const current = readMessageMetadata(input.conversationId, input.messageId);
        if (result.status === 'completed') {
          updateMessage(
            input.messageId,
            {
              content: '',
              isStreaming: false,
              metadata: {
                ...(current ?? {}),
                toolType: 'video-generation',
                videoTaskId: input.taskId,
                videoStatus: 'completed',
                videoUrl: result.videoUrl,
                ...(result.thumbnailUrl ? { thumbnailUrl: result.thumbnailUrl } : {}),
                videoError: undefined,
              },
            },
            input.conversationId,
          );
          return;
        }
        if (result.status === 'failed') {
          updateMessage(
            input.messageId,
            {
              content: `Video generation failed: ${result.error}`,
              isStreaming: false,
              metadata: {
                ...(current ?? {}),
                toolType: 'video-generation',
                videoTaskId: input.taskId,
                videoStatus: 'failed',
                videoError: result.error,
                videoRetryable: true,
              },
            },
            input.conversationId,
          );
          return;
        }

        // Five minutes is only the browser observation deadline. The paid job
        // remains active under Workflow ownership and this same bubble exposes
        // a resume control; no failure row or second POST is created.
        updateMessage(
          input.messageId,
          {
            content: '',
            isStreaming: false,
            metadata: {
              ...(current ?? {}),
              toolType: 'video-generation',
              videoTaskId: input.taskId,
              videoStatus: result.taskStatus,
              ...(result.progress === undefined ? {} : { videoProgress: result.progress }),
              videoError: undefined,
            },
          },
          input.conversationId,
        );
      } catch (error) {
        // A status-network failure says nothing about the provider outcome.
        // Keep the task resumable and let Workflow continue unattended.
        const current = readMessageMetadata(input.conversationId, input.messageId);
        updateMessage(
          input.messageId,
          {
            content: '',
            isStreaming: false,
            metadata: {
              ...(current ?? {}),
              toolType: 'video-generation',
              videoTaskId: input.taskId,
              videoStatus:
                current?.videoStatus === 'processing' ? 'processing' : ('queued' as const),
              videoError:
                error instanceof Error
                  ? error.message
                  : 'Could not check video status. The task is still resumable.',
              videoRetryable: false,
            },
          },
          input.conversationId,
        );
      } finally {
        watchedVideoTasksRef.current.delete(input.taskId);
      }
    },
    [readMessageMetadata, updateMessage, watchVideoGeneration],
  );

  // ---------------------------------------------------------------------------
  // handleGenerateVideo – durable ChatGPT-style start/watch split.
  // ---------------------------------------------------------------------------
  const handleGenerateVideo = useCallback(
    (
      prompt: string,
      videoOptions?: {
        modelId?: string;
        aspectRatio?: string;
        resolution?: string;
        durationSecs?: number;
      },
    ) => {
      const videoGuardKey = displayedConversationId || NEW_CHAT_SEND_GUARD_KEY;
      if (sendingConversationsRef.current.has(videoGuardKey)) return;
      sendingConversationsRef.current.add(videoGuardKey);
      const releaseSendWindow = claimSendWindow();
      void (async () => {
        try {
          let convId = displayedConversationId;
          if (!convId) {
            const fresh = await createConversation(
              VIDEO_GENERATION_TITLE,
              activeModelId,
              activeProjectId,
            );
            if (fresh) {
              convId = fresh.id;
              if (!urlConversationId) setBareChatSessionId(fresh.id);
              router.replace(`/chat/${fresh.id}`);
            }
          }
          if (!convId) return;

          const isTemporaryConversation = isTemporaryConversationById(
            useChatStore.getState().conversations,
            convId,
          );
          const getAuthToken = async () => {
            const token = await getToken();
            if (!token) throw new Error('Not authenticated');
            return token;
          };
          const updateOwnMessage = (id: string, updates: Partial<Message>) =>
            updateMessage(id, updates, convId);

          const userMessageId = crypto.randomUUID();
          addMessage(
            {
              id: userMessageId,
              role: 'user',
              content: prompt,
              createdAt: new Date().toISOString(),
            },
            convId,
          );
          let assistantMessageId = crypto.randomUUID();
          const placeholderMetadata: MessageMetadata = {
            toolType: 'video-generation',
            videoStatus: 'queued',
            // Sizes VideoGenerationPlaceholder to the requested shape before the
            // provider returns anything, so the transcript doesn't jump later.
            ...(videoOptions?.aspectRatio ? { videoAspect: videoOptions.aspectRatio } : {}),
          };
          addMessage(
            {
              id: assistantMessageId,
              role: 'assistant',
              content: '',
              isStreaming: true,
              createdAt: new Date().toISOString(),
              // No videoUrl: the shimmer branch is keyed off its absence.
              metadata: placeholderMetadata,
            },
            convId,
          );

          try {
            const startResult = await startVideoAfterTranscriptCommit({
              temporary: isTemporaryConversation,
              persistPrompt: async () => {
                requireImageMessagePersistence(
                  await persistImageGenerationUserMessage({
                    conversationId: convId,
                    messageId: userMessageId,
                    content: prompt,
                    getAuthToken,
                    updateMessage: updateOwnMessage,
                  }),
                );
              },
              persistPlaceholder: async () => {
                const persisted = requireImageMessagePersistence(
                  await persistImageGenerationAssistantMessage({
                    conversationId: convId,
                    messageId: assistantMessageId,
                    model: undefined,
                    metadata: placeholderMetadata,
                    getAuthToken,
                    updateMessage: updateOwnMessage,
                  }),
                );
                assistantMessageId = persisted.messageId;
              },
              start: () =>
                startVideoGeneration(prompt, {
                  ...(videoOptions?.modelId ? { modelId: videoOptions.modelId } : {}),
                  // Composer's aspect/quality pills. Omitted when absent so the
                  // route keeps applying its own defaults for other callers.
                  ...(videoOptions?.aspectRatio
                    ? {
                        aspectRatio: videoOptions.aspectRatio as NonNullable<
                          GenerateVideoOptions['aspectRatio']
                        >,
                      }
                    : {}),
                  ...(videoOptions?.resolution
                    ? {
                        resolution: videoOptions.resolution as NonNullable<
                          GenerateVideoOptions['resolution']
                        >,
                      }
                    : {}),
                  ...(videoOptions?.durationSecs !== undefined
                    ? { durationSecs: videoOptions.durationSecs }
                    : {}),
                  ...(!isTemporaryConversation
                    ? { conversationId: convId, assistantMessageId }
                    : {}),
                }),
            });
            if (!startResult.ok) {
              const message = `Video was not started because the ${startResult.phase} could not be saved. Try again to recover this turn.`;
              updateOwnMessage(assistantMessageId, {
                content: message,
                isStreaming: false,
                metadata: {
                  ...placeholderMetadata,
                  videoStatus: 'failed',
                  videoError: message,
                },
              });
              return;
            }

            const started = startResult.started;
            const startedMetadata: MessageMetadata = {
              toolType: 'video-generation',
              videoTaskId: started.taskId,
              videoStatus: started.status,
              videoProvider: started.provider,
              videoModel: started.model,
              // Carried forward from placeholderMetadata: the placeholder stays
              // sized correctly for the whole in-flight window, not just the
              // instant before the start request resolves.
              ...(videoOptions?.aspectRatio ? { videoAspect: videoOptions.aspectRatio } : {}),
            };
            updateOwnMessage(assistantMessageId, {
              content: '',
              model: started.model,
              provider: started.provider,
              isStreaming: true,
              metadata: startedMetadata,
            });
            autoResumedVideoTasksRef.current.add(started.taskId);
            await watchVideoMessage({
              conversationId: convId,
              messageId: assistantMessageId,
              taskId: started.taskId,
              localJobId: started.localJobId,
            });
          } catch (err) {
            // A tier refusal must land as an InlinePaywallCard, not a toast or
            // a raw error bubble: ChatMessageList swaps the whole row for the
            // card whenever `metadata.paywall` is present. `isPaywall` is the
            // hook's own classification of the route's 403
            // (`code: 'plan_upgrade_required'`), so this does not re-parse
            // error strings.
            const paywall =
              err instanceof MediaGenerationApiError
                ? resolveMediaPaywallSlot({
                    feature: 'video',
                    refusal: err,
                    currentTier: subscriptionTier,
                    usage: managedUsageSummary,
                  })
                : null;
            const publicError = toUserMessage(err, String(err));

            // A MediaGenerationApiError proves that an HTTP response arrived.
            // Persist that definite rejection only through the server CAS: if
            // job creation already bound videoTaskId, the current durable row
            // wins and is resumed instead of being overwritten. A fetch-level
            // transport error is ambiguous and never enters this mutation.
            if (!isTemporaryConversation && !paywall && err instanceof MediaGenerationApiError) {
              try {
                const projection = await persistDefiniteVideoStartFailure({
                  conversationId: convId,
                  messageId: assistantMessageId,
                  publicError,
                  authToken: await getAuthToken(),
                });
                updateOwnMessage(assistantMessageId, {
                  content: projection.content,
                  model: projection.model,
                  provider: projection.provider,
                  isStreaming: false,
                  metadata: projection.metadata,
                });
                const taskId = projection.metadata.videoTaskId;
                const status = projection.metadata.videoStatus;
                if (
                  !projection.applied &&
                  typeof taskId === 'string' &&
                  (status === 'queued' || status === 'processing')
                ) {
                  await watchVideoMessage({
                    conversationId: convId,
                    messageId: assistantMessageId,
                    taskId,
                  });
                }
                return;
              } catch (projectionError) {
                console.warn(
                  '[video] Definite start failure could not be projected; reload recovery remains available.',
                  projectionError,
                );
              }
            }

            const content = paywall
              ? ''
              : err instanceof MediaGenerationApiError
                ? `Video generation failed: ${publicError}`
                : `Video start response was interrupted: ${publicError}. Reload this chat to recover any accepted task before trying again.`;
            const failureMetadata: MessageMetadata = {
              toolType: 'video-generation',
              videoStatus: 'failed',
              videoError: content || undefined,
              ...(paywall ? { paywall } : {}),
            };
            updateOwnMessage(assistantMessageId, {
              isStreaming: false,
              content,
              metadata: failureMetadata,
            });
            // A recognized pre-job account refusal is safe to persist. Other
            // transport failures may have lost a response after the server
            // bound a durable task; never overwrite that server-owned task id.
            if (!isTemporaryConversation && paywall) {
              await persistImageGenerationAssistantMessage({
                conversationId: convId,
                messageId: assistantMessageId,
                model: undefined,
                metadata: failureMetadata,
                content,
                getAuthToken,
                updateMessage: updateOwnMessage,
              });
            }
          }
        } finally {
          sendingConversationsRef.current.delete(videoGuardKey);
          releaseSendWindow();
        }
      })();
    },
    [
      displayedConversationId,
      urlConversationId,
      createConversation,
      activeModelId,
      activeProjectId,
      addMessage,
      updateMessage,
      startVideoGeneration,
      watchVideoMessage,
      router,
      getToken,
      claimSendWindow,
      subscriptionTier,
      managedUsageSummary,
    ],
  );

  // A loaded queued/processing row resumes with status GET only. The set gives
  // each task one automatic observation window per mounted page; after the
  // five-minute deadline the explicit Resume button owns subsequent windows.
  useEffect(() => {
    if (!displayedConversationId) return;
    for (const message of displayedMessages) {
      const taskId = message.metadata?.videoTaskId;
      const status = message.metadata?.videoStatus;
      if (
        message.role !== 'assistant' ||
        typeof taskId !== 'string' ||
        (status !== 'queued' && status !== 'processing') ||
        autoResumedVideoTasksRef.current.has(taskId)
      ) {
        continue;
      }
      autoResumedVideoTasksRef.current.add(taskId);
      void watchVideoMessage({
        conversationId: displayedConversationId,
        messageId: message.id,
        taskId,
      });
    }
  }, [displayedConversationId, displayedMessages, watchVideoMessage]);

  const handleResumeVideo = useCallback(
    (messageId: string) => {
      if (!displayedConversationId) return;
      const message = displayedMessages.find((candidate) => candidate.id === messageId);
      const taskId = message?.metadata?.videoTaskId;
      const status = message?.metadata?.videoStatus;
      if (typeof taskId !== 'string' || (status !== 'queued' && status !== 'processing')) return;
      void watchVideoMessage({
        conversationId: displayedConversationId,
        messageId,
        taskId,
      });
    },
    [displayedConversationId, displayedMessages, watchVideoMessage],
  );

  const handleRetryVideo = useCallback(
    (messageId: string) => {
      if (!displayedConversationId || isStreaming) return;
      const assistantMessage = displayedMessages.find((candidate) => candidate.id === messageId);
      if (
        assistantMessage?.metadata?.videoStatus !== 'failed' ||
        assistantMessage.metadata.videoRetryable !== true
      ) {
        return;
      }
      const retryPlan = planRegenerateRollback(displayedMessages, messageId);
      const userMessage = retryPlan ? displayedMessages[retryPlan.userIndex] : undefined;
      if (!userMessage) return;
      if (isTrialExhausted) {
        handleOpenUpgradeDialog();
        return;
      }
      handleGenerateVideo(userMessage.content, {
        ...(typeof assistantMessage.metadata.videoModel === 'string'
          ? { modelId: assistantMessage.metadata.videoModel }
          : {}),
      });
    },
    [
      displayedConversationId,
      displayedMessages,
      handleGenerateVideo,
      handleOpenUpgradeDialog,
      isStreaming,
      isTrialExhausted,
    ],
  );

  /**
   * AUDIT-FIX STR-3: Stop targets the conversation this composer is rendered
   * for. `stopGeneration()` used to abort whatever request started most
   * recently -- possibly another conversation's -- while its store teardown
   * resolved against `activeConversationId`, so the two halves could disagree.
   */
  const handleStopGeneration = useCallback(() => {
    stopGeneration(displayedConversationId ?? undefined);
  }, [stopGeneration, displayedConversationId]);

  const handleSend = useCallback(
    (content: string, attachments?: File[], skillId?: string, meta?: SendMeta): false | void => {
      const resolvedMeta = skillId && !meta?.skillName ? { ...meta, skillName: skillId } : meta;

      // Natural-language image requests use the existing media harness even
      // when the user has not manually toggled Image mode. This interception
      // must happen before the chat-completions route because media models use
      // provider media endpoints, not text-chat adapters.
      if (!attachments?.length && classifyTaskLocally(content, []).type === 'image_generation') {
        const defaultImageModel = IMAGE_MODELS[0];
        if (defaultImageModel) {
          handleGenerateImage(content, {
            aspectRatio: 'auto',
            modelId: defaultImageModel.id,
          });
          return;
        }
      }

      // Local → BYOK trust boundary. `routeLocalToByokSend` owns the branch:
      // when the active on-device conversation is about to continue onto a
      // direct BYOK provider it opens the consent ceremony and `send` is never
      // reached. There is deliberately no feature flag here — a literal that
      // skips the ceremony would send on-device context to a third-party
      // provider with no context selection, secret scan, payload preview or
      // provider label, which the locked critical rule forbids.
      const decision = routeLocalToByokSend({
        sourceConversationId: displayedConversationId,
        conversation: displayedConversation,
        messages: displayedMessages,
        targetModelId: activeModelId,
        outgoingContent: content,
        startCeremony: (request) => {
          setPendingByokHandoff({
            sourceConversationId: request.sourceConversationId,
            conversationTitle: request.conversationTitle,
            content,
            attachments,
            meta: resolvedMeta,
            candidates: request.candidates,
          });
          setSelectedHandoffContextIds(request.candidates.map((candidate) => candidate.id));
          setHandoffPreview(null);
          setHandoffError(null);
        },
        send: () => {
          void sendContent(content, { attachments, meta: resolvedMeta });
        },
      });

      // `false` keeps the composer's draft intact while the ceremony is open —
      // the outgoing prompt is part of the context the user is reviewing, and
      // cancelling must not lose it.
      if (decision === 'ceremony') return false;
    },
    [
      displayedConversation,
      displayedConversationId,
      displayedMessages,
      activeModelId,
      handleGenerateImage,
      sendContent,
    ],
  );

  useEffect(() => {
    if (!pendingByokHandoff) return;
    let cancelled = false;

    setIsBuildingHandoff(true);
    setHandoffError(null);

    buildWebLocalToByokPreview({
      sourceConversationId: pendingByokHandoff.sourceConversationId,
      candidates: pendingByokHandoff.candidates,
      selectedContextIds: selectedHandoffContextIds,
    })
      .then((preview) => {
        if (!cancelled) setHandoffPreview(preview);
      })
      .catch((error) => {
        if (!cancelled) {
          setHandoffPreview(null);
          setHandoffError(toUserMessage(error, 'Could not build BYOK preview'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsBuildingHandoff(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pendingByokHandoff, selectedHandoffContextIds]);

  const closeHandoffDialog = useCallback(() => {
    if (isConfirmingHandoff) return;
    setPendingByokHandoff(null);
    setSelectedHandoffContextIds([]);
    setHandoffPreview(null);
    setHandoffError(null);
  }, [isConfirmingHandoff]);

  const handleToggleHandoffContext = useCallback(
    (contextId: string) => {
      const candidate = pendingByokHandoff?.candidates.find((item) => item.id === contextId);
      if (!candidate || candidate.required) return;

      setSelectedHandoffContextIds((current) =>
        current.includes(contextId)
          ? current.filter((id) => id !== contextId)
          : [...current, contextId],
      );
    },
    [pendingByokHandoff],
  );

  const handleConfirmHandoff = useCallback(async () => {
    if (!pendingByokHandoff || !handoffPreview || handoffPreview.redactionReport.blocked) return;

    setIsConfirmingHandoff(true);
    setHandoffError(null);
    // Same first-message send guard: the BYOK fork lazily creates a conversation
    // and only commits bareChatSessionId after an async saveSystemMessage, so the
    // stale-active reconciler must not clear the fork during that window.
    //
    // AUDIT-FIX STR-26: balanced, idempotent release. The previous bare
    // `isSendingRef.current = false` in the finally below released a window it
    // did not necessarily own -- the dispatched sendContent had already claimed
    // its own, and clearing the shared boolean re-opened the reconciler race.
    const releaseSendWindow = claimSendWindow();

    try {
      const fork = await createConversation(
        `${pendingByokHandoff.conversationTitle} (BYOK fork)`,
        activeModelId,
      );
      if (!fork) throw new Error('Could not create BYOK fork conversation.');

      // A temporary source chat means the user explicitly asked for this
      // transcript not to be kept. `createConversation` always creates a
      // persisted row, and `saveSystemMessage` writes the redacted payload to
      // the server unconditionally, so the fork must inherit the flag BEFORE
      // anything is written. If that write fails we refuse the fork with a
      // visible reason rather than silently persisting an on-device transcript
      // the user asked us not to keep.
      const sourceIsTemporary = isTemporaryConversationById(
        conversations,
        pendingByokHandoff.sourceConversationId,
      );
      if (sourceIsTemporary) {
        const marked = await updateConversation(fork.id, { isTemporary: true });
        if (!marked) {
          await deleteConversation(fork.id);
          throw new Error(
            'This is a temporary chat, and the BYOK fork could not be marked temporary. Nothing was sent.',
          );
        }
      }

      const metadata: MessageMetadata = {
        privacyMode: 'byok',
        providerMode: 'DirectByok',
        handoffDraftId: handoffPreview.draft.id,
        handoffPreviewHashSha256: handoffPreview.draft.previewHashSha256,
        handoffSourceConversationId: pendingByokHandoff.sourceConversationId,
      };
      const handoffSystemContent = buildAcceptedHandoffSystemMessage(handoffPreview);
      // Temporary forks keep the consent record client-side only: the provider
      // history sent to the model is built from the store (useChatStream's
      // `readConversationMessages`), so the ceremony's redacted payload still
      // reaches the BYOK provider without a server row the user opted out of.
      const systemMessage: Message = sourceIsTemporary
        ? {
            id: crypto.randomUUID(),
            role: 'system',
            content: handoffSystemContent,
            createdAt: new Date().toISOString(),
            metadata,
          }
        : await saveSystemMessage({
            conversationId: fork.id,
            content: handoffSystemContent,
            metadata,
            authToken: await getToken().then((token) => {
              if (!token) throw new Error('Not authenticated');
              return token;
            }),
          });

      // AUDIT-FIX ROOT-CAUSE: the handoff system message belongs to the FORK.
      // `saveSystemMessage` above is awaited, so "whatever is active now" is not
      // a safe target.
      addMessage(systemMessage, fork.id);
      setBareChatSessionId(fork.id);
      router.push('/chat');
      setComposerClearSignal((value) => value + 1);
      setPendingByokHandoff(null);
      setSelectedHandoffContextIds([]);
      setHandoffPreview(null);
      void sendContent(pendingByokHandoff.content, {
        conversationId: fork.id,
        attachments: pendingByokHandoff.attachments,
        meta: pendingByokHandoff.meta,
      });
    } catch (error) {
      setHandoffError(toUserMessage(error, 'Could not create BYOK fork conversation.'));
    } finally {
      setIsConfirmingHandoff(false);
      // The dispatched sendContent (conversationId already set) claimed its own
      // window synchronously above; the fork's create→navigate window is now
      // closed, so releasing ONLY this owner's claim is safe.
      releaseSendWindow();
    }
  }, [
    addMessage,
    conversations,
    createConversation,
    deleteConversation,
    getToken,
    handoffPreview,
    pendingByokHandoff,
    router,
    activeModelId,
    sendContent,
    claimSendWindow,
    updateConversation,
  ]);

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    setBareChatSessionId(null);
    setComposerPrefill(undefined);
    setComposerClearSignal((value) => value + 1);
    // A new chat has no artifacts, so leaving the panel open just showed an
    // empty "No artifacts yet" rail next to a fresh composer. Closed
    // imperatively rather than via useArtifactsStore: that hook subscribes to
    // the whole store, and this page would then re-render on every artifact
    // change for the sake of one setter.
    _sharedArtifactStore.getState().setPanelOpen(false);
    // Global "New chat" starts unscoped. Project-scoped new chats go through
    // the sidebar project row (/chat?projectId=...) or the composer picker.
    setActiveProject(null);
    router.push('/chat');
  }, [router, setActiveConversation, setActiveProject]);

  const handleToggleSidebar = useCallback(
    () => setSidebarCollapsed(!sidebarCollapsed),
    [setSidebarCollapsed, sidebarCollapsed],
  );

  const handleOpenSearch = useCallback(() => {
    // Dialogs are now at page level; dispatch kept for backward compat with
    // any other component that fires the event (e.g. collapsed rail search btn).
    setSearchDialogOpen(true);
  }, []);

  const handleOpenShortcuts = useCallback(() => {
    setKeyboardShortcutsOpen(true);
  }, []);

  const handleFocusComposer = useCallback(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-composer-textarea]');
    textarea?.focus();
  }, []);

  const handleSelectSession = useCallback(
    (id: string) => {
      // Navigate to the canonical /chat/[id] URL so the conversation is
      // bookmarkable and survives a page refresh. The routeInitializedRef
      // effect will load the conversation from the URL param when the new
      // route renders (avoiding a double-load when already active).
      router.push(`/chat/${id}`);
    },
    [router],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      // Confirm before deleting so a stray click in the ... menu can never
      // silently drop a conversation — matching the sibling project-delete
      // guard (handleProjectDelete) and the mobile confirm. The shared-Sidebar
      // migration dropped this confirmation that the prior ConversationListItem
      // had; restore it for parity.
      const conversation = conversations.find((c) => c.id === id);
      const confirmed = await confirmDestructive(conversationDeleteConfirm(conversation?.title));
      if (!confirmed) return;
      const deleted = await deleteConversation(id);
      if (!deleted) return;
      if (id === displayedConversationId) {
        setBareChatSessionId(null);
        setActiveConversation(null);
        router.push('/chat');
      }
    },
    [
      confirmDestructive,
      conversations,
      deleteConversation,
      displayedConversationId,
      router,
      setActiveConversation,
    ],
  );

  const handleRenameSession = useCallback(
    (id: string, title: string) => {
      void updateConversation(id, { title });
    },
    [updateConversation],
  );

  const handleMoveToProjectSession = useCallback(
    (sessionId: string, projectId: string) => {
      void updateConversation(sessionId, { projectId });
    },
    [updateConversation],
  );

  // ---------------------------------------------------------------------------
  // Project sidebar row handlers
  // ---------------------------------------------------------------------------

  /** Navigate to the project page (shows project conversations + settings). */
  const handleProjectOpen = useCallback(
    (projectId: string) => {
      router.push(`/chat/projects/${projectId}`);
    },
    [router],
  );

  /**
   * Start a new chat scoped to the project. We navigate to /chat (new session)
   * with the projectId in the query so the composer can pick it up. Threading the
   * projectId straight into createConversation is a follow-up once the API takes it.
   */
  const handleProjectNewChat = useCallback(
    (projectId: string) => {
      router.push(`/chat?projectId=${projectId}`);
    },
    [router],
  );

  /**
   * Rename: opens the project settings dialog with that project selected,
   * which contains the rename input field.
   */
  const handleProjectRename = useCallback((projectId: string) => {
    setProjectSettingsId(projectId);
  }, []);

  /**
   * Project settings: open the settings dialog.
   */
  const handleProjectSettings = useCallback((projectId: string) => {
    setProjectSettingsId(projectId);
  }, []);

  /**
   * Pin/unpin: toggle the starred field on the project (starred is the pinned proxy).
   */
  const handleProjectPin = useCallback(
    (projectId: string) => {
      const project = storeProjects.find((p) => p.id === projectId);
      if (!project) return;
      const next = !project.starred;
      updateProjectInStore(projectId, { starred: next }); // optimistic
      void webManagedCloudProjects.updateProject(projectId, { starred: next }).catch((error) => {
        updateProjectInStore(projectId, { starred: project.starred ?? false }); // rollback
        toast.error(toUserMessage(error, 'Failed to update pin'));
      });
    },
    [storeProjects, updateProjectInStore],
  );

  /**
   * Create project: open the inline CreateProjectDialog instead of navigating
   * to /projects. The modal posts to the API, merges into the project store,
   * then pushes the user directly to the new project page.
   */
  const handleProjectCreate = useCallback(() => {
    setCreateProjectFromComposer(false);
    setCreateProjectOpen(true);
  }, []);

  /**
   * Create project from the composer "Project or folder" picker: same dialog,
   * but on success the new project becomes the active chat scope instead of
   * navigating away to the project page (the user is mid-composition).
   */
  const handleComposerCreateProject = useCallback(() => {
    setCreateProjectFromComposer(true);
    setCreateProjectOpen(true);
  }, []);

  /**
   * Delete project from the store AND the server after an explicit
   * confirmation so a stray click in the ... menu can never silently drop a
   * project. Previously this only mutated the local Zustand store — the
   * project (a server-side user_projects row) was never actually deleted,
   * so it reappeared on the next reload once the mount-time server hydrate
   * effect re-merged it back in. DELETE /api/projects/[id] already exists
   * and soft-deletes the row; wire it here instead of only touching the
   * client cache.
   */
  const handleProjectDelete = useCallback(
    async (projectId: string) => {
      const project = storeProjects.find((p) => p.id === projectId);
      // Same dialog the project-detail Settings pane already used for this exact
      // action — the sidebar three-dot menu was the one route that still fell
      // back to a native browser confirm.
      const confirmed = await confirmDestructive(projectDeleteConfirm(project?.name));
      if (!confirmed) return;
      // Optimistic remove, with rollback on server failure so the sidebar
      // never lies about what actually got deleted.
      removeProjectFromStore(projectId);
      try {
        await webManagedCloudProjects.deleteProject(projectId);
      } catch (err) {
        if (project) {
          setStoreProjects([...useProjectStore.getState().projects, project]);
        }
        toast.error(toUserMessage(err, 'Failed to delete project'));
      }
    },
    [confirmDestructive, storeProjects, removeProjectFromStore, setStoreProjects],
  );

  // Project settings dialog derived data
  const projectForSettings = useMemo(
    () => (projectSettingsId ? storeProjects.find((p) => p.id === projectSettingsId) : null),
    [projectSettingsId, storeProjects],
  );

  // Composer "Project or folder" picker (new-chat composer only). Web offers
  // projects; the composer itself adds the local-folder action only on surfaces
  // with the working-directory capability (desktop), so this stays honest here.
  /**
   * AUDIT-FIX CMP-3: persist the "Temporary chat" privacy flag.
   *
   * `updateConversation` here is the network-backed hook action (PUT
   * /api/chat/conversations/:id), not the store's local map write the composer
   * used to call. It returns false when the write fails so the composer can say
   * so instead of showing a privacy mode the database does not have.
   */
  const handleSetTemporaryChat = useCallback(
    async (isTemporary: boolean): Promise<boolean> => {
      if (!displayedConversationId) return false;
      return updateConversation(displayedConversationId, { isTemporary });
    },
    [displayedConversationId, updateConversation],
  );

  const composerProjectPicker = useMemo(
    () => ({
      projects: storeProjects.map((p) => ({ id: p.id, name: p.name })),
      activeProjectId,
      onSelectProject: setActiveProject,
      onCreateProject: handleComposerCreateProject,
    }),
    [storeProjects, activeProjectId, setActiveProject, handleComposerCreateProject],
  );

  // Auto-title: when the second message arrives (first assistant reply), replace one
  // of the app's own placeholder titles ('New Chat' / 'Image generation' / 'Video
  // generation' — never a title a human typed) with a real one.
  //
  // WEB-85: this used to compute its own 60-char truncation of the first user message
  // and PUT it. That write raced the server's two-stage titler (the messages route
  // commits a truncation synchronously and an LLM-written title in the background) and
  // re-truncated the generated title, which forced the server to whitelist this
  // effect's exact output as safe-to-replace just to win its own race. The server is
  // the only titler now: this effect READS the authoritative title and adopts it into
  // the local store, so nothing here can clobber the generated one.
  //
  // The local truncation survives only as the fallback for conversations the server
  // never titles — a temporary chat, whose messages are deliberately never persisted.
  //
  // Intentionally only re-runs on messages.length, not the full messages array, to
  // avoid re-running on every streaming chunk.
  useEffect(() => {
    if (!displayedConversationId || displayedMessages.length !== 2) return;
    const conversationId = displayedConversationId;
    if (autoTitledConversationsRef.current.has(conversationId)) return;
    const convo = conversations.find((c) => c.id === conversationId);
    if (!convo || !AUTO_TITLE_PLACEHOLDERS.has(convo.title)) return;
    const firstUser = displayedMessages[0];
    if (!firstUser || firstUser.role !== 'user') return;
    const placeholderTitle = convo.title;
    const isTemporary = Boolean(convo.isTemporary);
    autoTitledConversationsRef.current.add(conversationId);

    void (async () => {
      let adopted: string | null = null;
      if (!isTemporary) {
        for (const delayMs of SERVER_TITLE_READ_DELAYS_MS) {
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
          let serverTitle: string | null = null;
          try {
            const token = await getToken();
            if (!token) break;
            serverTitle = await fetchServerConversationTitle(conversationId, token);
          } catch {
            serverTitle = null;
          }
          if (!serverTitle || AUTO_TITLE_PLACEHOLDERS.has(serverTitle)) continue;
          if (serverTitle === adopted) continue;
          useChatStore.getState().updateConversation(conversationId, { title: serverTitle });
          // The first non-placeholder read is the stage-1 truncation; the next distinct
          // one is the generated title, and nothing follows it.
          if (adopted) return;
          adopted = serverTitle;
        }
        if (adopted) return;
      }
      const fallback = clientFallbackTitle(firstUser.content);
      if (!fallback || fallback === placeholderTitle) return;
      void updateConversation(conversationId, { title: fallback });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    displayedMessages.length,
    displayedConversationId,
    conversations,
    updateConversation,
    getToken,
  ]);

  // Scroll to and flash-highlight a message when navigated from global search results.
  // GlobalSearchDialog navigates to /chat/[sessionId]?highlightMessage=<msgId>.
  // We wait for messages to load before scrolling, then clear the param from the URL.
  useEffect(() => {
    if (!highlightMessageId || displayedMessages.length === 0) return;
    // Search indexes every persisted row, so a hit can land on a variant the
    // reader is not looking at and have no element to scroll to. Moving the
    // path onto it changes the leaf, which re-runs this effect with the message
    // mounted; for a message that is already visible this does nothing at all.
    revealMessage(highlightMessageId, displayedConversationId ?? undefined);
    const el = findHighlightableMessageElement(highlightMessageId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'outline 0s, outline-color 0.3s';
    el.style.outline = '2px solid var(--chat-accent-primary)';
    el.style.borderRadius = '8px';
    const clear = setTimeout(() => {
      el.style.outline = '2px solid transparent';
      const removeParams = setTimeout(() => {
        el.style.outline = '';
        el.style.transition = '';
        el.style.borderRadius = '';
        // Remove the query param without adding a history entry.
        const url = new URL(window.location.href);
        url.searchParams.delete('highlightMessage');
        router.replace(url.pathname + url.search);
      }, 400);
      return () => clearTimeout(removeParams);
    }, 1800);
    return () => clearTimeout(clear);
  }, [
    highlightMessageId,
    displayedMessages.length,
    activeLeafId,
    displayedConversationId,
    revealMessage,
    router,
  ]);

  const deletePersistedMessages = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!displayedConversationId || ids.length === 0) return false;
      const conversationId = displayedConversationId;
      const mutationIds = [...new Set(ids)];
      if (!tryAcquireImageTranscriptMutation(mutationIds)) {
        toast.error('Wait for this image turn to finish saving before deleting it.');
        return false;
      }

      try {
        const temporary = isTemporaryConversationById(
          useChatStore.getState().conversations,
          conversationId,
        );
        if (temporary) {
          // Temporary turns deliberately have no web_messages rows. Calling
          // the durable DELETE route would return "Message not found" and
          // leave an undismissable local card, so remove them locally only.
          mutationIds.forEach((messageId) => deleteMessage(messageId, conversationId));
          removeImageTranscriptRecoveriesForMessages(mutationIds);
          return true;
        }

        const authToken = await getToken();
        if (!authToken) {
          setChatError('Not authenticated', conversationId);
          return false;
        }

        for (const messageId of mutationIds) {
          await deleteConversationMessage({
            conversationId,
            messageId,
            authToken,
          });
          // AUDIT-FIX ROOT-CAUSE: delete from the conversation the row belongs
          // to; the loop awaits a network call per message and the user can
          // switch chats in between.
          deleteMessage(messageId, conversationId);
        }
        removeImageTranscriptRecoveriesForMessages(mutationIds);
        return true;
      } catch (error) {
        setChatError(toUserMessage(error, 'Failed to delete message'), conversationId);
        return false;
      } finally {
        releaseImageTranscriptMutation(mutationIds);
      }
    },
    [
      deleteMessage,
      displayedConversationId,
      getToken,
      releaseImageTranscriptMutation,
      removeImageTranscriptRecoveriesForMessages,
      setChatError,
      tryAcquireImageTranscriptMutation,
    ],
  );

  // Server-only delete (best-effort). Used by the data-loss-safe replace flow to drop
  // the OLD turn's durable rows AFTER the replacement turn has committed. A stale or
  // duplicate server row is strictly better than losing the exchange, so failures here
  // are swallowed — the local transcript is already correct.
  const deleteServerMessages = useCallback(
    async (conversationId: string, ids: string[]): Promise<void> => {
      if (ids.length === 0) return;
      const authToken = await getToken();
      if (!authToken) return;
      for (const messageId of ids) {
        try {
          await deleteConversationMessage({ conversationId, messageId, authToken });
        } catch {
          // best-effort — see above.
        }
      }
    },
    [getToken],
  );

  // Data-loss-safe replace, shared by edit-resubmit and regenerate (DATA-LOSS FIX).
  // Both used to delete the rolled-back turn (server + local) BEFORE the replacement
  // send committed, so a send that bailed pre-commit (expired token, no conversation)
  // lost the exchange permanently. Instead: snapshot the transcript, remove the old
  // turn from the LOCAL store immediately (clean UI, no duplicate flash while the
  // replacement streams), run the send, and only once it reports commit delete the old
  // turn's durable SERVER rows. If the send never commits, restore the exact snapshot —
  // the server rows were never touched, so nothing is lost. Worst case degrades from
  // data-loss to at-most-a-duplicate-row-on-reload (reconciled by the server delete).
  const sendReplacingMessages = useCallback(
    async (
      rollbackIds: string[],
      send: (onTurnCommitted: () => void) => Promise<boolean>,
    ): Promise<void> => {
      const conversationId = displayedConversationId;
      if (!conversationId || rollbackIds.length === 0) {
        await send(() => {});
        return;
      }
      const mutationIds = [...new Set(rollbackIds)];
      if (!tryAcquireImageTranscriptMutation(mutationIds)) {
        toast.error('Wait for this image turn to finish saving before replacing it.');
        return;
      }
      // AUDIT-FIX STR-22: fire the durable delete at COMMIT, not at stream end.
      // Deferring it until `send()` resolved meant the whole regeneration window
      // had both the old rows and the new user row on the server, so a reload
      // mid-regeneration showed a duplicated user message and the stale answer.
      // Idempotent, because runReplacingSend also calls deleteServer on commit.
      let serverRowsDeleted = false;
      let serverDeletePromise: Promise<void> | undefined;
      const deleteReplacedServerRows = () => {
        if (serverRowsDeleted) return;
        serverRowsDeleted = true;
        serverDeletePromise = deleteServerMessages(conversationId, mutationIds);
      };
      try {
        await runReplacingSend(
          {
            // AUDIT-FIX STR-22: snapshot/restore THIS conversation's transcript.
            // Snapshotting the global array meant a restore-on-failure could write
            // one conversation's messages over another's.
            snapshot: () => selectConversationMessages(conversationId)(useChatStore.getState()),
            removeLocal: (id) => deleteMessage(id, conversationId),
            restore: (messages) => useChatStore.getState().setMessages(messages, conversationId),
            deleteServer: () => deleteReplacedServerRows(),
          },
          mutationIds,
          () => send(deleteReplacedServerRows),
        );
        await serverDeletePromise;
        if (serverRowsDeleted) removeImageTranscriptRecoveriesForMessages(mutationIds);
      } finally {
        releaseImageTranscriptMutation(mutationIds);
      }
    },
    [
      displayedConversationId,
      deleteMessage,
      deleteServerMessages,
      releaseImageTranscriptMutation,
      removeImageTranscriptRecoveriesForMessages,
      tryAcquireImageTranscriptMutation,
    ],
  );
  sendReplacingMessagesRef.current = sendReplacingMessages;

  const handleDeleteMessage = useCallback(
    (id: string) => {
      void deletePersistedMessages([id]);
    },
    [deletePersistedMessages],
  );

  // Media paywall rows are durable so recovery survives reload/cross-device.
  // Dismissal must delete the server row too, or the card would reappear on
  // the next hydration.
  const handlePaywallDismiss = useCallback(
    (id: string) => {
      const conversationId = displayedConversationId;
      const message = conversationId
        ? selectConversationMessages(conversationId)(useChatStore.getState()).find(
            (candidate) => candidate.id === id,
          )
        : undefined;
      const isPersistedMediaRefusal =
        message?.metadata?.toolType === 'image-generation' ||
        message?.metadata?.toolType === 'video-generation';
      if (isPersistedMediaRefusal) {
        void deletePersistedMessages([id]);
        return;
      }
      // Legacy chat-stream quota cards are synthetic and have no server row.
      deleteMessage(id, conversationId ?? undefined);
    },
    [deleteMessage, deletePersistedMessages, displayedConversationId],
  );

  const handleTypingChange = useCallback((typing: boolean) => {
    setIsUserTyping(typing);
  }, []);

  const handlePinSession = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      if (!convo) return;
      void updateConversation(id, { pinned: !convo.isPinned });
    },
    [conversations, updateConversation],
  );

  const handleStarSession = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      if (!convo) return;
      void updateConversation(id, { starred: !convo.isStarred });
    },
    [conversations, updateConversation],
  );

  const handleArchiveSession = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      if (!convo) return;
      void updateConversation(id, { archived: !convo.isArchived });
    },
    [conversations, updateConversation],
  );

  // Share from the sidebar dropdown. If the target is not the active
  // conversation, navigate to it first; the user can then share via the
  // header share button or re-open the dropdown.
  const handleShareSession = useCallback(
    (id: string) => {
      if (id === displayedConversationId) {
        setShareDialogOpen(true);
      } else {
        router.push(`/chat/${id}`);
      }
    },
    [displayedConversationId, router],
  );

  /**
   * Every guard an edit of `id` has to clear, resolved against the CURRENT
   * transcript. Returns the message plus its rollback plan, or null having
   * already told the user why (toast / upgrade dialog).
   *
   * Shared by the three entry points below so opening the editor and saving from
   * it can never disagree about whether the edit is allowed — the transcript can
   * change while the editor is open.
   */
  const planMessageEdit = useCallback(
    (id: string): { message: Message; plan: PendingEditRollback } | null => {
      if (!displayedConversationId || isStreaming) return null;
      if (isImageTranscriptMutationInFlight(id)) {
        toast.error('Wait for this image turn to finish saving before editing it.');
        return null;
      }
      const idx = displayedMessages.findIndex((m) => m.id === id);
      const msg = idx >= 0 ? displayedMessages[idx] : undefined;
      if (!msg || msg.role !== 'user') return null;
      if (isTrialExhausted) {
        handleOpenUpgradeDialog();
        return null;
      }
      const plan = planEditRollback(displayedMessages, id, displayedConversationId);
      if (!plan) return null;
      return { message: msg, plan };
    },
    [
      displayedConversationId,
      displayedMessages,
      isImageTranscriptMutationInFlight,
      isStreaming,
      isTrialExhausted,
      handleOpenUpgradeDialog,
    ],
  );

  /**
   * Fallback Edit action, and the flag ChatMessageList reads to decide whether
   * the Edit item renders at all. With the inline-edit provider mounted (it is,
   * below) MessageBubble routes the click through `beginEdit` instead and this
   * never fires; a surface WITHOUT the provider still gets the original
   * composer-prefill behaviour rather than a dead menu item.
   *
   * DATA-LOSS FIX: stash the rollback, delete nothing. The original transcript
   * stays intact while the user edits; sendContent performs the deletion only
   * when (and if) they resubmit.
   */
  const handleEditMessage = useCallback(
    (id: string) => {
      const planned = planMessageEdit(id);
      if (!planned) return;
      pendingEditRollbackRef.current = planned.plan;
      setComposerPrefill(planned.message.content);
    },
    [planMessageEdit],
  );

  /**
   * The destructive half of an inline edit, run only after the reader has
   * agreed to lose the messages below the one being replaced.
   */
  const runSubmitEdit = useCallback(
    (
      id: string,
      next: string,
      planned: NonNullable<ReturnType<typeof planMessageEdit>>,
      conversationId: string,
    ) => {
      // Same trust boundary as handleSend / handleRegenerateMessage: an edited
      // resend replays the whole on-device transcript under `activeModelId`,
      // so it must refuse rather than silently cross Local → BYOK.
      const boundaryRefusal = resolveRegenerateBoundaryRefusal({
        conversation: displayedConversation,
        messages: displayedMessages,
        targetModelId: activeModelId,
      });
      if (boundaryRefusal) {
        setChatError(boundaryRefusal, conversationId);
        return;
      }
      // Replay the options the ORIGINAL turn recorded (search / thinking /
      // code / work mode / style), exactly as Regenerate does — the composer's
      // current toggles are not what this message was sent with.
      const editedIndex = displayedMessages.findIndex((m) => m.id === id);
      const followingAssistant =
        editedIndex >= 0
          ? displayedMessages.slice(editedIndex + 1).find((m) => m.role === 'assistant')
          : undefined;
      const replayDecision = getRegenerateReplayDecision({
        userMetadata: planned.message.metadata,
        assistantMetadata: followingAssistant?.metadata,
      });
      if (!replayDecision.ok) {
        setChatError(replayDecision.message, conversationId);
        return;
      }
      const replayOptions = replayToSendOptions(replayDecision.replay);

      // The revision becomes a sibling of the message it revises, and the
      // original keeps the exchange it produced — reachable through the pager on
      // either message. Local parents have to be stamped BEFORE the edited row's
      // own parent is read: on a conversation that has never branched there is
      // no parent to read yet, and the value decides whether this write branches
      // or continues.
      if (variantsEnabled) {
        useChatStore.getState().ensureLocalThreadParents(conversationId);
        const editedRow = selectConversationAllRows(conversationId)(useChatStore.getState()).find(
          (row) => row.id === id,
        );
        // A row that vanished between opening the editor and saving has no
        // lineage to copy, and null here would silently mean "root sibling".
        if (!editedRow) return;
        const editedParentId = editedRow.parentId ?? null;
        setVariantAnchorMessageId(null);
        void sendMessage(next, {
          model: activeModelId,
          conversationId,
          attachments: planned.message.attachments,
          ...replayOptions,
          userMessageParentId: editedParentId,
        });
        return;
      }

      void sendReplacingMessages(planned.plan.rollbackIds, (onTurnCommitted) =>
        sendMessage(next, {
          model: activeModelId,
          conversationId,
          attachments: planned.message.attachments,
          ...replayOptions,
          onTurnCommitted,
        }),
      );
    },

    [
      activeModelId,
      displayedConversation,
      displayedMessages,
      sendReplacingMessages,
      sendMessage,
      setChatError,
      variantsEnabled,
    ],
  );

  /**
   * CLR-05: inline edit, wired to the bubble instead of the composer.
   *
   * `beginEdit` runs the guards and answers whether the editor may open.
   * `submitEdit` resubmits the revised text as a SIBLING of the original, so
   * both versions and both replies stay reachable through the pager. With
   * variants off it falls back to the data-loss-safe replacement Regenerate used
   * (`sendReplacingMessages` deletes the replaced server rows only once the new
   * turn is durable). Both keep the same two refusals: a Local → BYOK boundary
   * crossing, and a turn whose recorded send options cannot be replayed.
   */
  const messageInlineEditHandlers = useMemo<MessageInlineEditController>(
    () => ({
      beginEdit: (id) => planMessageEdit(id) !== null,
      submitEdit: (id, content) => {
        const next = content.trim();
        if (!next) return;
        const planned = planMessageEdit(id);
        if (!planned) return;
        const conversationId = displayedConversationId;
        if (!conversationId) return;
        // Nothing is destroyed once an edit branches — the original message and
        // its reply stay behind the pager — so there is nothing to confirm. The
        // dialog below belongs to the replacing path, which still deletes.
        const discarded = variantsEnabled ? 0 : planned.plan.rollbackIds.length - 1;
        if (discarded > 0) {
          void (async () => {
            const proceed = await confirmDestructive({
              title: 'Replace this message?',
              description:
                discarded === 1
                  ? 'The reply below it is deleted and cannot be recovered.'
                  : `The ${discarded} messages below it are deleted and cannot be recovered.`,
              confirmText: 'Replace',
              variant: 'destructive',
            });
            if (proceed) runSubmitEdit(id, next, planned, conversationId);
          })();
          return;
        }
        runSubmitEdit(id, next, planned, conversationId);
      },
    }),
    // `runSubmitEdit` is the one that closes over the model, the transcript and
    // the two send paths, so naming those here as well only re-created this
    // controller for changes it does not read.
    [confirmDestructive, displayedConversationId, planMessageEdit, runSubmitEdit, variantsEnabled],
  );

  /**
   * Stable context identity. The handlers above close over `displayedMessages`,
   * so they get a new identity on every streaming chunk — publishing THAT
   * straight to the provider would re-render every MessageBubble in the
   * transcript per chunk and defeat the list's memoization (see BUG-27/BUG-28).
   * Same ref-bridge idiom as `sendReplacingMessagesRef` above.
   */
  const messageInlineEditHandlersRef = useRef(messageInlineEditHandlers);
  messageInlineEditHandlersRef.current = messageInlineEditHandlers;
  const messageInlineEdit = useMemo<MessageInlineEditController>(
    () => ({
      beginEdit: (id) => messageInlineEditHandlersRef.current.beginEdit(id),
      submitEdit: (id, content) => messageInlineEditHandlersRef.current.submitEdit(id, content),
    }),
    [],
  );

  // A failed turn leaves the user's message trailing with no reply. The error
  // banner offers to resend it, so recovering does not mean hunting for the
  // regenerate action on a message whose reply never arrived.
  const retryableTurnId = useMemo(
    () => retryableUserMessageId(displayedMessages, isStreaming),
    [displayedMessages, isStreaming],
  );

  const handleRegenerateMessage = useCallback(
    async (id: string) => {
      if (!displayedConversationId || isStreaming) return;
      const targetMsg = displayedMessages.find((m) => m.id === id);
      // A dropped turn leaves the user message trailing with no assistant reply
      // to regenerate. Retry resends that user turn: roll back from it inclusive
      // so the resend replaces it rather than duplicating it.
      const userRetryIndex =
        targetMsg?.role === 'user' ? displayedMessages.findIndex((m) => m.id === id) : -1;
      // Roll back from the user turn being regenerated (inclusive) so re-sending
      // the user content replaces it instead of creating a duplicate user
      // message. planRegenerateRollback resolves the preceding user message.
      const plan =
        userRetryIndex >= 0
          ? {
              userIndex: userRetryIndex,
              rollbackIds: displayedMessages.slice(userRetryIndex).map((m) => m.id),
            }
          : planRegenerateRollback(displayedMessages, id);
      if (!plan) return;
      const userMsg = displayedMessages[plan.userIndex];
      if (!userMsg) return;
      const assistantMsg = userRetryIndex >= 0 ? undefined : targetMsg;
      if (isTrialExhausted) {
        handleOpenUpgradeDialog();
        return;
      }
      const replayDecision = getRegenerateReplayDecision({
        userMetadata: userMsg.metadata,
        assistantMetadata: assistantMsg?.metadata,
      });
      if (!replayDecision.ok) {
        setChatError(replayDecision.message, displayedConversationId);
        return;
      }
      // Same trust boundary as `handleSend`, reached by a different control:
      // Regenerate resends the whole on-device transcript under
      // `activeModelId`, so a user who switched to a BYOK model and pressed
      // Regenerate would cross Local → BYOK with no ceremony. Fails closed with
      // a visible reason (see resolveRegenerateBoundaryRefusal for why this
      // path refuses instead of forking).
      const boundaryRefusal = resolveRegenerateBoundaryRefusal({
        conversation: displayedConversation,
        messages: displayedMessages,
        targetModelId: activeModelId,
      });
      if (boundaryRefusal) {
        setChatError(boundaryRefusal, displayedConversationId);
        return;
      }

      const replayOptions = replayToSendOptions(replayDecision.replay);

      // The answer that is already here stays: the new one becomes a sibling
      // under the same question, and the pager is how the reader gets back to
      // it. Nothing is deleted, so nothing needs confirming and there is no
      // rollback to plan. A failed stream restores the leaf instead (see
      // handleStreamError's variantRestore).
      if (variantsEnabled) {
        setVariantAnchorMessageId(null);
        await sendMessage(userMsg.content, {
          model: activeModelId,
          conversationId: displayedConversationId,
          attachments: userMsg.attachments,
          ...replayOptions,
          regenerateParentMessageId: userMsg.id,
        });
        return;
      }

      // Replace the regenerated turn data-loss-safely: the old rows are deleted only
      // AFTER the resend commits, and the transcript is restored if it bails pre-commit
      // (shared with the edit path — see sendReplacingMessages).
      // AUDIT-FIX STR-22: forward the early-commit hook so the regenerated
      // turn's old server rows are dropped the moment the replacement user turn
      // is durable, not at stream end (which left a reload mid-regeneration
      // showing a duplicated user message beside the stale answer).
      await sendReplacingMessages(plan.rollbackIds, (onTurnCommitted) =>
        sendMessage(userMsg.content, {
          model: activeModelId,
          conversationId: displayedConversationId,
          attachments: userMsg.attachments,
          ...replayOptions,
          onTurnCommitted,
        }),
      );
    },
    [
      displayedConversation,
      displayedConversationId,
      displayedMessages,
      isStreaming,
      sendReplacingMessages,
      sendMessage,
      activeModelId,
      isTrialExhausted,
      handleOpenUpgradeDialog,
      setChatError,
      variantsEnabled,
    ],
  );

  const lastAssistantMessage = useMemo(
    () => [...displayedMessages].reverse().find((m) => m.role === 'assistant'),
    [displayedMessages],
  );

  const handleCopyLastMessage = useCallback(async () => {
    const content = lastAssistantMessage?.content?.trim();
    if (!content) return;
    const copied = await safeClipboard.writeText(content);
    if (copied) toast.success('Copied to clipboard');
    else toast.error('Could not copy to clipboard');
  }, [lastAssistantMessage]);

  const handleRegenerateLastMessage = useCallback(() => {
    if (!lastAssistantMessage) return;
    void handleRegenerateMessage(lastAssistantMessage.id);
  }, [lastAssistantMessage, handleRegenerateMessage]);

  // Every binding the shortcuts dialog documents is claimed here; an omitted
  // handler leaves the key unclaimed and the browser default fires instead
  // (⌘⇧C opens the DevTools inspector).
  useKeyboardShortcuts({
    onNewChat: handleNewChat,
    onToggleSidebar: handleToggleSidebar,
    onSearch: handleOpenSearch,
    onShowShortcuts: handleOpenShortcuts,
    onFocusComposer: handleFocusComposer,
    onCopyLastMessage: handleCopyLastMessage,
    onRegenerateLastMessage: handleRegenerateLastMessage,
  });

  /**
   * Retry a Deep Research run that errored or was interrupted (CAP-045 slice 4).
   *
   * Goes through the SAME send path as any other turn — reservation, metering,
   * quota gates, and the managed-usage lifecycle all apply exactly as they do
   * to a first attempt. There is no client-side loop and no re-use of the
   * original run's reservation: this is a new, separately billed request that
   * merely starts with the previous attempt's material so it does not pay to
   * repeat searches that already succeeded.
   */
  const [retryingResearchMessageId, setRetryingResearchMessageId] = useState<string | null>(null);
  const handleRetryResearch = useCallback(
    async (id: string) => {
      if (!displayedConversationId || isStreaming) return;
      const assistantMsg = displayedMessages.find((m) => m.id === id);
      const research = assistantMsg?.metadata?.research;
      // Only an ended, unsuccessful run is retryable; anything else has no
      // Retry control rendered and must not be startable from here either.
      if (!research || (research.phase !== 'error' && research.phase !== 'interrupted')) return;
      const plan = planRegenerateRollback(displayedMessages, id);
      if (!plan) return;
      const userMsg = displayedMessages[plan.userIndex];
      if (!userMsg) return;
      if (isTrialExhausted) {
        handleOpenUpgradeDialog();
        return;
      }
      const boundaryRefusal = resolveRegenerateBoundaryRefusal({
        conversation: displayedConversation,
        messages: displayedMessages,
        targetModelId: activeModelId,
      });
      if (boundaryRefusal) {
        setChatError(boundaryRefusal, displayedConversationId);
        return;
      }

      setRetryingResearchMessageId(id);
      try {
        await sendReplacingMessages(plan.rollbackIds, (onTurnCommitted) =>
          sendMessage(userMsg.content, {
            model: activeModelId,
            conversationId: displayedConversationId,
            attachments: userMsg.attachments,
            research: true,
            researchResume: {
              sources: research.sourcesForRetry ?? [],
              steps: completedResearchSteps(research.steps),
              // Steps the failed run never reached are already approved, so the
              // retry resumes them instead of asking for the same plan twice.
              approvedSteps: approvedResearchSteps(research.steps),
            },
            onTurnCommitted,
          }),
        );
      } finally {
        setRetryingResearchMessageId(null);
      }
    },
    [
      activeModelId,
      displayedConversation,
      displayedConversationId,
      displayedMessages,
      handleOpenUpgradeDialog,
      isStreaming,
      isTrialExhausted,
      sendMessage,
      sendReplacingMessages,
      setChatError,
    ],
  );

  /**
   * Send a follow-up question about a saved research report as an ordinary
   * turn: same send path, same metering, with the report carried in the
   * question so the answer is grounded in the run the user is reading.
   */
  const handleResearchFollowUp = useCallback(
    (prompt: string) => {
      handleSend(prompt);
    },
    [handleSend],
  );

  /**
   * Answer a Deep Research run the server paused for plan approval.
   *
   * Start re-sends the same question through the normal send path with the
   * approved steps attached, so the searches that run are exactly the ones the
   * user read. Cancel keeps the plan on screen but ends the turn — nothing was
   * searched, and nothing pretends it was.
   */
  const handleResearchPlanDecision = useCallback(
    async (id: string, decision: ResearchPlanDecision) => {
      if (!displayedConversationId || isStreaming) return;
      const assistantMsg = displayedMessages.find((m) => m.id === id);
      const research = assistantMsg?.metadata?.research;
      if (!research || research.phase !== 'awaiting_approval') return;

      if (decision === 'cancel') {
        setResearchState(
          id,
          { ...research, phase: 'interrupted', label: 'Research plan cancelled' },
          displayedConversationId,
        );
        return;
      }

      const approved = approvedResearchSteps(research.steps);
      if (approved.length === 0) return;
      const plan = planRegenerateRollback(displayedMessages, id);
      if (!plan) return;
      const userMsg = displayedMessages[plan.userIndex];
      if (!userMsg) return;
      if (isTrialExhausted) {
        handleOpenUpgradeDialog();
        return;
      }
      const boundaryRefusal = resolveRegenerateBoundaryRefusal({
        conversation: displayedConversation,
        messages: displayedMessages,
        targetModelId: activeModelId,
      });
      if (boundaryRefusal) {
        setChatError(boundaryRefusal, displayedConversationId);
        return;
      }

      setRetryingResearchMessageId(id);
      try {
        await sendReplacingMessages(plan.rollbackIds, (onTurnCommitted) =>
          sendMessage(userMsg.content, {
            model: activeModelId,
            conversationId: displayedConversationId,
            attachments: userMsg.attachments,
            research: true,
            researchResume: {
              sources: research.sourcesForRetry ?? [],
              steps: completedResearchSteps(research.steps),
              approvedSteps: approved,
            },
            onTurnCommitted,
          }),
        );
      } finally {
        setRetryingResearchMessageId(null);
      }
    },
    [
      activeModelId,
      displayedConversation,
      displayedConversationId,
      displayedMessages,
      handleOpenUpgradeDialog,
      isStreaming,
      isTrialExhausted,
      sendMessage,
      sendReplacingMessages,
      setChatError,
      setResearchState,
    ],
  );

  /**
   * Continue Generation: resume the last assistant turn when it was truncated
   * at the token cap or user-stopped with partial text. Appends to the same
   * message (never a new bubble); useChatStream.continueGeneration owns the
   * continuable check and the append/persist mechanics.
   */
  const handleContinueMessage = useCallback(
    async (id: string) => {
      if (!displayedConversationId || isStreaming) return;
      if (isTrialExhausted) {
        handleOpenUpgradeDialog();
        return;
      }
      await continueGeneration(id);
    },
    [
      displayedConversationId,
      isStreaming,
      isTrialExhausted,
      handleOpenUpgradeDialog,
      continueGeneration,
    ],
  );

  const handleReactMessage = useCallback(
    async (id: string, reactionType: 'up' | 'down' | null) => {
      if (!displayedConversationId) return;
      const conversationId = displayedConversationId;
      const authToken = await getToken();
      if (!authToken) {
        setChatError('Not authenticated', conversationId);
        return;
      }

      const reaction =
        reactionType === 'up' ? 'thumbsUp' : reactionType === 'down' ? 'thumbsDown' : null;

      try {
        await patchConversationMessageMetadata({
          conversationId,
          messageId: id,
          patch: { reaction },
          authToken,
        });
        // AUDIT-FIX ROOT-CAUSE: read and write the conversation this reaction
        // belongs to (the PATCH above is awaited; the user may have moved on).
        const current = selectConversationMessages(conversationId)(useChatStore.getState()).find(
          (message) => message.id === id,
        );
        updateMessage(
          id,
          {
            metadata: {
              ...current?.metadata,
              reaction,
            },
          },
          conversationId,
        );
      } catch (error) {
        setChatError(toUserMessage(error, 'Failed to update reaction'), conversationId);
      }
    },
    [displayedConversationId, getToken, setChatError, updateMessage],
  );

  // Pin/unpin a message (persists messages.metadata.isPinned; renders as the
  // pin badge and syncs cross-device). Completes the previously-stubbed onPin.
  const handlePinMessage = useCallback(
    async (id: string) => {
      if (!displayedConversationId) return;
      const conversationId = displayedConversationId;
      const authToken = await getToken();
      if (!authToken) {
        setChatError('Not authenticated', conversationId);
        return;
      }
      // AUDIT-FIX ROOT-CAUSE: scoped to the owning conversation (see handleReactMessage).
      const current = selectConversationMessages(conversationId)(useChatStore.getState()).find(
        (message) => message.id === id,
      );
      const nextPinned = !(current?.metadata as { isPinned?: boolean } | undefined)?.isPinned;
      try {
        await patchConversationMessageMetadata({
          conversationId,
          messageId: id,
          patch: { isPinned: nextPinned },
          authToken,
        });
        updateMessage(
          id,
          {
            metadata: {
              ...current?.metadata,
              isPinned: nextPinned,
            },
          },
          conversationId,
        );
      } catch (error) {
        setChatError(toUserMessage(error, 'Failed to pin message'), conversationId);
      }
    },
    [displayedConversationId, getToken, setChatError, updateMessage],
  );

  const chatMessages = useMemo(
    () =>
      displayedConversationId
        ? displayedMessages.map((m) => toChatMessage(m, displayedConversationId))
        : [],
    [displayedMessages, displayedConversationId],
  );
  const exportSession = useMemo(
    () =>
      displayedConversation ? toChatSession(displayedConversation, chatMessages.length) : null,
    [displayedConversation, chatMessages.length],
  );
  const exportMessages = useMemo(
    () =>
      chatMessages.map((message) => ({
        ...message,
        createdAt: message.createdAt ?? new Date(),
      })),
    [chatMessages],
  );
  const showWorkSession = hasWorkSession(displayedMessages, composerToggles?.workMode);
  useEffect(() => {
    if (!showWorkSession) setWorkSessionPanelOpen(false);
  }, [showWorkSession]);
  // A URL-owned conversation must show its transcript skeleton from the FIRST
  // paint. Clerk and useConversations start their async work in effects, so the
  // hook loading flag alone has a one-render false-empty gap that flashes the
  // new-chat greeting during a hard reload.
  const isConversationTranscriptPending = isConversationRoutePending({
    displayedConversationId,
    activeConversationId,
    displayedMessageCount: chatMessages.length,
    authLoaded,
    isConversationLoading,
  });
  const isConversationSidebarPending = isConversationListPending({
    authLoaded,
    isConversationLoading,
    conversationCount: conversations.length,
  });
  const isEmptyChat =
    !displayedConversationId ||
    (chatMessages.length === 0 && !isLoading && !isConversationTranscriptPending);

  // Count distinct research sources across all messages for the toggle badge.
  // Metadata may contain a flat result list or a legacy SearchResponse object.
  const researchSourceCount = useMemo(() => {
    let count = 0;
    for (const m of chatMessages) {
      const meta = m.metadata as WebChatMessageMetadata | undefined;
      count += countWebSearchSources(meta?.searchResults);
    }
    return count;
  }, [chatMessages]);

  // Map web Conversation[] → SidebarSession[] for @agiworkforce/ui <Sidebar>.
  // Web uses isPinned/isStarred/isArchived; shared sidebar uses pinned/starred/archived.
  // shell-04 / agentic-modes-gap-03: the recents list said nothing about a
  // conversation with a turn in flight, so a user who navigated away from a
  // running chat had no way back to it except by remembering which one it was.
  // The two id sets the store already maintains per conversation are the
  // source — a background stream keeps its own row lit while another chat is on
  // screen. Managed runs a DIFFERENT device started are not observable here and
  // are deliberately not claimed as idle: `runState` is simply omitted.
  const loadingConversationIds = useChatStore((s) => s.loadingConversationIds);
  const streamingConversationIds = useChatStore((s) => s.streamingConversationIds);
  const runningConversationIds = useMemo(
    () => new Set([...loadingConversationIds, ...streamingConversationIds]),
    [loadingConversationIds, streamingConversationIds],
  );
  const sidebarSessions = useMemo<SidebarSession[]>(
    () =>
      conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        pinned: c.isPinned ?? false,
        starred: c.isStarred ?? false,
        archived: c.isArchived ?? false,
        projectId: c.projectId ?? undefined,
        messageCount: c.messageCount,
        ...(runningConversationIds.has(c.id) ? { runState: 'running' as const } : {}),
      })),
    [conversations, runningConversationIds],
  );

  // Top-level destinations stay visible in the production sidebar. The rail body
  // still owns chat recents; the Chat item is the stable mode destination paired
  // with Code, not a second recents list. Skills, Plugins, and Connectors live in
  // the Settings modal; the 'Customize' entry opens General because that is where
  // the user's name, work profile, and cross-chat instructions are edited.
  //
  // The rail itself is defined ONCE in `app-nav-items.ts` and shared with
  // WebAppShell. This file used to keep its own copy, which drifted (it was
  // missing Tasks entirely, and hardcoded `isActive: true` for Chat so the
  // selection was wrong on /chat/[sessionId]). Add or reorder destinations there.
  const hiddenNavIds = useSettingsStore((state) => state.hiddenNavIds) ?? EMPTY_NAV_IDS;

  const sidebarNavItems = useMemo<SidebarNavItem[]>(
    () =>
      buildAppNavItems({
        pathname: pathname ?? '/chat',
        navigate: (href) => router.push(href),
        isAdmin: isWorkspaceAdmin,
        hiddenIds: hiddenNavIds,
      }),
    [hiddenNavIds, isWorkspaceAdmin, pathname, router],
  );

  const handleLogout = useCallback(async () => {
    await logout();
    await clerkSignOut({ redirectUrl: '/login' });
  }, [clerkSignOut, logout]);

  /**
   * `?? 'free'` alone is not safe here. `/api/me` answering 401 clears
   * `subscription` to null while setting `initialized` and recording no error,
   * so the fallback renders a confident "Free" for whoever is actually signed
   * in. Observed in the running app: a Max 15x subscriber opened Upgrade and
   * saw Free marked "Your current plan" beside an "Upgrade to Basic — $7/month"
   * button — a downgrade presented as an upgrade.
   *
   * There is no Free fallback at all, because there is nothing to fall back
   * from: when /api/me succeeds the store always writes a subscription, and a
   * genuinely free account carries tier 'free' from the server. So a null
   * subscription never means "free" — it means "not known yet", and gating that
   * on `billingPolicyReady` was not enough, since that returns true whenever
   * /api/me settled without an error even though it leaves `subscription` null
   * on the paths that do not populate it. Observed again on 2026-08-17: Basic
   * and Max 15x accounts both rendered "Free plan" with an Upgrade button that
   * starts Stripe checkout, which the server then refused with "Use the in-app
   * upgrade flow" because a real subscription existed.
   */
  const currentTier = subscription?.tier;
  const {
    displayName,
    userInitial,
    tierLabel,
    showFreeUpgrade,
    isLoading: isAccountLoading,
  } = resolveChatAccountDisplay(user, subscription?.tier, billingPolicyReady);

  // footerSlot: web-specific account menu + free-plan nudge.
  const sidebarFooterSlot = (
    <div className="w-full">
      {showFreeUpgrade && <SidebarFreePlanNudge onUpgrade={() => handleOpenUpgradeDialog()} />}
      {/* Account dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account menu for ${displayName}`}
            aria-busy={isAccountLoading}
            disabled={isAccountLoading}
            className="flex w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-70"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
                <SidebarPlanBadge tierLabel={tierLabel} isFreeTier={currentTier === 'free'} />
              </div>
              {!isAccountLoading && user?.email && (
                <p className="truncate text-[12px] text-muted-foreground">{user.email}</p>
              )}
            </div>
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
          {!isAccountLoading && user?.email && (
            <>
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <WorkspaceMenuItems onManage={() => openSettings('team')} />
          {/* CRIT-008: open in place — /settings/general only bounces to /chat. */}
          <DropdownMenuItem onClick={() => openSettings('general')}>
            <Settings className="mr-2 h-4 w-4" />
            {t('common:settings')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/help')}>
            <HelpCircle className="mr-2 h-4 w-4" />
            {t('common:navGetHelp')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Hidden once there is nothing left to buy — this menu offered
              "Upgrade" to max_15x accounts, which reads as a billing error next
              to the plan badge in the same sidebar. */}
          {hasSelfServeUpgradePath(subscriptionTier) ? (
            <DropdownMenuItem onClick={() => handleOpenUpgradeDialog()}>
              <CreditCard className="mr-2 h-4 w-4" />
              {t('common:navUpgrade')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => router.push('/download')}>
            <Download className="mr-2 h-4 w-4" />
            {t('common:navGetApps')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setKeyboardShortcutsOpen(true)}>
            <Keyboard className="mr-2 h-4 w-4" />
            {t('common:navKeyboardShortcuts')}
            <span className="ml-auto text-[12px] text-muted-foreground">{shortcutLabel('/')}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void handleLogout()}
            className="text-danger focus:text-danger"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t('common:navLogOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  // ONE Sidebar wiring, rendered either as the desktop rail or inside the
  // narrow-viewport Sheet. The handlers that close the drawer stay handlers:
  // the drawer's dismissal is a consequence of the action, not a listener.
  const sharedSidebarProps = {
    sessions: sidebarSessions,
    projects: sidebarProjects,
    activeSessionId: displayedConversationId ?? undefined,
    isLoading: isConversationSidebarPending,
    error: conversationListError,
    mode: 'cloud' as const,
    headerSlot: <SidebarWordmark />,
    onNewChat: () => {
      setMobileNavOpen(false);
      handleNewChat();
    },
    onToggleCollapse: handleToggleSidebar,
    onOpenSearch: () => {
      setMobileNavOpen(false);
      handleOpenSearch();
    },
    navItems: sidebarNavItems,
    footerSlot: sidebarFooterSlot,
    // GOV-19: the two props the shared Sidebar's usage widget needs.
    showUsageWidget: managedUsageSummary !== null,
    budgetPercent: managedBudgetPercent,
    onOpenUsage: () => {
      setMobileNavOpen(false);
      // CRIT-008: open in place — /settings/usage only bounces to /chat.
      openSettings('usage');
    },
    onSelect: (id: string) => {
      setMobileNavOpen(false);
      handleSelectSession(id);
    },
    onDelete: (id: string) => void handleDeleteSession(id),
    onRename: handleRenameSession,
    onTogglePin: handlePinSession,
    onStar: handleStarSession,
    onArchive: handleArchiveSession,
    onShare: handleShareSession,
    onMoveToProject: handleMoveToProjectSession,
    onProjectOpen: handleProjectOpen,
    onProjectNewChat: handleProjectNewChat,
    onProjectRename: handleProjectRename,
    onProjectSettings: handleProjectSettings,
    onProjectPin: handleProjectPin,
    onProjectDelete: handleProjectDelete,
    onProjectCreate: handleProjectCreate,
  };

  // The shell ends where the consent banner begins rather than running under
  // it. The banner is fixed at z-50 and its card takes pointer events, so
  // anything in that strip was unreachable until it was answered: measured at
  // 1440x900, the account menu sat at y=826 and the token-budget row at y=792,
  // both inside a card spanning y=737-900, and the account menu is how you
  // reach settings, billing and sign-out. WebAppShell carries the same
  // treatment; /chat has its own shell and needed it separately.
  return (
    <div className="fixed inset-x-0 top-0 bottom-[var(--agi-consent-inset,0px)] flex overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text-primary)]">
      {/* Dialogs lifted from ChatSidebar to the page level */}
      {/* Destructive-action confirm (delete conversation / delete project). One
          instance for the page; `confirmDestructive` fills in the copy. */}
      {destructiveConfirmDialog}
      <GlobalSearchDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen} />
      <KeyboardShortcutsDialog
        open={keyboardShortcutsOpen}
        onOpenChange={setKeyboardShortcutsOpen}
        shortcuts={KEYBOARD_SHORTCUT_DOCS}
      />

      {/* Sidebar — @agiworkforce/ui shared component. Compact viewports move it
          into the shared Sheet drawer (same primitive WebAppShell uses) instead
          of an in-flow rail, so the conversation column gets the full width. */}
      {!isNarrowViewport && <Sidebar {...sharedSidebarProps} collapsed={sidebarCollapsed} />}

      {isNarrowViewport && (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            id={MOBILE_NAV_DRAWER_ID}
            side="left"
            className="w-[280px] max-w-[85vw] gap-0 overflow-y-auto p-0"
            data-testid="chat-mobile-nav-drawer"
            onCloseAutoFocus={(event) => {
              // The sheet opens from a button outside it, so Radix has no
              // trigger to hand focus back to and would drop it on the body.
              event.preventDefault();
              mobileNavTriggerRef.current?.focus();
            }}
          >
            <SheetTitle className="sr-only">{t('chat:openNavigation')}</SheetTitle>
            <Sidebar {...sharedSidebarProps} collapsed={false} width={MOBILE_NAV_DRAWER_WIDTH} />
          </SheetContent>
        </Sheet>
      )}

      {/* Main area + artifact workbench */}
      <div
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
        aria-hidden={isNarrowViewport && mobileNavOpen ? true : undefined}
        inert={isNarrowViewport && mobileNavOpen ? true : undefined}
      >
        {/*
         * sm:min-w-[360px] is a floor, not a preference. The three right-hand
         * panels (Artifacts 480px, Work session 380px, Research 360px) were each
         * sm:shrink-0, so opening two of them on a 1024px laptop consumed the
         * entire row and this column — transcript AND composer — collapsed to
         * zero width and disappeared. The panels now shrink to a 280px floor and
         * this column holds 360px, so the conversation is always reachable.
         */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:min-w-[360px]">
          <div
            className={cn(
              'relative flex h-11 shrink-0 items-center justify-between px-4',
              isEmptyChat
                ? 'border-b border-transparent'
                : 'border-b border-[var(--chat-border-subtle)]',
            )}
          >
            <div className="flex shrink-0 items-center gap-1">
              {isNarrowViewport && (
                <Button
                  ref={mobileNavTriggerRef}
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileNavOpen(true)}
                  aria-label={t('chat:openNavigation')}
                  aria-expanded={mobileNavOpen}
                  aria-controls={MOBILE_NAV_DRAWER_ID}
                  className="-ml-1 h-8 w-8 p-0"
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </Button>
              )}
              {hasMessages && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShareDialogOpen(true)}
                  className="hidden gap-1.5 sm:inline-flex"
                  aria-label={t('chat:shareConversation')}
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden text-xs sm:inline">{t('common:share')}</span>
                </Button>
              )}
            </div>

            {/* Conversation title - centered in header when in an active chat.
                A dropdown trigger (chevron) exposes Rename / Move to project /
                Delete; Rename swaps the title for an inline input. */}
            {activeConversationTitle &&
              activeConversationTitle !== NEW_CHAT_TITLE &&
              displayedConversationId && (
                <ConversationTitleMenu
                  title={activeConversationTitle}
                  projects={sidebarProjects}
                  onRename={(next) => handleRenameSession(displayedConversationId, next)}
                  onMoveToProject={(projectId) =>
                    handleMoveToProjectSession(displayedConversationId, projectId)
                  }
                  onDelete={() => void handleDeleteSession(displayedConversationId)}
                  // Ctrl+P alone could never work here: the transcript is
                  // virtualized, so the browser would print only the rows in
                  // the DOM and the result would look complete.
                  onPrint={() => void printConversation()}
                  onExport={() => setExportDialogOpen(true)}
                  onShare={() => setShareDialogOpen(true)}
                  // Conversation-level fork. The branch API and its hook were
                  // already live for per-message branching; only this entry
                  // point was missing. Branching from the LAST message
                  // duplicates the whole thread.
                  onFork={
                    displayedMessages.length > 0
                      ? () => {
                          const last = displayedMessages[displayedMessages.length - 1];
                          if (last?.id) void createBranch(last.id);
                        }
                      : undefined
                  }
                />
              )}

            {/*
              Four fixed controls and a fixed left group left the conversation
              title 24px of a 255px name at 320px - one character and an
              ellipsis. The panel toggles collapse behind one control on a
              phone; they keep their own state and labels, so nothing is lost
              but the width.
            */}
            <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
              {hasMessages && (
                <ApprovalInbox messages={displayedMessages} onResolve={resolveToolApproval} />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0"
                    aria-label={t('chat:openPanels', 'Panels')}
                  >
                    <PanelsTopLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="flex w-auto flex-row gap-1.5 p-1.5">
                  {hasMessages && showWorkSession && (
                    <WorkSessionToggleButton
                      messages={displayedMessages}
                      open={workSessionPanelOpen}
                      onToggle={() => setWorkSessionPanelOpen((open) => !open)}
                    />
                  )}
                  <ResearchToggleButton count={researchSourceCount} />
                  <ArtifactsToggleButton />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
              {hasMessages && (
                <ApprovalInbox messages={displayedMessages} onResolve={resolveToolApproval} />
              )}
              {hasMessages && showWorkSession && (
                <WorkSessionToggleButton
                  messages={displayedMessages}
                  open={workSessionPanelOpen}
                  onToggle={() => setWorkSessionPanelOpen((open) => !open)}
                />
              )}
              <ResearchToggleButton count={researchSourceCount} />
              <ArtifactsToggleButton />
            </div>
          </div>

          {chatError && !showsInlinePaywall && (
            <div
              role="alert"
              aria-live="polite"
              className="flex shrink-0 items-start justify-between gap-3 border-b border-red-300 bg-red-50 px-4 py-2 text-sm dark:border-red-500/25 dark:bg-red-500/10"
            >
              <span className="min-w-0 flex-1 break-words font-medium text-red-800 dark:text-red-100">
                {chatError}
              </span>
              {retryableTurnId && (
                <button
                  type="button"
                  onClick={() => {
                    setChatError(null);
                    void handleRegenerateMessage(retryableTurnId);
                  }}
                  className="shrink-0 rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-800 transition-colors hover:bg-red-100 dark:border-red-500/40 dark:text-red-100 dark:hover:bg-red-500/20"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => setChatError(null)}
                className="rounded-md p-1 text-red-600 transition-colors hover:bg-red-100 hover:text-red-900 dark:text-red-200 dark:hover:bg-red-500/20 dark:hover:text-white"
                aria-label="Dismiss chat error"
              >
                <XIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {displayedImageTranscriptRecoveries.map((recovery) => (
            <ImageTranscriptRecoveryNotice
              key={recovery.assistantMessageId}
              phase={recovery.phase}
              resultKind={recovery.phase === 'result' ? recovery.kind : undefined}
              retrying={recovery.status === 'retrying'}
              onRetry={() => handleRetryImageTranscriptRecovery(recovery)}
              onDismiss={() => removeImageTranscriptRecovery(recovery.assistantMessageId)}
            />
          ))}

          {/* Notification permission banner · shown during long generations */}
          {showNotifBanner && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--chat-border-subtle)] bg-amber-500/10 px-4 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                <span className="text-[var(--chat-text-secondary)]">
                  Get notified when the response is ready.
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRequestNotifPermission()}
                  className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  Enable
                </button>
                <button
                  type="button"
                  onClick={handleDismissNotifBanner}
                  className="text-[var(--chat-text-muted)] hover:text-[var(--chat-text-secondary)]"
                  aria-label="Dismiss notification prompt"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Message list */}
          {isConversationTranscriptPending ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <ChatLoadingState className="w-full" />
            </div>
          ) : isEmptyChat ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              {/* Empty state: greeting banner + centered composer. */}
              <div className="flex h-full w-full flex-col items-center justify-center gap-6">
                <GreetingBanner />
                <div className="mx-auto w-full max-w-3xl px-4">
                  {usageBanner}
                  {unavailableModelNotice}
                  <ChatComposerNew
                    onSend={handleSend}
                    conversationId={displayedConversationId}
                    onStop={handleStopGeneration}
                    isLoading={isLoading}
                    isGenerating={isStreaming}
                    placeholder={t('chat:placeholderEmpty')}
                    prefillText={composerPrefill}
                    onPrefillConsumed={() => setComposerPrefill(undefined)}
                    onTypingChange={handleTypingChange}
                    clearSignal={composerClearSignal}
                    emptyState
                    attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
                    sendPreviewPresentation={sendPreviewPresentation}
                    onUpgradeRequest={handleOpenUpgradeDialog}
                    onModelChange={handleConversationModelChange}
                    onGenerateImage={handleGenerateImage}
                    onGenerateVideo={handleGenerateVideo}
                    projectPicker={composerProjectPicker}
                    onSetTemporaryChat={handleSetTemporaryChat}
                    freeTrial={{
                      enabled: isWebsiteFreeTrial,
                      limitReached: freeUsageLimitReached,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-hidden">
                {/* Provide the manual tool-approval resolver to per-message
                    approval cards (MessageBubble consumes it via context). */}
                <ToolApprovalProvider value={resolveToolApproval}>
                  {/* CLR-05: lets a user message turn itself into an editor in
                      place. Same context idiom as ToolApprovalProvider — the
                      page owns the guards and the replacing resend; the bubble
                      only owns whether its own editor is open. */}
                  <MessageInlineEditProvider value={messageInlineEdit}>
                    <ChatMessageList
                      messages={chatMessages}
                      currentTier={currentTier}
                      conversationId={displayedConversationId}
                      isLoading={isLoading && !isStreaming}
                      isUserTyping={isUserTyping}
                      onRegenerate={handleRegenerateMessage}
                      onRetryResearch={handleRetryResearch}
                      onResearchPlanDecision={handleResearchPlanDecision}
                      retryingResearchMessageId={retryingResearchMessageId}
                      onContinue={handleContinueMessage}
                      onEdit={handleEditMessage}
                      onDelete={handleDeleteMessage}
                      onReact={handleReactMessage}
                      onPin={handlePinMessage}
                      branchGroupsByMessageId={branchGroupsByMessageId}
                      branchingMessageId={branchingMessageId}
                      onBranch={createBranch}
                      onSwitchBranch={switchBranch}
                      variantInfoByMessageId={variantInfoByMessageId}
                      onSelectVariant={handleSelectVariant}
                      activeLeafId={activeLeafId}
                      variantAnchorMessageId={variantAnchorMessageId}
                      isConversationStreaming={isStreaming}
                      onRegenerateImage={handleRegenerateImageInPlace}
                      onResumeVideo={handleResumeVideo}
                      onRetryVideo={handleRetryVideo}
                      onSendMessage={setComposerPrefill}
                      onPaywallUpgrade={handlePaywallRecovery}
                      onPaywallDismiss={handlePaywallDismiss}
                    />
                  </MessageInlineEditProvider>
                </ToolApprovalProvider>
              </div>

              {/* Composer + compact Send Preview disclosure. The disclosure is
                  inside the composer footer so it cannot overlap suggestions or
                  message content and no longer consumes a banner row.

                  AUDIT-FIX CMP-1: `projectPicker` used to be passed ONLY to the
                  empty-state composer in the other branch of this ternary, so
                  sending the first message unmounted that instance, mounted this
                  one, and the Chat | AGI Work toggle vanished — the conversation
                  silently continued as plain chat from message 2 and
                  `applyWorkMode` server-side only ever applied to turn 1. Both
                  instances receive it now, and the mode itself lives in the chat
                  store keyed by conversation so it survives the swap. */}
              <div className="shrink-0 pb-4">
                <div className="mx-auto w-full max-w-3xl px-4">
                  {usageBanner}
                  {unavailableModelNotice}
                  <ChatComposerNew
                    onSend={handleSend}
                    conversationId={displayedConversationId}
                    onStop={handleStopGeneration}
                    isLoading={isLoading}
                    isGenerating={isStreaming}
                    placeholder={t('chat:placeholder')}
                    prefillText={composerPrefill}
                    onPrefillConsumed={() => setComposerPrefill(undefined)}
                    onTypingChange={handleTypingChange}
                    clearSignal={composerClearSignal}
                    attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
                    sendPreviewPresentation={sendPreviewPresentation}
                    onUpgradeRequest={handleOpenUpgradeDialog}
                    onModelChange={handleConversationModelChange}
                    onGenerateImage={handleGenerateImage}
                    onGenerateVideo={handleGenerateVideo}
                    projectPicker={composerProjectPicker}
                    onSetTemporaryChat={handleSetTemporaryChat}
                    freeTrial={{
                      enabled: isWebsiteFreeTrial,
                      limitReached: freeUsageLimitReached,
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
        {showWorkSession && (
          <WorkSessionPanel
            messages={displayedMessages}
            open={workSessionPanelOpen}
            onClose={() => setWorkSessionPanelOpen(false)}
          />
        )}
        <ResearchPanel {...(isStreaming ? {} : { onAskFollowUp: handleResearchFollowUp })} />
        <ArtifactsPanel />
      </div>
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={
          createProjectFromComposer ? (project) => setActiveProject(project.id) : undefined
        }
      />
      <UpgradePlanDialog
        open={upgradePlanOpen}
        onOpenChange={(open) => {
          setUpgradePlanOpen(open);
          if (!open) setUpgradePlanTarget(null);
        }}
        currentTier={currentTier}
        targetTier={upgradePlanTarget}
        onUpgrade={(plan, annual) => void handleUpgradePlan(plan, annual)}
      />
      <ShareConversationDialog
        key={displayedConversationId ?? 'empty-conversation'}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        conversationTitle={activeConversationTitle}
      />
      <EnhancedExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        session={exportSession}
        messages={exportMessages}
      />
      <UpgradeConfirmDialog
        request={upgradeConfirm}
        onCancel={() => setUpgradeConfirm(null)}
        onConfirmed={() => {
          setUpgradeConfirm(null);
          toast.success('Your plan has been upgraded.');
        }}
      />
      {/* Project settings dialog — opened from the sidebar project row context menu */}
      {projectForSettings && (
        <ProjectSettingsDialog
          open={Boolean(projectSettingsId)}
          onOpenChange={(open) => {
            if (!open) setProjectSettingsId(null);
          }}
          project={projectForSettings}
          onUpdate={(id, updates) => updateProjectInStore(id, updates)}
          onDuplicated={refreshProjects}
          onDelete={(id) => {
            removeProjectFromStore(id);
            setProjectSettingsId(null);
          }}
        />
      )}
      {pendingByokHandoff && (
        <LocalByokHandoffDialog
          open={Boolean(pendingByokHandoff)}
          targetProviderLabel={getByokTargetProviderLabel(activeModelId)}
          candidates={pendingByokHandoff.candidates}
          selectedContextIds={selectedHandoffContextIds}
          preview={handoffPreview}
          isBuilding={isBuildingHandoff}
          isConfirming={isConfirmingHandoff}
          error={handoffError}
          onOpenChange={(open) => {
            if (!open) closeHandoffDialog();
          }}
          onToggleContext={handleToggleHandoffContext}
          onConfirm={handleConfirmHandoff}
        />
      )}
      <TimeFocusReminder userId={userId} onLeave={() => router.push('/')} />
    </div>
  );
}

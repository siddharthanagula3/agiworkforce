'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth, useClerk, useUser } from '@clerk/nextjs';
import { useRouter, useParams, useSearchParams, usePathname } from 'next/navigation';
import { ToolApprovalProvider } from '@/lib/hooks/useChatStream';
import { useChatStreamRuntime } from '../components/ChatStreamRuntimeProvider';
import { useConversations } from '@/lib/hooks/useConversations';
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
  // PER-29/PER-30: metadata builders that MERGE rather than replace, so a
  // failure or a pending regeneration cannot discard the retry parameters.
  imageGenerationFailureMetadata,
  imageRegenerationPendingMetadata,
  mergeImageGenerationMetadata,
} from '../lib/imageGenerationPersistence';
import {
  useChatStore,
  selectConversationMessages,
  selectIsConversationLoading,
  selectIsConversationStreaming,
  PENDING_CONVERSATION_KEY,
  DEFAULT_COMPOSER_TOGGLES,
} from '@shared/stores/web-chat-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useModelStore } from '@shared/stores/model-store';
import { useNotificationStore } from '@shared/stores/notification-store';
import { useUIStore } from '@shared/stores/layout-store';
import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';
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
import {
  Menu,
  Share2,
  Bell,
  X as XIcon,
  Settings,
  ChevronUp,
  CreditCard,
  Download,
  HelpCircle,
  Keyboard,
  Globe,
  LogOut,
  FolderOpen,
  LibraryBig,
  CalendarClock,
  MessageSquare,
  TerminalSquare,
} from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { useShareConversation } from '../hooks/use-share-conversation';
import { useArtifactCloudSync } from '../hooks/use-artifact-cloud-sync';
import { _sharedArtifactStore } from '../stores/artifacts-store';
import { useConversationBranches } from '../hooks/use-conversation-branches';
import { uploadChatAttachments } from '../services/chat-attachment-upload';
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import { KEYBOARD_SHORTCUT_DOCS } from '../hooks/use-keyboard-shortcuts';
import {
  Sidebar,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import { SUPPORTED_LANGUAGES } from '@/app/i18n/index';
import { useSettingsModal } from '@features/settings/components/SettingsModalProvider';
import { GlobalSearchDialog } from '../components/dialogs/GlobalSearchDialog';
import { KeyboardShortcutsDialog } from '../components/dialogs/KeyboardShortcutsDialog';
import { printConversation } from '../lib/print-conversation';
import { ChatMessageList } from '../components/messages/ChatMessageList';
import { ChatComposerNew } from '../components/Composer/ChatComposerNew';
import { GreetingBanner } from '../components/GreetingBanner/GreetingBanner';
import { SidebarWordmark } from '@shared/components/agi/SidebarWordmark';
import { ConversationTitleMenu } from '../components/ConversationTitleMenu';
import { ApprovalInbox } from '../components/approvals/ApprovalInbox';
import {
  hasWorkSession,
  WorkSessionPanel,
  WorkSessionToggleButton,
} from '../components/work-session/WorkSessionPanel';
import { ArtifactsPanel, ArtifactsToggleButton } from '../components/artifacts/ArtifactsPanel';
import { ResearchPanel, ResearchToggleButton } from '../components/research/ResearchPanel';
import { CreateProjectDialog } from '../components/dialogs/CreateProjectDialog';
import { UpgradePlanDialog, type UpgradeTarget } from '../components/dialogs/UpgradePlanDialog';
import { TimeFocusReminder } from '@/features/time-focus/TimeFocusReminder';
import { toast } from 'sonner';
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
import { completedResearchSteps } from '../utils/research-plan';
import type { AgiWorkGoalInput } from '../utils/agiwork-plan';
import {
  planEditRollback,
  planRegenerateRollback,
  consumePendingEdit,
  type PendingEditRollback,
} from '../lib/pendingEdit';
import { runReplacingSend } from '../lib/replacingSend';
import { isStaleActiveConversation } from '../lib/staleActiveConversation';
import type { Message, MessageMetadata } from '@shared/stores/web-chat-store';
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
import { useMediaGeneration, MediaGenerationApiError } from '@/lib/hooks/useMediaGeneration';
import { classifyTaskLocally } from '@agiworkforce/routing';
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_MODELS,
  type ImageAspectRatio,
} from '../components/Composer/ChatComposerNew';

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
  /** CAP-048: structured AGI Work goal captured by the composer. */
  agiWorkGoal?: AgiWorkGoalInput;
};

/**
 * AUDIT-FIX STR-6: reentrancy key for a send issued before its conversation
 * exists. All pre-create sends share it, which is exactly right -- two rapid
 * submits on the empty new-chat surface must not create two conversations --
 * while a send addressed to a real conversation is keyed by that id and can run
 * concurrently with any other chat's send.
 */
const NEW_CHAT_SEND_GUARD_KEY = '__new_conversation__';

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
  const displayName = user?.name || user?.email?.split('@')[0];

  if (!billingPolicyReady) {
    if (displayName) {
      return {
        displayName,
        userInitial: displayName.charAt(0).toUpperCase(),
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
  const tier = subscriptionTier ?? 'free';
  return {
    displayName: settledDisplayName,
    userInitial: settledDisplayName.charAt(0).toUpperCase(),
    tierLabel: getBillingPlanPricing(tier).label,
    showFreeUpgrade: tier === 'free',
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
    m.metadata || m.model || tokensUsed !== undefined
      ? {
          ...m.metadata,
          model: m.model ?? m.metadata?.model,
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

export default function WebChatPage() {
  useArtifactCloudSync();

  // Core chat UI previously had zero i18n coverage — every string, including
  // the composer placeholder, was hardcoded English even though full
  // translation resources already exist (packages/ui/i18n/locales/*, the single
  // runtime locale root). Wire the most visible strings through the existing
  // 'chat' and 'common' namespaces.
  const { t, i18n } = useTranslation(['chat', 'common']);
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
  // Auto-collapse the sidebar below the mobile breakpoint so the composer
  // never gets squeezed into a few px of width on a phone-sized viewport.
  // Tracked separately from the user's manual collapse toggle so widening
  // the window back out restores whatever the user had chosen, and the
  // manual toggle below the breakpoint doesn't fight the media query.
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(max-width: 768px)');
    const update = () => setIsNarrowViewport(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  const effectiveSidebarCollapsed = sidebarCollapsed || isNarrowViewport;
  // Compact viewports render the sidebar as an off-canvas drawer instead of an
  // in-flow rail; this tracks whether that drawer is open.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
  const activeModelId =
    isWebsiteFreeTrial && !FREE_TRIAL_MODELS.includes(selectedModelId)
      ? freeTrialModelId
      : selectedModelId;
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

  // Consume any pending message written by the project-detail composer before
  // navigating here. Reading once on mount prevents the value from surviving
  // page refreshes.
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem('agi.project.pendingMessage');
      if (pending) {
        sessionStorage.removeItem('agi.project.pendingMessage');
        sessionStorage.removeItem('agi.project.pendingProjectId');
        setComposerPrefill(pending);
      }
    } catch {
      // sessionStorage unavailable -- ignore
    }
  }, []);

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
  const [upgradeConfirm, setUpgradeConfirm] = useState<UpgradeConfirmRequest | null>(null);

  // Dialog state — lifted from ChatSidebar so they live at the page level and
  // work with the shared <Sidebar> component (which has no dialog state).
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);

  // Project settings dialog state (opened from sidebar row context menu)
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);

  // Web-specific hooks for the sidebar footer slot.
  const { signOut: clerkSignOut } = useClerk();
  const { user: clerkUser } = useUser();
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
  const { projects: storeProjects, isReady: projectsReady } = useManagedCloudProjects();
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
  const handleOpenUpgradeDialog = useCallback(() => {
    setUpgradePlanOpen(true);
  }, []);

  // Route the upgrade CTA to the real Stripe checkout flow (same service the
  // billing dashboard uses). No waitlist email capture.
  const handleUpgradePlan = useCallback(
    async (plan: UpgradeTarget, annual: boolean) => {
      if (!user) {
        toast.error('Please sign in to upgrade.');
        return;
      }
      setUpgradePlanOpen(false);
      const billingPeriod = annual ? 'yearly' : 'monthly';
      const hasActivePaidPlan =
        subscription != null &&
        !['free', 'local-only', 'byok'].includes(subscription.tier) &&
        ['active', 'trialing'].includes(subscription.status);
      // A mid-cycle upgrade charges the saved card immediately with no Stripe
      // screen, so confirm the exact prorated amount first instead of charging
      // silently. UpgradeConfirmDialog owns the preview + the actual charge.
      if (hasActivePaidPlan) {
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
        toast.error(err instanceof Error ? err.message : 'Failed to start checkout.');
      }
    },
    [subscription, user],
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
  const managedBudgetPercent = useMemo(
    () => getWorstUsagePercent(managedUsageSummary),
    [managedUsageSummary],
  );

  const messages = useChatStore((s) => s.messages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const chatError = useChatStore((s) => s.error);
  const setChatError = useChatStore((s) => s.setError);

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
    createConversation,
    loadConversation,
    deleteConversation,
    updateConversation,
    setActiveConversation,
  } = useConversations();
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

  // Share current conversation
  const activeConversationTitle = displayedConversation?.title;
  const { share, isSharing } = useShareConversation(activeConversationTitle);
  const hasMessages = displayedMessages.length > 0;

  // "Reply ready" browser notification: fires once per completed stream while
  // the tab is backgrounded. Previously the permission banner above only
  // ever called Notification.requestPermission() — nothing consumed the
  // grant, so no notification ever fired. Respects the user's saved
  // "browserReplyReady" preference from Settings > Notifications.
  const wasStreamingRef = useRef(false);
  const browserReplyReadyRef = useRef(true);
  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<{ browserReplyReady: boolean }>('notifications', {
      browserReplyReady: true,
    })
      .then((value) => {
        if (!cancelled) browserReplyReadyRef.current = value.browserReplyReady;
      })
      .catch(() => {
        // Non-fatal: keep the default (on) so a failed preferences fetch
        // never silently disables a notification the user never turned off.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const justFinished = wasStreamingRef.current && !isStreaming;
    wasStreamingRef.current = isStreaming;
    if (!justFinished) return;
    if (typeof document === 'undefined' || typeof Notification === 'undefined') return;
    // Matches the Settings copy: "Shown as desktop popups when the AGI tab
    // is in the background." Don't interrupt an active, focused session.
    if (document.visibilityState !== 'hidden') return;
    if (Notification.permission !== 'granted') return;
    if (!browserReplyReadyRef.current) return;
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
  }, [isStreaming, displayedMessages, chatError, displayedConversation]);

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
          (await createConversation('New Chat', activeModelId, sendProjectId).then((c) => {
            if (c) {
              freshConvId = c.id;
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
        const doSend = (onTurnCommitted?: () => void) =>
          sendMessage(content, {
            model: activeModelId,
            conversationId: convId,
            onTurnCommitted,
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
        const message =
          error instanceof Error ? error.message : 'Could not attach the selected files.';
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
      sendMessage,
      activeModelId,
      activeProjectId,
      router,
      setChatError,
      claimSendWindow,
    ],
  );

  const { generateImage, generateVideo } = useMediaGeneration();

  // ---------------------------------------------------------------------------
  // Shared helper: resolve size + provider from composer options
  // ---------------------------------------------------------------------------
  const resolveImageParams = useCallback((aspectRatio: ImageAspectRatio, modelId?: string) => {
    const aspectOption = IMAGE_ASPECT_OPTIONS.find((o) => o.id === aspectRatio);
    const size = aspectOption?.size ?? '1024x1024';
    const modelEntry = IMAGE_MODELS.find((m) => m.id === modelId);
    const provider = modelEntry?.provider ?? 'google';
    return { size, provider };
  }, []);

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
    (msgId: string, raw: string, conversationId: string) => {
      const isPaywall =
        raw.includes('403') ||
        raw.includes('plan_upgrade_required') ||
        raw.includes('subscription_required');
      // PER-30: `metadata: undefined` used to REPLACE the metadata object on
      // the non-paywall branch (and the paywall branch replaced it with a
      // paywall-only object), discarding imageGenPrompt / imageGenAspect /
      // imageGenModel — exactly the fields Retry needs. Merge onto the current
      // metadata instead so a failed image can still be retried.
      updateMessage(
        msgId,
        {
          isStreaming: false,
          content: isPaywall ? '' : `Image generation failed: ${raw}`,
          metadata: imageGenerationFailureMetadata(
            readMessageMetadata(conversationId, msgId),
            isPaywall
              ? {
                  paywall: {
                    feature: 'image_generation',
                    requiredTier: 'pro',
                    reason:
                      'Image generation requires a Pro or higher plan. Upgrade to generate images.',
                  },
                }
              : {},
          ),
        },
        conversationId,
      );
    },
    [updateMessage, readMessageMetadata],
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
          const { size, provider } = resolveImageParams(options.aspectRatio, options.modelId);

          // Ensure a conversation exists (lazy-create, same pattern as sendContent).
          let convId = displayedConversationId;
          if (!convId) {
            const fresh = await createConversation(
              'Image generation',
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

          // WEB-IMAGE-CHAT-PERSISTENCE-01: unlike sendContent (which streams
          // through useChatStream and persists via saveMessageToDb on every
          // turn), this composer-driven flow only ever touched the in-memory
          // chatStore — the generated image bytes are durably stored by
          // /api/media/image/generate, but the chat MESSAGE recording that it
          // happened was never saved, so it vanished on reload. Persist both
          // turns the same way useChatStream's sendMessage does (see
          // features/chat/lib/imageGenerationPersistence.ts), skipping
          // temporary conversations exactly like every other send path.
          const isTemporaryConversation = isTemporaryConversationById(
            useChatStore.getState().conversations,
            convId,
          );
          const getAuthToken = async () => {
            const token = await getToken();
            if (!token) throw new Error('Not authenticated');
            return token;
          };

          // User message (prompt)
          // AUDIT-FIX ROOT-CAUSE: every write below names the conversation this
          // generation belongs to, so switching chats mid-generation can no
          // longer inject the prompt, the placeholder, or the finished image
          // into a different transcript.
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
          if (!isTemporaryConversation) {
            void persistImageGenerationUserMessage({
              conversationId: convId,
              messageId: userMessageId,
              content: prompt,
              getAuthToken,
              updateMessage: updateOwnMessage,
            });
          }

          // Placeholder assistant message while generating (isStreaming = true → state A)
          const assistantMsgId = crypto.randomUUID();
          addMessage(
            {
              id: assistantMsgId,
              role: 'assistant',
              content: '',
              isStreaming: true,
              createdAt: new Date().toISOString(),
              metadata: {
                toolType: 'image-generation',
                imageGenPrompt: prompt,
                imageGenAspect: options.aspectRatio,
                imageGenModel: options.modelId,
              },
            },
            convId,
          );

          try {
            const imageUrl = await generateImage(prompt, {
              size,
              provider,
              model: options.modelId,
            });
            const finalMetadata: MessageMetadata = {
              toolType: 'image-generation',
              imageUrl,
              imageGenPrompt: prompt,
              imageGenAspect: options.aspectRatio,
              imageGenModel: options.modelId,
            };
            updateOwnMessage(assistantMsgId, {
              content: '',
              isStreaming: false,
              metadata: finalMetadata,
            });
            if (!isTemporaryConversation) {
              void persistImageGenerationAssistantMessage({
                conversationId: convId,
                messageId: assistantMsgId,
                model: options.modelId,
                metadata: finalMetadata,
                getAuthToken,
                updateMessage: updateOwnMessage,
              });
            }
          } catch (err) {
            applyImageError(
              assistantMsgId,
              err instanceof Error ? err.message : String(err),
              convId,
            );
          }
        } finally {
          sendingConversationsRef.current.delete(imageGuardKey);
          releaseSendWindow();
        }
      })();
    },
    [
      resolveImageParams,
      displayedConversationId,
      urlConversationId,
      createConversation,
      activeModelId,
      activeProjectId,
      addMessage,
      updateMessage,
      generateImage,
      applyImageError,
      router,
      getToken,
      claimSendWindow,
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
      const { size, provider } = resolveImageParams(opts.aspectRatio, opts.modelId);
      // AUDIT-FIX ROOT-CAUSE: capture the owning conversation up front; the
      // regeneration awaits a slow provider call the user can navigate away
      // from, and every write below must still land on THIS transcript.
      const ownerConversationId = displayedConversationId;

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
      updateMessage(
        messageId,
        {
          isStreaming: true,
          metadata: imageRegenerationPendingMetadata(previousMetadata, {
            prompt: opts.prompt,
            aspectRatio: opts.aspectRatio,
            ...(opts.modelId !== undefined ? { modelId: opts.modelId } : {}),
          }),
        },
        ownerConversationId ?? undefined,
      );

      try {
        const imageUrl = await generateImage(opts.prompt, { size, provider, model: opts.modelId });
        const finalMetadata: MessageMetadata = mergeImageGenerationMetadata(previousMetadata, {
          toolType: 'image-generation',
          imageUrl,
          imageGenPrompt: opts.prompt,
          imageGenAspect: opts.aspectRatio,
          imageGenModel: opts.modelId,
        });
        updateMessage(
          messageId,
          {
            metadata: finalMetadata,
          },
          ownerConversationId ?? undefined,
        );

        // WEB-IMAGE-CHAT-PERSISTENCE-01: this updates an EXISTING assistant
        // message in place, so persist via the same message id — the route is
        // idempotent on client-supplied id (ON CONFLICT), so this upserts the
        // row saved when the image was first generated instead of duplicating it.
        const convId = ownerConversationId;
        if (convId) {
          const isTemporaryConversation = isTemporaryConversationById(
            useChatStore.getState().conversations,
            convId,
          );
          if (!isTemporaryConversation) {
            const getAuthToken = async () => {
              const token = await getToken();
              if (!token) throw new Error('Not authenticated');
              return token;
            };
            void persistImageGenerationAssistantMessage({
              conversationId: convId,
              messageId,
              model: opts.modelId,
              metadata: finalMetadata,
              getAuthToken,
              updateMessage: (id, updates) => updateMessage(id, updates, convId),
            });
          }
        }

        return imageUrl;
      } catch (error) {
        // PER-29: put the card back in a usable state — the original image and
        // every retry parameter survive, so the user can try again. Rethrown
        // because ImageGenerationCard's edit panel awaits this promise and
        // renders its own inline error from the rejection.
        updateMessage(
          messageId,
          {
            metadata: imageGenerationFailureMetadata(
              readMessageMetadata(ownerConversationId, messageId) ?? previousMetadata,
            ),
          },
          ownerConversationId ?? undefined,
        );
        throw error;
      } finally {
        // PER-29: the spinner is cleared on EVERY exit, success or failure.
        updateMessage(messageId, { isStreaming: false }, ownerConversationId ?? undefined);
      }
    },
    [
      resolveImageParams,
      updateMessage,
      generateImage,
      displayedConversationId,
      getToken,
      readMessageMetadata,
    ],
  );

  // ---------------------------------------------------------------------------
  // handleGenerateVideo – called by composer; mirrors handleGenerateImage.
  //
  // The difference that matters is the in-flight window: the video task runs
  // for a minute or more behind /api/media/video/status, and the assistant
  // message is deliberately created with `toolType: 'video-generation'` and NO
  // `videoUrl`, which is exactly the pair MessageBubble reads to render its
  // shimmering placeholder. `videoUrl` is written only on completion, which is
  // what flips the same bubble to the player + download affordance.
  // ---------------------------------------------------------------------------
  const handleGenerateVideo = useCallback(
    (prompt: string, videoOptions?: { modelId?: string }) => {
      const videoGuardKey = displayedConversationId || NEW_CHAT_SEND_GUARD_KEY;
      if (sendingConversationsRef.current.has(videoGuardKey)) return;
      sendingConversationsRef.current.add(videoGuardKey);
      const releaseSendWindow = claimSendWindow();
      void (async () => {
        try {
          let convId = displayedConversationId;
          if (!convId) {
            const fresh = await createConversation(
              'Video generation',
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
          if (!isTemporaryConversation) {
            void persistImageGenerationUserMessage({
              conversationId: convId,
              messageId: userMessageId,
              content: prompt,
              getAuthToken,
              updateMessage: updateOwnMessage,
            });
          }

          const assistantMsgId = crypto.randomUUID();
          addMessage(
            {
              id: assistantMsgId,
              role: 'assistant',
              content: '',
              isStreaming: true,
              createdAt: new Date().toISOString(),
              // No videoUrl: the shimmer branch is keyed off its absence.
              metadata: { toolType: 'video-generation' },
            },
            convId,
          );

          try {
            const { videoUrl, thumbnailUrl } = await generateVideo(
              prompt,
              videoOptions?.modelId ? { modelId: videoOptions.modelId } : {},
            );
            const finalMetadata: MessageMetadata = {
              toolType: 'video-generation',
              videoUrl,
              ...(thumbnailUrl ? { thumbnailUrl } : {}),
            };
            updateOwnMessage(assistantMsgId, {
              content: '',
              isStreaming: false,
              metadata: finalMetadata,
            });
            if (!isTemporaryConversation) {
              void persistImageGenerationAssistantMessage({
                conversationId: convId,
                messageId: assistantMsgId,
                model: undefined,
                metadata: finalMetadata,
                getAuthToken,
                updateMessage: updateOwnMessage,
              });
            }
          } catch (err) {
            // A tier refusal must land as an InlinePaywallCard, not a toast or
            // a raw error bubble: ChatMessageList swaps the whole row for the
            // card whenever `metadata.paywall` is present. `isPaywall` is the
            // hook's own classification of the route's 403
            // (`code: 'plan_upgrade_required'`), so this does not re-parse
            // error strings.
            const isPaywall = err instanceof MediaGenerationApiError && err.isPaywall;
            updateOwnMessage(assistantMsgId, {
              isStreaming: false,
              content: isPaywall
                ? ''
                : `Video generation failed: ${err instanceof Error ? err.message : String(err)}`,
              metadata: {
                toolType: 'video-generation',
                ...(isPaywall
                  ? {
                      paywall: {
                        feature: 'video_generation',
                        // billing-catalog.ts: video_generation → ['max_15x', 'enterprise'].
                        requiredTier: 'max_15x',
                        reason: 'Video generation is available on Max 15x and Enterprise plans.',
                      },
                    }
                  : {}),
              },
            });
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
      generateVideo,
      router,
      getToken,
      claimSendWindow,
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
          setHandoffError(error instanceof Error ? error.message : 'Could not build BYOK preview');
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
      setHandoffError(
        error instanceof Error ? error.message : 'Could not create BYOK fork conversation.',
      );
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

  // Wire global keyboard shortcuts. Dialogs now live at the page level.
  useKeyboardShortcuts({
    onNewChat: handleNewChat,
    onToggleSidebar: handleToggleSidebar,
    onSearch: handleOpenSearch,
    onShowShortcuts: handleOpenShortcuts,
    onFocusComposer: handleFocusComposer,
  });

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
      const label = conversation?.title ? `"${conversation.title}"` : 'this conversation';
      if (
        typeof window !== 'undefined' &&
        !window.confirm(`Delete ${label}? This can't be undone.`)
      ) {
        return;
      }
      const deleted = await deleteConversation(id);
      if (!deleted) return;
      if (id === displayedConversationId) {
        setBareChatSessionId(null);
        setActiveConversation(null);
        router.push('/chat');
      }
    },
    [conversations, deleteConversation, displayedConversationId, router, setActiveConversation],
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
        toast.error(error instanceof Error ? error.message : 'Failed to update pin');
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
      const label = project?.name ? `"${project.name}"` : 'this project';
      if (
        typeof window !== 'undefined' &&
        !window.confirm(`Delete ${label}? This can't be undone.`)
      ) {
        return;
      }
      // Optimistic remove, with rollback on server failure so the sidebar
      // never lies about what actually got deleted.
      removeProjectFromStore(projectId);
      try {
        await webManagedCloudProjects.deleteProject(projectId);
      } catch (err) {
        if (project) {
          setStoreProjects([...useProjectStore.getState().projects, project]);
        }
        toast.error(err instanceof Error ? err.message : 'Failed to delete project');
      }
    },
    [storeProjects, removeProjectFromStore, setStoreProjects],
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

  // Auto-title: when the second message arrives (first assistant reply), derive title
  // from the first user message content if the conversation is still named "New Chat".
  // Intentionally only re-runs on messages.length, not the full messages array, to
  // avoid re-running on every streaming chunk.
  useEffect(() => {
    if (!displayedConversationId || displayedMessages.length !== 2) return;
    const convo = conversations.find((c) => c.id === displayedConversationId);
    if (!convo || convo.title !== 'New Chat') return;
    const firstUser = displayedMessages[0];
    if (!firstUser || firstUser.role !== 'user') return;
    const title = firstUser.content.trim().slice(0, 60).replace(/\n/g, ' ') || 'New Chat';
    updateConversation(displayedConversationId, { title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedMessages.length, displayedConversationId, conversations, updateConversation]);

  // Scroll to and flash-highlight a message when navigated from global search results.
  // GlobalSearchDialog navigates to /chat/[sessionId]?highlightMessage=<msgId>.
  // We wait for messages to load before scrolling, then clear the param from the URL.
  useEffect(() => {
    if (!highlightMessageId || displayedMessages.length === 0) return;
    const el = document.querySelector<HTMLElement>(`[data-message-id="${highlightMessageId}"]`);
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
  }, [highlightMessageId, displayedMessages.length, router]);

  const deletePersistedMessages = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!displayedConversationId || ids.length === 0) return false;
      const conversationId = displayedConversationId;

      const authToken = await getToken();
      if (!authToken) {
        setChatError('Not authenticated', conversationId);
        return false;
      }

      try {
        for (const messageId of ids) {
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
        return true;
      } catch (error) {
        setChatError(
          error instanceof Error ? error.message : 'Failed to delete message',
          conversationId,
        );
        return false;
      }
    },
    [deleteMessage, displayedConversationId, getToken, setChatError],
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
      // AUDIT-FIX STR-22: fire the durable delete at COMMIT, not at stream end.
      // Deferring it until `send()` resolved meant the whole regeneration window
      // had both the old rows and the new user row on the server, so a reload
      // mid-regeneration showed a duplicated user message and the stale answer.
      // Idempotent, because runReplacingSend also calls deleteServer on commit.
      let serverRowsDeleted = false;
      const deleteReplacedServerRows = () => {
        if (serverRowsDeleted) return;
        serverRowsDeleted = true;
        void deleteServerMessages(conversationId, rollbackIds);
      };
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
        rollbackIds,
        () => send(deleteReplacedServerRows),
      );
    },
    [displayedConversationId, deleteMessage, deleteServerMessages],
  );
  sendReplacingMessagesRef.current = sendReplacingMessages;

  const handleDeleteMessage = useCallback(
    (id: string) => {
      void deletePersistedMessages([id]);
    },
    [deletePersistedMessages],
  );

  // Paywall cards are synthetic (not persisted in DB). "Try later" should just
  // remove the card from the local store without hitting the API.
  const handlePaywallDismiss = useCallback(
    (id: string) => {
      // AUDIT-FIX ROOT-CAUSE: a paywall card belongs to the transcript it is
      // rendered in, not to whatever the store considers active.
      deleteMessage(id, displayedConversationId ?? undefined);
    },
    [deleteMessage, displayedConversationId],
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
        void share();
      } else {
        router.push(`/chat/${id}`);
      }
    },
    [displayedConversationId, share, router],
  );

  const handleEditMessage = useCallback(
    (id: string) => {
      if (!displayedConversationId || isStreaming) return;
      const idx = displayedMessages.findIndex((m) => m.id === id);
      const msg = idx >= 0 ? displayedMessages[idx] : undefined;
      if (!msg || msg.role !== 'user') return;
      if (isTrialExhausted) {
        handleOpenUpgradeDialog();
        return;
      }
      // DATA-LOSS FIX: stash the rollback and prefill the composer, but do NOT
      // delete anything yet. The original transcript stays visible while the
      // user edits; sendContent performs the deletion only when (and if) they
      // resubmit. Previously this deleted the message + all later messages from
      // the DB immediately, so abandoning the edit lost them permanently.
      const plan = planEditRollback(displayedMessages, id, displayedConversationId);
      if (!plan) return;
      pendingEditRollbackRef.current = plan;
      setComposerPrefill(msg.content);
    },
    [
      displayedConversationId,
      displayedMessages,
      isStreaming,
      isTrialExhausted,
      handleOpenUpgradeDialog,
    ],
  );

  const handleRegenerateMessage = useCallback(
    async (id: string) => {
      if (!displayedConversationId || isStreaming) return;
      const assistantMsg = displayedMessages.find((m) => m.id === id);
      // Roll back from the user turn being regenerated (inclusive) so re-sending
      // the user content replaces it instead of creating a duplicate user
      // message. planRegenerateRollback resolves the preceding user message.
      const plan = planRegenerateRollback(displayedMessages, id);
      if (!plan) return;
      const userMsg = displayedMessages[plan.userIndex];
      if (!userMsg) return;
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
    ],
  );

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
        setChatError(
          error instanceof Error ? error.message : 'Failed to update reaction',
          conversationId,
        );
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
        setChatError(
          error instanceof Error ? error.message : 'Failed to pin message',
          conversationId,
        );
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
  const showWorkSession = hasWorkSession(displayedMessages, composerToggles?.workMode);
  useEffect(() => {
    if (!showWorkSession) setWorkSessionPanelOpen(false);
  }, [showWorkSession]);
  // AUDIT-FIX STR-7/BUG-12: `isLoading` is now strictly "a turn is running", so
  // the conversation-open fetch has to be consulted explicitly here — otherwise
  // navigating into a conversation flashes the new-chat greeting until its
  // messages land.
  const isEmptyChat =
    !displayedConversationId || (chatMessages.length === 0 && !isLoading && !isConversationLoading);

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
      })),
    [conversations],
  );

  // Keyboard shortcuts definitions forwarded to the shortcuts dialog.
  // The dialog documents the CANONICAL list (`KEYBOARD_SHORTCUT_DOCS`). This
  // used to be a separate four-entry array that omitted Escape, Cmd+Shift+C
  // and Cmd+Shift+R — all bound and working, none of them listed.

  // Top-level Chat / Code destinations stay visible in the production sidebar.
  // The rail body still owns chat recents; this Chat item is the stable mode
  // destination paired with Code, not a second recents list. 'Artifacts' was
  // already removed (it linked to the
  // /gallery marketing page; artifacts open via the header ArtifactsToggleButton).
  // Skills, Plugins, and Connectors now live in ONE place — the Settings modal — so the
  // single 'Customize' entry opens that modal instead of navigating to /customize or a
  // separate Directory modal (both removed).
  const sidebarNavItems = useMemo<SidebarNavItem[]>(
    () => [
      {
        id: 'chat-home',
        label: 'Chat',
        icon: MessageSquare,
        onClick: () => router.push('/chat'),
        isActive: true,
      },
      {
        id: 'code',
        label: 'Code',
        icon: TerminalSquare,
        onClick: () => router.push('/chat/code'),
        isActive: false,
      },
      // Persistent Projects entry (claude.ai parity). The Projects *section* in
      // the sidebar body only renders once the user has at least one project, so
      // a zero-project user previously had NO way to reach /projects. This nav
      // link is always present.
      {
        id: 'projects',
        label: 'Projects',
        icon: FolderOpen,
        onClick: () => router.push('/chat/projects'),
        isActive: false,
      },
      // Library — browse generated files without scrolling back to their
      // origin message (ChatGPT-Library / mobile-LibraryScreen parity).
      {
        id: 'library',
        label: 'Library',
        icon: LibraryBig,
        onClick: () => router.push('/chat/library'),
        isActive: false,
      },
      {
        id: 'schedules',
        label: 'Schedules',
        icon: CalendarClock,
        onClick: () => router.push('/chat/schedules'),
        isActive: false,
      },
      {
        id: 'customize',
        label: 'Customize',
        icon: Settings,
        onClick: () => openSettings('skills'),
        isActive: false,
      },
    ],
    [openSettings, router],
  );

  const handleLogout = useCallback(async () => {
    await logout();
    await clerkSignOut({ redirectUrl: '/login' });
  }, [clerkSignOut, logout]);

  const currentTier = subscription?.tier ?? 'free';
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
      {/* Free plan nudge */}
      {showFreeUpgrade && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between rounded-full bg-black/[0.04] dark:bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground">
            <span>Free plan</span>
            <button
              type="button"
              onClick={handleOpenUpgradeDialog}
              className="font-medium text-primary hover:underline"
            >
              Upgrade
            </button>
          </div>
        </div>
      )}
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
                {tierLabel && currentTier === 'free' ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary hover:bg-primary/20">
                    Upgrade
                  </span>
                ) : tierLabel ? (
                  <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tierLabel}
                  </span>
                ) : null}
              </div>
              {!isAccountLoading && user?.email && (
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              )}
            </div>
            <ChevronUp
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
              aria-hidden="true"
            />
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
          {/* CRIT-008: open in place — /settings/general only bounces to /chat. */}
          <DropdownMenuItem onClick={() => openSettings('general')}>
            <Settings className="mr-2 h-4 w-4" />
            {t('common:settings')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            {/* No ChevronRight here: DropdownMenuSubTrigger already appends one
                after `children`, so adding a second rendered two arrows. */}
            <DropdownMenuSubTrigger>
              <Globe className="mr-2 h-4 w-4" />
              {t('common:navLanguage')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuRadioGroup
                value={i18n.language}
                onValueChange={(code) => void i18n.changeLanguage(code)}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <DropdownMenuRadioItem key={lang.code} value={lang.code}>
                    <span className="mr-2">{lang.flag}</span>
                    {lang.nativeName}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => router.push('/help')}>
            <HelpCircle className="mr-2 h-4 w-4" />
            {t('common:navGetHelp')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Hidden once there is nothing left to buy — this menu offered
              "Upgrade" to max_15x accounts, which reads as a billing error next
              to the plan badge in the same sidebar. */}
          {hasSelfServeUpgradePath(subscriptionTier) ? (
            <DropdownMenuItem onClick={handleOpenUpgradeDialog}>
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
            <span className="ml-auto text-[10px] text-muted-foreground">?</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void handleLogout()}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t('common:navLogOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div
      data-chat-theme="cool"
      className="fixed inset-0 flex overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text-primary)]"
    >
      {/* Dialogs lifted from ChatSidebar to the page level */}
      <GlobalSearchDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen} />
      <KeyboardShortcutsDialog
        open={keyboardShortcutsOpen}
        onOpenChange={setKeyboardShortcutsOpen}
        shortcuts={KEYBOARD_SHORTCUT_DOCS}
      />

      {/* Sidebar — @agiworkforce/ui shared component. Compact viewports render
          it as an off-canvas drawer (fixed overlay + backdrop) instead of an
          in-flow rail so the conversation column gets the full width. */}
      {isNarrowViewport && mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={
          isNarrowViewport
            ? cn(
                'chat-mobile-drawer fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] shadow-xl transition-transform duration-200 ease-out',
                mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
              )
            : 'contents'
        }
      >
        <Sidebar
          sessions={sidebarSessions}
          projects={sidebarProjects}
          activeSessionId={displayedConversationId ?? undefined}
          collapsed={isNarrowViewport ? false : effectiveSidebarCollapsed}
          isMobile={isNarrowViewport}
          isLoading={isLoading && conversations.length === 0}
          error={conversations.length === 0 ? chatError : null}
          mode="cloud"
          headerSlot={<SidebarWordmark />}
          onNewChat={() => {
            setMobileNavOpen(false);
            handleNewChat();
          }}
          onToggleCollapse={handleToggleSidebar}
          onOpenSearch={handleOpenSearch}
          navItems={sidebarNavItems}
          footerSlot={sidebarFooterSlot}
          // GOV-19: the two props the shared Sidebar's usage widget needs.
          showUsageWidget={managedUsageSummary !== null}
          budgetPercent={managedBudgetPercent}
          onOpenUsage={() => {
            setMobileNavOpen(false);
            // CRIT-008: open in place — /settings/usage only bounces to /chat.
            openSettings('usage');
          }}
          onSelect={(id) => {
            setMobileNavOpen(false);
            handleSelectSession(id);
          }}
          onDelete={(id) => void handleDeleteSession(id)}
          onRename={handleRenameSession}
          onTogglePin={handlePinSession}
          onStar={handleStarSession}
          onArchive={handleArchiveSession}
          onShare={handleShareSession}
          onMoveToProject={handleMoveToProjectSession}
          onProjectOpen={handleProjectOpen}
          onProjectNewChat={handleProjectNewChat}
          onProjectRename={handleProjectRename}
          onProjectSettings={handleProjectSettings}
          onProjectPin={handleProjectPin}
          onProjectDelete={handleProjectDelete}
          onProjectCreate={handleProjectCreate}
          className="bg-[var(--chat-sidebar-bg)] border-[var(--chat-border-strong)]"
        />
      </div>

      {/* Main area + artifact workbench */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
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
            <div className="flex items-center gap-1">
              {isNarrowViewport && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileNavOpen(true)}
                  aria-label={t('chat:openNavigation')}
                  className="-ml-1 h-8 w-8 p-0"
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </Button>
              )}
              {hasMessages && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void share()}
                  disabled={isSharing}
                  className="gap-1.5"
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
              activeConversationTitle !== 'New Chat' &&
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

            <div className="flex items-center gap-1.5">
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

          {chatError && (
            <div
              role="alert"
              aria-live="polite"
              className="flex shrink-0 items-start justify-between gap-3 border-b border-red-300 bg-red-50 px-4 py-2 text-sm dark:border-red-500/25 dark:bg-red-500/10"
            >
              <span className="min-w-0 flex-1 break-words font-medium text-red-800 dark:text-red-100">
                {chatError}
              </span>
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
          {isEmptyChat ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              {/* Empty state: greeting banner + centered composer. */}
              <div className="mx-auto flex h-full w-full max-w-[960px] flex-col items-center justify-center gap-6 px-6">
                <GreetingBanner onSendMessage={setComposerPrefill} />
                <div className="w-full max-w-[940px]">
                  {usageBanner}
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
                  <ChatMessageList
                    messages={chatMessages}
                    conversationId={displayedConversationId}
                    isLoading={isLoading && !isStreaming}
                    isUserTyping={isUserTyping}
                    onRegenerate={handleRegenerateMessage}
                    onRetryResearch={handleRetryResearch}
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
                    onRegenerateImage={handleRegenerateImageInPlace}
                    onSendMessage={setComposerPrefill}
                    onPaywallUpgrade={handleOpenUpgradeDialog}
                    onPaywallDismiss={handlePaywallDismiss}
                  />
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
                <div
                  className={cn(
                    'mx-auto w-full max-w-3xl px-4',
                    effectiveSidebarCollapsed ? 'max-w-4xl' : '',
                  )}
                >
                  {usageBanner}
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
        <ResearchPanel />
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
        onOpenChange={setUpgradePlanOpen}
        currentTier={currentTier}
        onUpgrade={(plan, annual) => void handleUpgradePlan(plan, annual)}
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

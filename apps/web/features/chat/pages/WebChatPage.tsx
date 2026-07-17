'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/nextjs';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useChatStream, ToolApprovalProvider } from '@/lib/hooks/useChatStream';
import { useConversations } from '@/lib/hooks/useConversations';
import {
  isTemporaryConversationById,
  persistImageGenerationUserMessage,
  persistImageGenerationAssistantMessage,
} from '../lib/imageGenerationPersistence';
import { useChatStore } from '@/stores/chatStore';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useModelStore } from '@shared/stores/model-store';
import { useNotificationStore } from '@shared/stores/notification-store';
import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { useBillingStore } from '@/stores/unified/auth';
import { getBestAutoModeForTier } from '@shared/config/llm';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import {
  summarizeSendPreview,
  type ProviderMode,
  type SendPreviewPresentation,
} from '@agiworkforce/types';
import {
  Share2,
  Bell,
  X as XIcon,
  Settings,
  ChevronUp,
  ChevronRight,
  CreditCard,
  Download,
  HelpCircle,
  Keyboard,
  Globe,
  LogOut,
  FolderOpen,
  LibraryBig,
  CalendarClock,
} from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { useShareConversation } from '../hooks/use-share-conversation';
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import type { KeyboardShortcut } from '../hooks/use-keyboard-shortcuts';
import {
  Sidebar,
  type SidebarSession,
  type SidebarNavItem,
  type SidebarProject,
} from '@agiworkforce/ui';
import { useClerk } from '@clerk/nextjs';
import { useAuthStore } from '@shared/stores/authentication-store';
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
import { ChatMessageList } from '../components/messages/ChatMessageList';
import { ChatComposerNew } from '../components/Composer/ChatComposerNew';
import { GreetingBanner } from '../components/GreetingBanner/GreetingBanner';
import { SidebarWordmark } from '@shared/components/agi/SidebarWordmark';
import { ConversationTitleMenu } from '../components/ConversationTitleMenu';
import { ArtifactsPanel, ArtifactsToggleButton } from '../components/artifacts/ArtifactsPanel';
import { ResearchPanel, ResearchToggleButton } from '../components/research/ResearchPanel';
import { CreateProjectDialog } from '../components/dialogs/CreateProjectDialog';
import { UpgradePlanDialog } from '../components/dialogs/UpgradePlanDialog';
import { toast } from 'sonner';
import { upgradeToProPlan, upgradeToMaxPlan } from '@features/billing/services/stripe-payments';
import {
  buildAcceptedHandoffSystemMessage,
  buildHandoffContextCandidates,
  buildWebLocalToByokPreview,
  shouldForkLocalToByok,
  type WebHandoffContextCandidate,
  type WebLocalToByokPreview,
} from '../lib/localByokHandoff';
import { getRegenerateReplayDecision, replayToSendOptions } from '../lib/regenerateReplay';
import {
  planEditRollback,
  planRegenerateRollback,
  consumePendingEdit,
  type PendingEditRollback,
} from '../lib/pendingEdit';
import { isStaleActiveConversation } from '../lib/staleActiveConversation';
import type { Message, MessageMetadata } from '@/stores/chatStore';
import { LocalByokHandoffDialog, type ChatMessage } from '@agiworkforce/unified-chat';
import { countWebSearchSources, type WebChatMessageMetadata } from '../types/message-metadata';
import { getFreeTrialRemaining, useFreeTrialStore } from '../stores/freeTrialStore';
import { cn } from '@shared/lib/utils';
import {
  useManagedCloudProjects,
  useProjectStore,
  ProjectSettingsDialog,
} from '@features/projects';
import { webManagedCloudProjects } from '@features/projects/services/managed-cloud-projects';
import { useMediaGeneration } from '@/lib/hooks/useMediaGeneration';
import { classifyTaskLocally } from '@agiworkforce/routing';
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_MODELS,
  type ImageAspectRatio,
} from '../components/Composer/ChatComposerNew';

type SendMeta = {
  /** Composer work mode at send time ('chat' | 'agiwork'). */
  workMode?: string;
  /** Project scoping the send; threads into createConversation → project_id. */
  projectId?: string | null;
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  /** Deep Research mode: server injects research system prompt and forces web search. */
  researchEnabled?: boolean;
  /** Output style hint (concise / formal / explanatory / normal). Omitted = normal. */
  styleMode?: string;
  /** Skill body to inject as a system message in the LLM request. */
  skillBody?: string;
  /** Display name of the active skill, forwarded for timeline step labeling. */
  skillName?: string;
};

type PendingByokHandoff = {
  sourceConversationId: string;
  conversationTitle: string;
  content: string;
  attachments?: File[];
  meta?: SendMeta;
  candidates: WebHandoffContextCandidate[];
};

function toChatMessage(m: Message, conversationId: string): ChatMessage {
  const thinkingContent = m.metadata?.thinkingContent;
  // MessageBubble renders `thinkingContent` as a ThinkingBlock above the
  // message AND (separately) a "Thinking process" collapsible from
  // `thinkingSteps`. Previously this derived thinkingSteps=[thinkingContent]
  // whenever thinkingContent was set, so the same reasoning text rendered
  // twice. Only pass through thinkingSteps when it's the model's own
  // distinct multi-step breakdown (no thinkingContent present) — when
  // thinkingContent exists, ThinkingBlock already owns showing it.
  const thinkingSteps = thinkingContent ? undefined : m.metadata?.thinkingSteps;
  const metadata: Record<string, unknown> | undefined =
    m.metadata || m.model
      ? {
          ...m.metadata,
          model: m.model ?? m.metadata?.model,
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

async function patchConversationMessageReaction(params: {
  conversationId: string;
  messageId: string;
  reaction: 'thumbsUp' | 'thumbsDown' | null;
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
      body: JSON.stringify({ reaction: params.reaction }),
    },
  );

  if (!response.ok) {
    throw new Error(await readChatMutationError(response, 'Failed to update reaction'));
  }
}

export default function WebChatPage() {
  // Core chat UI previously had zero i18n coverage — every string, including
  // the composer placeholder, was hardcoded English even though full
  // translation resources already exist (app/i18n/locales/*). Wire the most
  // visible strings through the existing 'chat' and 'common' namespaces.
  const { t, i18n } = useTranslation(['chat', 'common']);
  const { getToken, isLoaded: authLoaded } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const urlConversationId = params?.['sessionId'] as string | undefined;
  const highlightMessageId = searchParams?.get('highlightMessage') ?? null;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  // Model from the model store · needed by the access gate below before the composer hooks.
  const availableModels = useModelStore((s) => s.availableModels);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const subscriptionTier = useBillingStore((s) => s.subscription?.tier ?? 'free');
  const isWebsiteFreeTrial = subscriptionTier === 'free';
  const freeTrialModelId = getBestAutoModeForTier('free');
  const activeModelId =
    isWebsiteFreeTrial && !FREE_TRIAL_MODELS.includes(selectedModelId)
      ? freeTrialModelId
      : selectedModelId;
  const selectedModel = availableModels.find((m) => m.id === activeModelId);
  const trialPromptsUsed = useFreeTrialStore((s) => s.promptsUsed);
  const trialPromptLimit = useFreeTrialStore((s) => s.promptLimit);
  const trialPromptsRemaining = getFreeTrialRemaining(trialPromptsUsed, trialPromptLimit);
  const isTrialExhausted = isWebsiteFreeTrial && trialPromptsRemaining <= 0;

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
  // later messages) is DEFERRED to the actual resubmission via sendContent.
  // Deleting on edit-click lost the messages permanently if the user abandoned
  // the edit. `deletePersistedMessagesRef` bridges the definition-order gap:
  // sendContent is declared long before deletePersistedMessages.
  const pendingEditRollbackRef = useRef<PendingEditRollback | null>(null);
  const deletePersistedMessagesRef = useRef<((ids: string[]) => Promise<boolean>) | null>(null);

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
  // DOUBLE-SUBMIT GUARD (streaming/approval cluster Finding 7): this ref also
  // now doubles as sendContent's reentrancy guard, mirroring mobile's
  // ChatInput.tsx `sendPendingRef` -- ChatComposerNew's own `isLoading || disabled`
  // check in handleSubmit only blocks a SECOND click once the store's
  // `isLoading` has round-tripped through a React render, but `sendContent` is
  // an async function whose body (including the `isSendingRef.current = true`
  // set below) runs SYNCHRONOUSLY up to its first `await` -- so checking this
  // ref at the very top closes the double-submit window with zero render
  // latency, exactly like a synchronous ref check, without needing a second
  // ref in the composer.
  const isSendingRef = useRef(false);

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

  // Dialog state — lifted from ChatSidebar so they live at the page level and
  // work with the shared <Sidebar> component (which has no dialog state).
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);

  // Project settings dialog state (opened from sidebar row context menu)
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);

  // Web-specific hooks for the sidebar footer slot.
  const { signOut: clerkSignOut } = useClerk();
  const { user, logout } = useAuthStore();
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

  // Streaming send + store state
  const { sendMessage, stopGeneration, continueGeneration, isStreaming, resolveToolApproval } =
    useChatStream();

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
    async (plan: 'pro' | 'max', annual: boolean) => {
      if (!user) {
        toast.error('Please sign in to upgrade.');
        return;
      }
      setUpgradePlanOpen(false);
      const billingPeriod = annual ? 'yearly' : 'monthly';
      const toastId = toast.loading('Redirecting to checkout...');
      try {
        const args = { userId: user.id, userEmail: user.email || '', billingPeriod } as const;
        if (plan === 'pro') {
          await upgradeToProPlan(args);
        } else {
          await upgradeToMaxPlan(args);
        }
        // On success the service redirects to Stripe; the dismiss below only
        // runs if navigation has not yet replaced the page.
        toast.dismiss(toastId);
      } catch (err) {
        toast.dismiss(toastId);
        toast.error(err instanceof Error ? err.message : 'Failed to start checkout.');
      }
    },
    [user],
  );

  const messages = useChatStore((s) => s.messages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const isLoading = useChatStore((s) => s.isLoading);
  const chatError = useChatStore((s) => s.error);
  const setChatError = useChatStore((s) => s.setError);

  // SendPreview presentation · privacy-disclosure card rendered above the
  // composer so users always see where the next turn is going (local device,
  // BYOK provider host, or AGI managed gateway) before they send.
  const sendPreviewPresentation = useMemo<SendPreviewPresentation>(() => {
    const providerMode: ProviderMode = 'ManagedGateway';
    return summarizeSendPreview({
      providerMode,
      modelLabel: selectedModel?.name ?? undefined,
      modelId: activeModelId,
      // User-facing label only — never leak the internal gateway hostname.
      destinationHost: 'AGI managed cloud',
    });
  }, [activeModelId, selectedModel]);

  // Conversation CRUD
  const {
    conversations,
    createConversation,
    loadConversation,
    deleteConversation,
    updateConversation,
    setActiveConversation,
  } = useConversations();

  const displayedConversationId = urlConversationId ?? bareChatSessionId;

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
        isSending: isSendingRef.current,
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
            setBareChatSessionId(null);
            setActiveConversation(null);
            router.replace('/chat');
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
      // already in flight -- see isSendingRef's doc comment above for why this
      // check, positioned before any `await`, is what actually closes the
      // reentrancy window (a rapid double Enter/click otherwise fires two
      // concurrent turns since ChatComposerNew's isLoading-based guard alone
      // has a render-latency gap).
      if (isSendingRef.current) return;

      // Hold the send guard for the entire flow (set BEFORE createConversation,
      // which is the first thing to mutate the store's activeConversationId) so
      // the stale-active reconciler can never null the just-created conversation
      // during the first-message → navigate window. Cleared in `finally`.
      isSendingRef.current = true;
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
        if (!urlConversationId) setBareChatSessionId(convId);

        // Navigate to the canonical /chat/[id] URL after the first message so the
        // conversation is bookmarkable and survives a page refresh. Use replace so
        // the empty /chat entry is removed from browser history.
        if (freshConvId) {
          router.replace(`/chat/${freshConvId}`);
        }

        // Read image files as base64 data URLs so the LLM can process them
        const resolvedAttachments = options.attachments
          ? await Promise.all(
              options.attachments.map(async (f) => {
                let base64Content: string | undefined;
                if (f.type.startsWith('image/')) {
                  base64Content = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(f);
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                  });
                }
                return {
                  id: crypto.randomUUID(),
                  type: f.type.startsWith('image/') ? ('image' as const) : ('file' as const),
                  name: f.name,
                  size: f.size,
                  mimeType: f.type,
                  content: base64Content,
                };
              }),
            )
          : undefined;

        // Deferred edit rollback: if this send is the resubmission of an edited
        // message, delete the original message + everything after it NOW (not on
        // edit-click) so the edited turn replaces the old one. Abandoning the
        // edit never reaches here, so nothing is lost. Best-effort: a failed
        // delete must not block the send.
        const pendingEdit = consumePendingEdit(pendingEditRollbackRef.current, convId);
        if (pendingEdit) {
          pendingEditRollbackRef.current = null;
          await deletePersistedMessagesRef.current?.(pendingEdit.rollbackIds);
        }

        await sendMessage(content, {
          model: activeModelId,
          conversationId: convId,
          attachments: resolvedAttachments,
          webSearch: options.meta?.webSearchEnabled,
          // Search implies fetch (ChatGPT/Claude parity): with Search on, the model
          // can also open URLs — Anthropic via its native web_fetch server tool,
          // other providers via the platform url_fetch tool in the agentic loop.
          webFetch: options.meta?.webSearchEnabled,
          thinkingEnabled: options.meta?.thinkingEnabled,
          codeExecution: options.meta?.codeExecutionEnabled,
          research: options.meta?.researchEnabled,
          styleMode: options.meta?.styleMode,
          skillBody: options.meta?.skillBody,
          skillName: options.meta?.skillName,
        });
      } finally {
        // Release the guard once the send has fully settled (or bailed). By now
        // `bareChatSessionId`/`urlConversationId` reflect the real conversation,
        // so the reconciler reads a consistent displayed id and never misfires.
        isSendingRef.current = false;
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
    ],
  );

  const { generateImage } = useMediaGeneration();

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

  // Shared paywall/error helper
  const applyImageError = useCallback(
    (msgId: string, raw: string) => {
      const isPaywall =
        raw.includes('403') ||
        raw.includes('plan_upgrade_required') ||
        raw.includes('subscription_required');
      updateMessage(msgId, {
        isStreaming: false,
        content: isPaywall ? '' : `Image generation failed: ${raw}`,
        metadata: isPaywall
          ? {
              paywall: {
                feature: 'image_generation',
                requiredTier: 'pro',
                reason:
                  'Image generation requires a Pro or higher plan. Upgrade to generate images.',
              },
            }
          : undefined,
      });
    },
    [updateMessage],
  );

  // ---------------------------------------------------------------------------
  // handleGenerateImage – called by composer; injects user + assistant messages
  // ---------------------------------------------------------------------------
  const handleGenerateImage = useCallback(
    (prompt: string, options: { aspectRatio: ImageAspectRatio; modelId: string }) => {
      // Same first-message send guard as sendContent: a lazy-created image
      // conversation has the identical createConversation → bareChatSessionId
      // gap that the stale-active reconciler would otherwise misread and clear.
      isSendingRef.current = true;
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
          const userMessageId = crypto.randomUUID();
          addMessage({
            id: userMessageId,
            role: 'user',
            content: prompt,
            createdAt: new Date().toISOString(),
          });
          if (!isTemporaryConversation) {
            void persistImageGenerationUserMessage({
              conversationId: convId,
              messageId: userMessageId,
              content: prompt,
              getAuthToken,
              updateMessage,
            });
          }

          // Placeholder assistant message while generating (isStreaming = true → state A)
          const assistantMsgId = crypto.randomUUID();
          addMessage({
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
          });

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
            updateMessage(assistantMsgId, {
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
                updateMessage,
              });
            }
          } catch (err) {
            applyImageError(assistantMsgId, err instanceof Error ? err.message : String(err));
          }
        } finally {
          isSendingRef.current = false;
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

      // Mark as regenerating (state A again)
      updateMessage(messageId, {
        isStreaming: true,
        metadata: {
          toolType: 'image-generation',
          imageUrl: undefined,
          imageGenPrompt: opts.prompt,
          imageGenAspect: opts.aspectRatio,
          imageGenModel: opts.modelId,
        },
      });

      const imageUrl = await generateImage(opts.prompt, { size, provider, model: opts.modelId });
      const finalMetadata: MessageMetadata = {
        toolType: 'image-generation',
        imageUrl,
        imageGenPrompt: opts.prompt,
        imageGenAspect: opts.aspectRatio,
        imageGenModel: opts.modelId,
      };
      updateMessage(messageId, {
        isStreaming: false,
        metadata: finalMetadata,
      });

      // WEB-IMAGE-CHAT-PERSISTENCE-01: this updates an EXISTING assistant
      // message in place, so persist via the same message id — the route is
      // idempotent on client-supplied id (ON CONFLICT), so this upserts the
      // row saved when the image was first generated instead of duplicating it.
      const convId = displayedConversationId;
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
            updateMessage,
          });
        }
      }

      return imageUrl;
    },
    [resolveImageParams, updateMessage, generateImage, displayedConversationId, getToken],
  );

  const handleSend = useCallback(
    (content: string, attachments?: File[], skillId?: string, meta?: SendMeta): false | void => {
      void skillId; // skill identity resolved; body is carried in meta.skillBody

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

      const sourceConversationId = displayedConversationId;
      const conversation = displayedConversation;

      const webLocalToByokHandoffEnabled = false;
      if (
        webLocalToByokHandoffEnabled &&
        sourceConversationId &&
        shouldForkLocalToByok({
          conversation,
          messages: displayedMessages,
          targetModelId: activeModelId,
        })
      ) {
        const candidates = buildHandoffContextCandidates({
          conversationId: sourceConversationId,
          messages: displayedMessages,
          outgoingContent: content,
        });
        setPendingByokHandoff({
          sourceConversationId,
          conversationTitle: conversation?.title ?? 'Local conversation',
          content,
          attachments,
          meta,
          candidates,
        });
        setSelectedHandoffContextIds(candidates.map((candidate) => candidate.id));
        setHandoffPreview(null);
        setHandoffError(null);
        return false;
      }

      if (attachments?.some((file) => !file.type.startsWith('image/'))) {
        handleOpenUpgradeDialog();
        return false;
      }

      void sendContent(content, { attachments, meta });
    },
    [
      displayedConversation,
      displayedConversationId,
      displayedMessages,
      activeModelId,
      handleGenerateImage,
      handleOpenUpgradeDialog,
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
    isSendingRef.current = true;

    try {
      const fork = await createConversation(
        `${pendingByokHandoff.conversationTitle} (BYOK fork)`,
        activeModelId,
      );
      if (!fork) throw new Error('Could not create BYOK fork conversation.');

      const metadata: MessageMetadata = {
        privacyMode: 'byok',
        providerMode: 'DirectByok',
        handoffDraftId: handoffPreview.draft.id,
        handoffPreviewHashSha256: handoffPreview.draft.previewHashSha256,
        handoffSourceConversationId: pendingByokHandoff.sourceConversationId,
      };
      const systemMessage = await saveSystemMessage({
        conversationId: fork.id,
        content: buildAcceptedHandoffSystemMessage(handoffPreview),
        metadata,
        authToken: await getToken().then((token) => {
          if (!token) throw new Error('Not authenticated');
          return token;
        }),
      });

      addMessage(systemMessage);
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
      // The dispatched sendContent (conversationId already set) manages its own
      // guard from here; the fork's create→navigate window is now closed.
      isSendingRef.current = false;
    }
  }, [
    addMessage,
    createConversation,
    getToken,
    handoffPreview,
    pendingByokHandoff,
    router,
    activeModelId,
    sendContent,
  ]);

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    setBareChatSessionId(null);
    setComposerPrefill(undefined);
    setComposerClearSignal((value) => value + 1);
    // Global "New chat" starts unscoped. Project-scoped new chats go through
    // the sidebar project row (/chat?projectId=...) or the composer picker.
    setActiveProject(null);
    router.push('/chat');
  }, [router, setActiveConversation, setActiveProject]);

  const handleToggleSidebar = useCallback(
    () => setSidebarCollapsed((c) => !c),
    [setSidebarCollapsed],
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
      router.push(`/projects/${projectId}`);
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
   * Share project: there is no dedicated project-share API yet, so route to the
   * project page where the share affordance lives. Tracked as a follow-up gap.
   */
  const handleProjectShare = useCallback(
    (projectId: string) => {
      router.push(`/projects/${projectId}`);
    },
    [router],
  );

  /**
   * Pin/unpin: toggle the starred field on the project (starred is the pinned proxy).
   */
  const handleProjectPin = useCallback(
    (projectId: string) => {
      const project = storeProjects.find((p) => p.id === projectId);
      if (!project) return;
      updateProjectInStore(projectId, { starred: !project.starred });
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

      const authToken = await getToken();
      if (!authToken) {
        setChatError('Not authenticated');
        return false;
      }

      try {
        for (const messageId of ids) {
          await deleteConversationMessage({
            conversationId: displayedConversationId,
            messageId,
            authToken,
          });
          deleteMessage(messageId);
        }
        return true;
      } catch (error) {
        setChatError(error instanceof Error ? error.message : 'Failed to delete message');
        return false;
      }
    },
    [deleteMessage, displayedConversationId, getToken, setChatError],
  );

  // Bridge the latest deletePersistedMessages to the send path (sendContent is
  // declared earlier and can't reference this const directly). Render-time ref
  // assignment is idempotent and always reflects the current closure.
  deletePersistedMessagesRef.current = deletePersistedMessages;

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
      deleteMessage(id);
    },
    [deleteMessage],
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
        setChatError(replayDecision.message);
        return;
      }
      const rollbackIds = plan.rollbackIds;
      const deleted = await deletePersistedMessages(rollbackIds);
      if (deleted) {
        const replayOptions = replayToSendOptions(replayDecision.replay);
        await sendMessage(userMsg.content, {
          model: activeModelId,
          conversationId: displayedConversationId,
          attachments: userMsg.attachments,
          ...replayOptions,
        });
      }
    },
    [
      displayedConversationId,
      displayedMessages,
      isStreaming,
      deletePersistedMessages,
      sendMessage,
      activeModelId,
      isTrialExhausted,
      handleOpenUpgradeDialog,
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
      const authToken = await getToken();
      if (!authToken) {
        setChatError('Not authenticated');
        return;
      }

      const reaction =
        reactionType === 'up' ? 'thumbsUp' : reactionType === 'down' ? 'thumbsDown' : null;

      try {
        await patchConversationMessageReaction({
          conversationId: displayedConversationId,
          messageId: id,
          reaction,
          authToken,
        });
        const current = useChatStore.getState().messages.find((message) => message.id === id);
        updateMessage(id, {
          metadata: {
            ...current?.metadata,
            reaction,
          },
        });
      } catch (error) {
        setChatError(error instanceof Error ? error.message : 'Failed to update reaction');
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
  const isEmptyChat = !displayedConversationId || (chatMessages.length === 0 && !isLoading);

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
  const sidebarShortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      {
        key: 'K',
        ctrl: true,
        meta: true,
        action: () => setSearchDialogOpen(true),
        description: 'Open search',
        category: 'navigation' as const,
      },
      {
        key: '/',
        ctrl: true,
        meta: true,
        action: () => setKeyboardShortcutsOpen(true),
        description: 'Show keyboard shortcuts',
        category: 'ui' as const,
      },
      {
        key: 'N',
        ctrl: true,
        meta: true,
        action: handleNewChat,
        description: 'New conversation',
        category: 'conversation' as const,
      },
      {
        key: 'B',
        ctrl: true,
        meta: true,
        action: handleToggleSidebar,
        description: 'Toggle sidebar',
        category: 'ui' as const,
      },
    ],
    [handleNewChat, handleToggleSidebar],
  );

  // Single-Chat-tab nav. The rail body already renders the chat list (Recents) and the
  // project folders, so 'Chats' and 'Projects' route-nav items would be redundant
  // competing destinations — removed. 'Artifacts' was already removed (it linked to the
  // /gallery marketing page; artifacts open via the header ArtifactsToggleButton).
  // Skills, Plugins, and Connectors now live in ONE place — the Settings modal — so the
  // single 'Customize' entry opens that modal instead of navigating to /customize or a
  // separate Directory modal (both removed).
  const sidebarNavItems = useMemo<SidebarNavItem[]>(
    () => [
      // Persistent Projects entry (claude.ai parity). The Projects *section* in
      // the sidebar body only renders once the user has at least one project, so
      // a zero-project user previously had NO way to reach /projects. This nav
      // link is always present.
      {
        id: 'projects',
        label: 'Projects',
        icon: FolderOpen,
        onClick: () => router.push('/projects'),
        isActive: false,
      },
      // Library — browse generated files without scrolling back to their
      // origin message (ChatGPT-Library / mobile-LibraryScreen parity).
      {
        id: 'library',
        label: 'Library',
        icon: LibraryBig,
        onClick: () => router.push('/library'),
        isActive: false,
      },
      {
        id: 'schedules',
        label: 'Schedules',
        icon: CalendarClock,
        onClick: () => router.push('/schedules'),
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

  // Billing tier label for the user profile footer.
  const tierLabel = useMemo(() => {
    const tier = subscription?.tier ?? 'free';
    if (tier === 'free') return 'Free';
    if (tier === 'hobby') return 'Hobby';
    if (tier === 'pro') return 'Pro';
    if (tier === 'max') return 'Max';
    if (tier === 'enterprise') return 'Enterprise';
    return null;
  }, [subscription?.tier]);

  const handleLogout = useCallback(async () => {
    await logout();
    await clerkSignOut({ redirectUrl: '/login' });
  }, [clerkSignOut, logout]);

  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const userInitial = displayName.charAt(0).toUpperCase();
  const currentTier = subscription?.tier ?? 'free';

  // footerSlot: web-specific account menu + free-plan nudge.
  const sidebarFooterSlot = (
    <div className="w-full">
      {/* Free plan nudge */}
      {currentTier === 'free' && (
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
            className="flex w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
              {user?.email && (
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
          {user?.email && (
            <>
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => router.push('/settings/general')}>
            <Settings className="mr-2 h-4 w-4" />
            {t('common:settings')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe className="mr-2 h-4 w-4" />
              Language
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
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
            Get help
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleOpenUpgradeDialog}>
            <CreditCard className="mr-2 h-4 w-4" />
            Upgrade
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/download')}>
            <Download className="mr-2 h-4 w-4" />
            Get apps and extensions
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setKeyboardShortcutsOpen(true)}>
            <Keyboard className="mr-2 h-4 w-4" />
            Keyboard shortcuts
            <span className="ml-auto text-[10px] text-muted-foreground">?</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void handleLogout()}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
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
        shortcuts={sidebarShortcuts}
      />

      {/* Sidebar — @agiworkforce/ui shared component */}
      <Sidebar
        sessions={sidebarSessions}
        projects={sidebarProjects}
        activeSessionId={displayedConversationId ?? undefined}
        collapsed={effectiveSidebarCollapsed}
        isMobile={isNarrowViewport}
        isLoading={isLoading && conversations.length === 0}
        error={conversations.length === 0 ? chatError : null}
        mode="cloud"
        headerSlot={<SidebarWordmark />}
        onNewChat={handleNewChat}
        onToggleCollapse={handleToggleSidebar}
        onOpenSearch={handleOpenSearch}
        navItems={sidebarNavItems}
        footerSlot={sidebarFooterSlot}
        onSelect={handleSelectSession}
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
        onProjectShare={handleProjectShare}
        onProjectPin={handleProjectPin}
        onProjectDelete={handleProjectDelete}
        onProjectCreate={handleProjectCreate}
        className="bg-[var(--chat-sidebar-bg)] border-[var(--chat-border-strong)]"
      />

      {/* Main area + artifact workbench */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            className={cn(
              'relative flex h-11 shrink-0 items-center justify-between px-4',
              isEmptyChat
                ? 'border-b border-transparent'
                : 'border-b border-[var(--chat-border-subtle)]',
            )}
          >
            <div className="flex items-center gap-1">
              {hasMessages && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void share()}
                  disabled={isSharing}
                  className="gap-1.5"
                  aria-label="Share conversation"
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden text-xs sm:inline">Share</span>
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
                />
              )}

            <div className="flex items-center gap-1.5">
              <ResearchToggleButton count={researchSourceCount} />
              <ArtifactsToggleButton />
            </div>
          </div>

          {chatError && (
            <div
              role="alert"
              aria-live="polite"
              className="flex shrink-0 items-start justify-between gap-3 border-b border-red-500/25 bg-red-500/10 px-4 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 break-words text-red-100">{chatError}</span>
              <button
                type="button"
                onClick={() => setChatError(null)}
                className="rounded-md p-1 text-red-200 transition-colors hover:bg-red-500/20 hover:text-white"
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
                  <ChatComposerNew
                    onSend={handleSend}
                    onStop={stopGeneration}
                    isLoading={isLoading}
                    isGenerating={isStreaming}
                    placeholder={t('chat:placeholderEmpty')}
                    prefillText={composerPrefill}
                    onPrefillConsumed={() => setComposerPrefill(undefined)}
                    onTypingChange={handleTypingChange}
                    clearSignal={composerClearSignal}
                    emptyState
                    attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
                    onUpgradeRequest={handleOpenUpgradeDialog}
                    onGenerateImage={handleGenerateImage}
                    projectPicker={composerProjectPicker}
                    freeTrial={{
                      enabled: isWebsiteFreeTrial,
                      promptsUsed: trialPromptsUsed,
                      promptLimit: trialPromptLimit,
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
                    isLoading={isLoading && !isStreaming}
                    isUserTyping={isUserTyping}
                    onRegenerate={handleRegenerateMessage}
                    onContinue={handleContinueMessage}
                    onEdit={handleEditMessage}
                    onDelete={handleDeleteMessage}
                    onReact={handleReactMessage}
                    onRegenerateImage={handleRegenerateImageInPlace}
                    onSendMessage={setComposerPrefill}
                    onPaywallUpgrade={handleOpenUpgradeDialog}
                    onPaywallDismiss={handlePaywallDismiss}
                  />
                </ToolApprovalProvider>
              </div>

              {/* Composer + Send Preview disclosure · docked in normal flow (not
                  absolute) so the banner/composer can never float over and overlap
                  the follow-up suggestions or message content. */}
              <div className="shrink-0 pb-4">
                <div
                  className={cn(
                    'mx-auto w-full max-w-3xl px-4',
                    effectiveSidebarCollapsed ? 'max-w-4xl' : '',
                  )}
                >
                  <ChatComposerNew
                    onSend={handleSend}
                    onStop={stopGeneration}
                    isLoading={isLoading}
                    isGenerating={isStreaming}
                    placeholder={t('chat:placeholder')}
                    prefillText={composerPrefill}
                    onPrefillConsumed={() => setComposerPrefill(undefined)}
                    onTypingChange={handleTypingChange}
                    clearSignal={composerClearSignal}
                    attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
                    onUpgradeRequest={handleOpenUpgradeDialog}
                    onGenerateImage={handleGenerateImage}
                    freeTrial={{
                      enabled: isWebsiteFreeTrial,
                      promptsUsed: trialPromptsUsed,
                      promptLimit: trialPromptLimit,
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
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
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useChatStream } from '@/lib/hooks/useChatStream';
import { useConversations } from '@/lib/hooks/useConversations';
import { useChatStore } from '@/stores/chatStore';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useModelStore } from '@shared/stores/model-store';
import { useBillingStore } from '@/stores/unified/auth';
import { getBestAutoModeForTier } from '@/constants/llm';
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
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@shared/ui/dropdown-menu';
import { useSettingsModal } from '@features/settings/components/SettingsModalProvider';
import { GlobalSearchDialog } from '../components/dialogs/GlobalSearchDialog';
import { KeyboardShortcutsDialog } from '../components/dialogs/KeyboardShortcutsDialog';
import { ChatMessageList } from '../components/messages/ChatMessageList';
import { ChatComposerNew } from '../components/Composer/ChatComposerNew';
import { GreetingBanner } from '../components/GreetingBanner/GreetingBanner';
import { ArtifactsPanel, ArtifactsToggleButton } from '../components/artifacts/ArtifactsPanel';
import { ResearchPanel, ResearchToggleButton } from '../components/research/ResearchPanel';
import { CloudUpgradeWaitlistDialog } from '../components/dialogs/CloudUpgradeWaitlistDialog';
import { CreateProjectDialog } from '../components/dialogs/CreateProjectDialog';
import { UpgradePlanDialog } from '../components/dialogs/UpgradePlanDialog';
import { LocalByokHandoffDialog } from '../components/dialogs/LocalByokHandoffDialog';
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
import type { Message, MessageMetadata } from '@/stores/chatStore';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { countWebSearchSources, type WebChatMessageMetadata } from '../types/message-metadata';
import { getFreeTrialRemaining, useFreeTrialStore } from '../stores/freeTrialStore';
import { cn } from '@shared/lib/utils';
import { useProjectStore, ProjectSettingsDialog, type Project } from '@features/projects';
import { useMediaGeneration } from '@/lib/hooks/useMediaGeneration';
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_MODELS,
  type ImageAspectRatio,
} from '../components/Composer/ChatComposerNew';

type SendMeta = {
  agentMode?: string;
  folderId?: string | null;
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
  const thinkingSteps = thinkingContent ? [thinkingContent] : m.metadata?.thinkingSteps;
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
  const { getToken, isLoaded: authLoaded } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const urlConversationId = params?.['sessionId'] as string | undefined;
  const highlightMessageId = searchParams?.get('highlightMessage') ?? null;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
  const [cloudWaitlistOpen, setCloudWaitlistOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
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
  const storeProjects = useProjectStore((s) => s.projects);
  const updateProjectInStore = useProjectStore((s) => s.updateProject);
  const removeProjectFromStore = useProjectStore((s) => s.removeProject);
  const setStoreProjects = useProjectStore((s) => s.setProjects);

  // Hydrate the project store from the server once on mount. The store is
  // otherwise localStorage-only, so server-side projects (user_projects) never
  // appeared in the sidebar. Merge server rows with any local-only projects,
  // server winning on id conflicts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/projects?limit=100', { credentials: 'same-origin' });
        if (!res.ok) return;
        const json = (await res.json()) as { projects?: Project[] };
        const serverProjects = Array.isArray(json.projects) ? json.projects : [];
        if (cancelled || serverProjects.length === 0) return;
        const serverIds = new Set(serverProjects.map((p) => p.id));
        const localOnly = useProjectStore.getState().projects.filter((p) => !serverIds.has(p.id));
        setStoreProjects([...serverProjects, ...localOnly]);
      } catch {
        // Non-fatal: sidebar simply shows whatever is already in the store.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setStoreProjects]);

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
  const { sendMessage, stopGeneration, isStreaming } = useChatStream();

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

  const handleOpenCloudWaitlist = useCallback(() => {
    // Open the richer plan-comparison modal first; its "Join waitlist" CTA
    // chains to the existing CloudUpgradeWaitlistDialog.
    setUpgradePlanOpen(true);
  }, []);

  const handleOpenWaitlistDirect = useCallback(() => {
    setCloudWaitlistOpen(true);
  }, []);

  const messages = useChatStore((s) => s.messages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const updateConversationInStore = useChatStore((s) => s.updateConversation);
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
      let freshConvId: string | null = null;
      const convId =
        options.conversationId ||
        urlConversationId ||
        bareChatSessionId ||
        (await createConversation('New Chat', activeModelId).then((c) => {
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
        thinkingEnabled: options.meta?.thinkingEnabled,
        codeExecution: options.meta?.codeExecutionEnabled,
        research: options.meta?.researchEnabled,
        styleMode: options.meta?.styleMode,
        skillBody: options.meta?.skillBody,
        skillName: options.meta?.skillName,
      });
    },
    [urlConversationId, bareChatSessionId, createConversation, sendMessage, activeModelId, router],
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
      void (async () => {
        const { size, provider } = resolveImageParams(options.aspectRatio, options.modelId);

        // Ensure a conversation exists (lazy-create, same pattern as sendContent).
        let convId = displayedConversationId;
        if (!convId) {
          const fresh = await createConversation('Image generation', activeModelId);
          if (fresh) {
            convId = fresh.id;
            if (!urlConversationId) setBareChatSessionId(fresh.id);
            router.replace(`/chat/${fresh.id}`);
          }
        }
        if (!convId) return;

        // User message (prompt)
        addMessage({
          id: crypto.randomUUID(),
          role: 'user',
          content: prompt,
          createdAt: new Date().toISOString(),
        });

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
          const imageUrl = await generateImage(prompt, { size, provider, model: options.modelId });
          updateMessage(assistantMsgId, {
            content: '',
            isStreaming: false,
            metadata: {
              toolType: 'image-generation',
              imageUrl,
              imageGenPrompt: prompt,
              imageGenAspect: options.aspectRatio,
              imageGenModel: options.modelId,
            },
          });
        } catch (err) {
          applyImageError(assistantMsgId, err instanceof Error ? err.message : String(err));
        }
      })();
    },
    [
      resolveImageParams,
      displayedConversationId,
      urlConversationId,
      createConversation,
      activeModelId,
      addMessage,
      updateMessage,
      generateImage,
      applyImageError,
      router,
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
      updateMessage(messageId, {
        isStreaming: false,
        metadata: {
          toolType: 'image-generation',
          imageUrl,
          imageGenPrompt: opts.prompt,
          imageGenAspect: opts.aspectRatio,
          imageGenModel: opts.modelId,
        },
      });
      return imageUrl;
    },
    [resolveImageParams, updateMessage, generateImage],
  );

  const handleSend = useCallback(
    (content: string, attachments?: File[], skillId?: string, meta?: SendMeta): false | void => {
      void skillId; // skill identity resolved; body is carried in meta.skillBody
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
        handleOpenCloudWaitlist();
        return false;
      }

      void sendContent(content, { attachments, meta });
    },
    [
      displayedConversation,
      displayedConversationId,
      displayedMessages,
      activeModelId,
      handleOpenCloudWaitlist,
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
    router.push('/chat');
  }, [router, setActiveConversation]);

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
    setCreateProjectOpen(true);
  }, []);

  /**
   * Delete project from the store after an explicit confirmation so a stray
   * click in the ... menu can never silently drop a project.
   */
  const handleProjectDelete = useCallback(
    (projectId: string) => {
      const project = storeProjects.find((p) => p.id === projectId);
      const label = project?.name ? `"${project.name}"` : 'this project';
      if (
        typeof window !== 'undefined' &&
        !window.confirm(`Delete ${label}? This can't be undone.`)
      ) {
        return;
      }
      removeProjectFromStore(projectId);
    },
    [storeProjects, removeProjectFromStore],
  );

  // Project settings dialog derived data
  const projectForSettings = useMemo(
    () => (projectSettingsId ? storeProjects.find((p) => p.id === projectSettingsId) : null),
    [projectSettingsId, storeProjects],
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
      // Star is client-side only (no DB column). Toggle via store directly.
      const convo = conversations.find((c) => c.id === id);
      if (!convo) return;
      updateConversationInStore(id, { isStarred: !convo.isStarred });
    },
    [conversations, updateConversationInStore],
  );

  const handleArchiveSession = useCallback(
    (id: string) => {
      // Archive is client-side only (no DB column). Toggle via store directly.
      const convo = conversations.find((c) => c.id === id);
      if (!convo) return;
      updateConversationInStore(id, { isArchived: !convo.isArchived });
    },
    [conversations, updateConversationInStore],
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
        handleOpenCloudWaitlist();
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
      handleOpenCloudWaitlist,
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
        handleOpenCloudWaitlist();
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
      handleOpenCloudWaitlist,
      setChatError,
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
      {
        id: 'customize',
        label: 'Customize',
        icon: Settings,
        onClick: () => openSettings('skills'),
        isActive: false,
      },
    ],
    [openSettings],
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
              onClick={handleOpenCloudWaitlist}
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
          <DropdownMenuItem onClick={() => router.push('/settings/general')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe className="mr-2 h-4 w-4" />
              Language
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuItem disabled>English</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => router.push('/help')}>
            <HelpCircle className="mr-2 h-4 w-4" />
            Get help
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleOpenCloudWaitlist}>
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
        collapsed={sidebarCollapsed}
        mode="cloud"
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

            {/* Conversation title - centered in header when in an active chat */}
            {activeConversationTitle && activeConversationTitle !== 'New Chat' && (
              <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 max-w-[40%] truncate text-sm font-medium text-[var(--chat-text-secondary)]">
                {activeConversationTitle}
              </h1>
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
                    placeholder="How can I help you today?"
                    prefillText={composerPrefill}
                    onPrefillConsumed={() => setComposerPrefill(undefined)}
                    onTypingChange={handleTypingChange}
                    clearSignal={composerClearSignal}
                    emptyState
                    attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
                    onUpgradeRequest={handleOpenCloudWaitlist}
                    onGenerateImage={handleGenerateImage}
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
                <ChatMessageList
                  messages={chatMessages}
                  isLoading={isLoading && !isStreaming}
                  isUserTyping={isUserTyping}
                  onRegenerate={handleRegenerateMessage}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                  onReact={handleReactMessage}
                  onRegenerateImage={handleRegenerateImageInPlace}
                  onSendMessage={setComposerPrefill}
                  onPaywallUpgrade={handleOpenCloudWaitlist}
                  onPaywallDismiss={handlePaywallDismiss}
                />
              </div>

              {/* Composer + Send Preview disclosure · docked in normal flow (not
                  absolute) so the banner/composer can never float over and overlap
                  the follow-up suggestions or message content. */}
              <div className="shrink-0 pb-4">
                <div
                  className={cn(
                    'mx-auto w-full max-w-3xl px-4',
                    sidebarCollapsed ? 'max-w-4xl' : '',
                  )}
                >
                  <ChatComposerNew
                    onSend={handleSend}
                    onStop={stopGeneration}
                    isLoading={isLoading}
                    isGenerating={isStreaming}
                    placeholder="How can I help you today?"
                    prefillText={composerPrefill}
                    onPrefillConsumed={() => setComposerPrefill(undefined)}
                    onTypingChange={handleTypingChange}
                    clearSignal={composerClearSignal}
                    attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
                    onUpgradeRequest={handleOpenCloudWaitlist}
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
      <CloudUpgradeWaitlistDialog open={cloudWaitlistOpen} onOpenChange={setCloudWaitlistOpen} />
      <CreateProjectDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} />
      <UpgradePlanDialog
        open={upgradePlanOpen}
        onOpenChange={setUpgradePlanOpen}
        currentTier={currentTier}
        onOpenWaitlist={handleOpenWaitlistDirect}
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

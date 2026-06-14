'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter, useParams } from 'next/navigation';
import { useChatStream } from '@/lib/hooks/useChatStream';
import { useConversations } from '@/lib/hooks/useConversations';
import { useChatStore } from '@/stores/chatStore';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useModelStore } from '@shared/stores/model-store';
import { useBillingStore } from '@/stores/unified/auth';
import { getBestAutoModeForTier } from '@/constants/llm';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { SendPreview } from '@agiworkforce/unified-chat';
import {
  summarizeSendPreview,
  type ProviderMode,
  type SendPreviewPresentation,
} from '@agiworkforce/types';
import { Share2, Bell, X as XIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useShareConversation } from '../hooks/use-share-conversation';
import { useKeyboardShortcuts } from '../hooks/use-keyboard-shortcuts';
import { ChatSidebar } from '../components/Sidebar/ChatSidebar';
import { ChatMessageList } from '../components/messages/ChatMessageList';
import { ChatComposerNew } from '../components/Composer/ChatComposerNew';
import { GreetingBanner } from '../components/GreetingBanner/GreetingBanner';
import { ArtifactsPanel, ArtifactsToggleButton } from '../components/artifacts/ArtifactsPanel';
import { ResearchPanel, ResearchToggleButton } from '../components/research/ResearchPanel';
import { DirectoryModal } from '../components/dialogs/DirectoryModal';
import { CloudUpgradeWaitlistDialog } from '../components/dialogs/CloudUpgradeWaitlistDialog';
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
import type { Message, MessageMetadata } from '@/stores/chatStore';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { countWebSearchSources, type WebChatMessageMetadata } from '../types/message-metadata';
import { getFreeTrialRemaining, useFreeTrialStore } from '../stores/freeTrialStore';
import { cn } from '@shared/lib/utils';

type SendMeta = {
  agentMode?: string;
  folderId?: string | null;
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  /** Output style hint (concise / formal / explanatory / normal). Omitted = normal. */
  styleMode?: string;
  /** Skill body to inject as a system message in the LLM request. */
  skillBody?: string;
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
  const { getToken } = useAuth();
  const router = useRouter();
  const params = useParams();
  const urlConversationId = params?.['sessionId'] as string | undefined;

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
  const [bareChatSessionId, setBareChatSessionId] = useState<string | null>(null);
  const [pendingByokHandoff, setPendingByokHandoff] = useState<PendingByokHandoff | null>(null);
  const [selectedHandoffContextIds, setSelectedHandoffContextIds] = useState<string[]>([]);
  const [handoffPreview, setHandoffPreview] = useState<WebLocalToByokPreview | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [isBuildingHandoff, setIsBuildingHandoff] = useState(false);
  const [isConfirmingHandoff, setIsConfirmingHandoff] = useState(false);
  const [cloudWaitlistOpen, setCloudWaitlistOpen] = useState(false);

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
    setCloudWaitlistOpen(true);
  }, []);

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
  }, [activeConversationId, loadConversation, router, setActiveConversation, urlConversationId]);

  const sendContent = useCallback(
    async (
      content: string,
      options: {
        conversationId?: string;
        attachments?: File[];
        meta?: SendMeta;
      } = {},
    ) => {
      const convId =
        options.conversationId ||
        urlConversationId ||
        bareChatSessionId ||
        (await createConversation('New Chat', activeModelId).then((c) => {
          if (c) {
            if (!urlConversationId) setBareChatSessionId(c.id);
            return c.id;
          }
          return null;
        }));

      if (!convId) return;
      if (!urlConversationId) setBareChatSessionId(convId);

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

      await sendMessage(content, {
        model: activeModelId,
        conversationId: convId,
        attachments: resolvedAttachments,
        webSearch: options.meta?.webSearchEnabled,
        thinkingEnabled: options.meta?.thinkingEnabled,
        codeExecution: options.meta?.codeExecutionEnabled,
        styleMode: options.meta?.styleMode,
        skillBody: options.meta?.skillBody,
      });
    },
    [urlConversationId, bareChatSessionId, createConversation, sendMessage, activeModelId],
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
    window.dispatchEvent(new Event('agi:open-search'));
  }, []);

  const handleOpenShortcuts = useCallback(() => {
    window.dispatchEvent(new Event('agi:open-shortcuts'));
  }, []);

  const handleFocusComposer = useCallback(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-composer-textarea]');
    textarea?.focus();
  }, []);

  // Wire global keyboard shortcuts. Search and keyboard-shortcuts dialogs live
  // inside ChatSidebar, so we dispatch custom events that the sidebar listens
  // for rather than lifting that state to the page level.
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
      const deleted = await deleteConversation(id);
      if (!deleted) return;
      if (id === displayedConversationId) {
        setBareChatSessionId(null);
        setActiveConversation(null);
        router.push('/chat');
      }
    },
    [deleteConversation, displayedConversationId, router, setActiveConversation],
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

  const handleDeleteMessage = useCallback(
    (id: string) => {
      void deletePersistedMessages([id]);
    },
    [deletePersistedMessages],
  );

  const handleEditMessage = useCallback(
    async (id: string) => {
      if (!displayedConversationId || isStreaming) return;
      const idx = displayedMessages.findIndex((m) => m.id === id);
      const msg = idx >= 0 ? displayedMessages[idx] : undefined;
      if (!msg || msg.role !== 'user') return;
      if (isTrialExhausted) {
        handleOpenCloudWaitlist();
        return;
      }
      const rollbackIds = displayedMessages.slice(idx).map((message) => message.id);
      const deleted = await deletePersistedMessages(rollbackIds);
      if (deleted) {
        setComposerPrefill(msg.content);
      }
    },
    [
      displayedConversationId,
      displayedMessages,
      isStreaming,
      deletePersistedMessages,
      isTrialExhausted,
      handleOpenCloudWaitlist,
    ],
  );

  const handleRegenerateMessage = useCallback(
    async (id: string) => {
      if (!displayedConversationId || isStreaming) return;
      const idx = displayedMessages.findIndex((m) => m.id === id);
      if (idx <= 0) return;
      // Find the user message just before this one
      let userMsg: (typeof displayedMessages)[0] | undefined;
      for (let i = idx - 1; i >= 0; i--) {
        if (displayedMessages[i]?.role === 'user') {
          userMsg = displayedMessages[i];
          break;
        }
      }
      if (!userMsg) return;
      if (isTrialExhausted) {
        handleOpenCloudWaitlist();
        return;
      }
      const assistantMsg = displayedMessages[idx];
      const replayDecision = getRegenerateReplayDecision({
        userMetadata: userMsg.metadata,
        assistantMetadata: assistantMsg?.metadata,
      });
      if (!replayDecision.ok) {
        setChatError(replayDecision.message);
        return;
      }
      const rollbackIds = displayedMessages.slice(idx).map((message) => message.id);
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

  return (
    <div
      data-chat-theme="cool"
      className="fixed inset-0 flex overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text-primary)]"
    >
      {/* Sidebar */}
      <ChatSidebar
        sessions={conversations}
        activeSessionId={displayedConversationId ?? undefined}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onToggleSidebar={handleToggleSidebar}
        collapsed={sidebarCollapsed}
        onMoveToProjectSession={handleMoveToProjectSession}
        onUpgradeRequest={handleOpenCloudWaitlist}
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
                    clearSignal={composerClearSignal}
                    emptyState
                    attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
                    onUpgradeRequest={handleOpenCloudWaitlist}
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
                  onRegenerate={handleRegenerateMessage}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                  onReact={handleReactMessage}
                  onSendMessage={(text) => setComposerPrefill(text)}
                  onPaywallUpgrade={handleOpenCloudWaitlist}
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
                  <div className="mb-2">
                    <SendPreview presentation={sendPreviewPresentation} />
                  </div>
                  <ChatComposerNew
                    onSend={handleSend}
                    onStop={stopGeneration}
                    isLoading={isLoading}
                    isGenerating={isStreaming}
                    placeholder="How can I help you today?"
                    prefillText={composerPrefill}
                    onPrefillConsumed={() => setComposerPrefill(undefined)}
                    clearSignal={composerClearSignal}
                    attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
                    onUpgradeRequest={handleOpenCloudWaitlist}
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
      <DirectoryModal />
      <CloudUpgradeWaitlistDialog open={cloudWaitlistOpen} onOpenChange={setCloudWaitlistOpen} />
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

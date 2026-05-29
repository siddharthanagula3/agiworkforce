'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter, useParams } from 'next/navigation';
import { useChatStream } from '@/lib/hooks/useChatStream';
import { useConversations } from '@/lib/hooks/useConversations';
import { useChatStore } from '@/stores/chatStore';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useModelStore } from '@shared/stores/model-store';
import { SendPreview } from '@agiworkforce/unified-chat';
import {
  summarizeSendPreview,
  type ProviderMode,
  type SendPreviewPresentation,
} from '@agiworkforce/types';
import { refreshSubscriptionStatus, isSubscriptionValid } from '@/utils/subscription-client';
import { Share2, Bell, X as XIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useShareConversation } from '../hooks/use-share-conversation';
import { ChatSidebar } from '../components/Sidebar/ChatSidebar';
import { GreetingBanner } from '../components/GreetingBanner/GreetingBanner';
import { ChatMessageList } from '../components/messages/ChatMessageList';
import { ChatComposerNew } from '../components/Composer/ChatComposerNew';
import { ArtifactsPanel, ArtifactsToggleButton } from '../components/artifacts/ArtifactsPanel';
import { ResearchPanel, ResearchToggleButton } from '../components/research/ResearchPanel';
import { DirectoryModal } from '../components/dialogs/DirectoryModal';
import { LocalByokHandoffDialog } from '../components/dialogs/LocalByokHandoffDialog';
import {
  buildAcceptedHandoffSystemMessage,
  buildHandoffContextCandidates,
  buildWebLocalToByokPreview,
  shouldForkLocalToByok,
  type WebHandoffContextCandidate,
  type WebLocalToByokPreview,
} from '../lib/localByokHandoff';
import type { Message, MessageMetadata } from '@/stores/chatStore';
import { useChatStore as useUnifiedChatStore } from '@agiworkforce/unified-chat';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import type { WebChatMessageMetadata } from '../types/message-metadata';
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

export default function WebChatPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const params = useParams();
  const urlConversationId = params?.['sessionId'] as string | undefined;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Model from the model store — needed by the access gate below before the composer hooks.
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const selectedModel = useModelStore((s) =>
    s.availableModels.find((m) => m.id === s.selectedModelId),
  );

  // Web chat is subscription-backed managed gateway only. Local and BYOK are
  // desktop/developer-surface trust boundaries, not Web chat modes.
  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      const sub = await refreshSubscriptionStatus();

      if (!cancelled && !isSubscriptionValid(sub)) {
        router.replace('/pricing?from=web-chat');
      }
    }

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
  const messages = useChatStore((s) => s.messages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const addMessage = useChatStore((s) => s.addMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const isLoading = useChatStore((s) => s.isLoading);

  // SendPreview presentation — privacy-disclosure card rendered above the
  // composer so users always see where the next turn is going (local device,
  // BYOK provider host, or AGI managed gateway) before they send.
  const sendPreviewPresentation = useMemo<SendPreviewPresentation>(() => {
    const providerMode: ProviderMode = 'ManagedGateway';
    return summarizeSendPreview({
      providerMode,
      modelLabel: selectedModel?.name ?? undefined,
      modelId: selectedModelId,
      destinationHost: 'gateway.agiworkforce.com',
    });
  }, [selectedModel, selectedModelId]);

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
        (await createConversation('New Chat', selectedModelId).then((c) => {
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
        model: selectedModelId,
        conversationId: convId,
        attachments: resolvedAttachments,
        webSearch: options.meta?.webSearchEnabled,
        thinkingEnabled: options.meta?.thinkingEnabled,
        codeExecution: options.meta?.codeExecutionEnabled,
        styleMode: options.meta?.styleMode,
        skillBody: options.meta?.skillBody,
      });
    },
    [urlConversationId, bareChatSessionId, createConversation, sendMessage, selectedModelId],
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
          targetModelId: selectedModelId,
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

      void sendContent(content, { attachments, meta });
    },
    [
      displayedConversation,
      displayedConversationId,
      displayedMessages,
      selectedModelId,
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
        selectedModelId,
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
    selectedModelId,
    sendContent,
  ]);

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
    setBareChatSessionId(null);
    setComposerPrefill(undefined);
    setComposerClearSignal((value) => value + 1);
    router.push('/chat');
  }, [router, setActiveConversation]);

  const handleSelectSession = useCallback(
    (id: string) => {
      setBareChatSessionId(id);
      void loadConversation(id).then((ok) => {
        if (!ok) {
          setBareChatSessionId(null);
          setActiveConversation(null);
        }
      });
      router.push('/chat');
    },
    [loadConversation, router, setActiveConversation],
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      deleteConversation(id);
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
      updateConversation(id, { title });
    },
    [updateConversation],
  );

  const updateUnifiedConversation = useUnifiedChatStore((s) => s.updateConversation);
  const handleMoveToProjectSession = useCallback(
    (sessionId: string, projectId: string) => {
      updateUnifiedConversation(sessionId, { projectId });
    },
    [updateUnifiedConversation],
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

  const handleDeleteMessage = useCallback(
    (id: string) => {
      deleteMessage(id);
    },
    [deleteMessage],
  );

  const handleEditMessage = useCallback(
    (id: string) => {
      if (!displayedConversationId || isStreaming) return;
      const msg = displayedMessages.find((m) => m.id === id);
      if (!msg || msg.role !== 'user') return;
      setComposerPrefill(msg.content);
      deleteMessage(id);
    },
    [displayedConversationId, displayedMessages, isStreaming, deleteMessage],
  );

  const handleRegenerateMessage = useCallback(
    (id: string) => {
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
      // Remove the assistant message being regenerated, then resend
      deleteMessage(id);
      sendMessage(userMsg.content, {
        model: selectedModelId,
        conversationId: displayedConversationId,
      });
    },
    [
      displayedConversationId,
      displayedMessages,
      isStreaming,
      deleteMessage,
      sendMessage,
      selectedModelId,
    ],
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
  // chatMessages use the unified-chat shape where searchResults is a flat array.
  const researchSourceCount = useMemo(() => {
    let count = 0;
    for (const m of chatMessages) {
      const meta = m.metadata as WebChatMessageMetadata | undefined;
      const sr = meta?.searchResults;
      if (Array.isArray(sr)) {
        count += (sr as Array<{ url?: string }>).filter((r) => r.url).length;
      }
    }
    return count;
  }, [chatMessages]);

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text-primary)]">
      {/* Sidebar */}
      <ChatSidebar
        sessions={conversations}
        activeSessionId={displayedConversationId ?? undefined}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        collapsed={sidebarCollapsed}
        onMoveToProjectSession={handleMoveToProjectSession}
      />

      {/* Main area + artifact workbench */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            className={cn(
              'flex h-11 shrink-0 items-center justify-between px-4',
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
            <div className="flex items-center gap-1.5">
              <ResearchToggleButton count={researchSourceCount} />
              <ArtifactsToggleButton />
            </div>
          </div>

          {/* Notification permission banner — shown during long generations */}
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
              <div className="mx-auto flex h-full w-full max-w-[960px] flex-col items-center justify-center px-6 pb-[8vh]">
                <div className="mb-9">
                  <GreetingBanner onSendMessage={(prompt) => setComposerPrefill(prompt)} />
                </div>
                <div className="w-full max-w-[900px]">
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
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-hidden pb-60">
                <ChatMessageList
                  messages={chatMessages}
                  isLoading={isLoading && !isStreaming}
                  onRegenerate={handleRegenerateMessage}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                  onSendMessage={(text) => setComposerPrefill(text)}
                />
              </div>

              {/* Composer + Send Preview disclosure */}
              <div
                className={cn(
                  'absolute inset-x-0 bottom-5 z-20 mx-auto w-full max-w-3xl px-4',
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
                />
              </div>
            </>
          )}
        </div>
        <ResearchPanel />
        <ArtifactsPanel />
      </div>
      <DirectoryModal />
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

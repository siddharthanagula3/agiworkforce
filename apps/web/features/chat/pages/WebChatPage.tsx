'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { hasByokEnvKeys } from '@/lib/byok-access';
import { Share2 } from 'lucide-react';
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
import { useChatStore as useFeatureChatStore } from '../stores/chat-store';
import type { ChatMessage } from '../stores/chat-store';
import { cn } from '@shared/lib/utils';
import { LOCAL_PROVIDER_KEYS } from '@/lib/byok-access';

type SendMeta = {
  agentMode?: string;
  folderId?: string | null;
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  /** Output style hint (concise / formal / explanatory / normal). Omitted = normal. */
  styleMode?: string;
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
  const metadata =
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
    sessionId: conversationId,
    role: m.role === 'system' ? 'assistant' : m.role,
    content: m.content,
    createdAt: new Date(m.createdAt),
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

  // Pre-emptive access gate: redirect to /byok only when the user has neither
  // an active subscription, a local model selected, nor any BYOK env keys set.
  // BYOK users (plan_tier='free' with env keys) and local-model users must not
  // be redirected -- only truly unconfigured visitors should hit /byok.
  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      const selectedProviderKey = selectedModel?.providerKey ?? '';
      if (LOCAL_PROVIDER_KEYS.has(selectedProviderKey)) return;

      const [sub, byokAvailable] = await Promise.all([
        refreshSubscriptionStatus(),
        hasByokEnvKeys(),
      ]);

      if (!cancelled && !isSubscriptionValid(sub) && !byokAvailable) {
        router.replace('/byok');
      }
    }

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router, selectedModel]);

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
  const [pendingByokHandoff, setPendingByokHandoff] = useState<PendingByokHandoff | null>(null);
  const [selectedHandoffContextIds, setSelectedHandoffContextIds] = useState<string[]>([]);
  const [handoffPreview, setHandoffPreview] = useState<WebLocalToByokPreview | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [isBuildingHandoff, setIsBuildingHandoff] = useState(false);
  const [isConfirmingHandoff, setIsConfirmingHandoff] = useState(false);

  // Streaming send + store state
  const { sendMessage, stopGeneration, isStreaming } = useChatStream();
  const messages = useChatStore((s) => s.messages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const addMessage = useChatStore((s) => s.addMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const isLoading = useChatStore((s) => s.isLoading);

  // SendPreview presentation — privacy-disclosure card rendered above the
  // composer so users always see where the next turn is going (local device,
  // BYOK provider host, or AGI managed gateway) before they send.
  const sendPreviewPresentation = useMemo<SendPreviewPresentation>(() => {
    const providerKey = selectedModel?.providerKey;
    const providerMode: ProviderMode = !providerKey
      ? 'Local'
      : providerKey === 'managed_cloud'
        ? 'ManagedGateway'
        : providerKey === 'local' ||
            providerKey === 'ollama' ||
            providerKey === 'lmstudio' ||
            providerKey === 'executorch' ||
            providerKey === 'llamacpp'
          ? 'Local'
          : 'DirectByok';
    return summarizeSendPreview({
      providerMode,
      modelLabel: selectedModel?.name ?? undefined,
      modelId: selectedModelId,
      destinationHost:
        providerMode === 'Local'
          ? undefined
          : providerKey === 'anthropic'
            ? 'api.anthropic.com'
            : providerKey === 'openai'
              ? 'api.openai.com'
              : providerKey === 'google'
                ? 'generativelanguage.googleapis.com'
                : providerKey === 'managed_cloud'
                  ? 'gateway.agiworkforce.com'
                  : undefined,
    });
  }, [selectedModel, selectedModelId]);

  // Conversation CRUD
  const {
    conversations,
    createConversation,
    loadConversation,
    deleteConversation,
    updateConversation,
  } = useConversations();

  // Share current conversation
  const activeConversationTitle = useMemo(
    () => conversations.find((c) => c.id === activeConversationId)?.title,
    [conversations, activeConversationId],
  );
  const { share, isSharing, hasMessages } = useShareConversation(activeConversationTitle);

  // Session creation guard
  const creationPending = React.useRef(false);

  // On mount: if URL has a conversation ID, load it. Otherwise create one.
  useEffect(() => {
    if (urlConversationId) {
      if (urlConversationId !== activeConversationId) {
        loadConversation(urlConversationId);
      }
    } else if (!activeConversationId && !creationPending.current) {
      creationPending.current = true;
      createConversation('New Chat')
        .then((conv) => {
          if (conv) {
            router.replace(`/chat/${conv.id}`);
          }
        })
        .finally(() => {
          creationPending.current = false;
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlConversationId]);

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
        activeConversationId ||
        (await createConversation('New Chat', selectedModelId).then((c) => {
          if (c) {
            router.replace(`/chat/${c.id}`);
            return c.id;
          }
          return null;
        }));

      if (!convId) return;

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
      });
    },
    [
      urlConversationId,
      activeConversationId,
      createConversation,
      sendMessage,
      selectedModelId,
      router,
    ],
  );

  const handleSend = useCallback(
    (content: string, attachments?: File[], _skillId?: string, meta?: SendMeta): false | void => {
      const sourceConversationId = urlConversationId || activeConversationId;
      const conversation = sourceConversationId
        ? (conversations.find((item) => item.id === sourceConversationId) ?? null)
        : null;

      if (
        sourceConversationId &&
        shouldForkLocalToByok({
          conversation,
          messages,
          targetModelId: selectedModelId,
        })
      ) {
        const candidates = buildHandoffContextCandidates({
          conversationId: sourceConversationId,
          messages,
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
      activeConversationId,
      conversations,
      messages,
      selectedModelId,
      sendContent,
      urlConversationId,
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
      router.push(`/chat/${fork.id}`);
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
    creationPending.current = true;
    createConversation('New Chat')
      .then((conv) => {
        if (conv) {
          router.push(`/chat/${conv.id}`);
        }
      })
      .finally(() => {
        creationPending.current = false;
      });
  }, [createConversation, router]);

  const handleSelectSession = useCallback(
    (id: string) => {
      router.push(`/chat/${id}`);
    },
    [router],
  );

  const handleDeleteSession = useCallback(
    (id: string) => {
      deleteConversation(id);
      if (id === activeConversationId) {
        router.push('/chat');
      }
    },
    [deleteConversation, activeConversationId, router],
  );

  const handleRenameSession = useCallback(
    (id: string, title: string) => {
      updateConversation(id, { title });
    },
    [updateConversation],
  );

  const moveToProject = useFeatureChatStore((s) => s.moveToProject);
  const handleMoveToProjectSession = useCallback(
    (sessionId: string, projectId: string) => {
      moveToProject(sessionId, projectId);
    },
    [moveToProject],
  );

  // Auto-title: when the second message arrives (first assistant reply), derive title
  // from the first user message content if the conversation is still named "New Chat".
  // Intentionally only re-runs on messages.length, not the full messages array, to
  // avoid re-running on every streaming chunk.
  useEffect(() => {
    if (!activeConversationId || messages.length !== 2) return;
    const convo = conversations.find((c) => c.id === activeConversationId);
    if (!convo || convo.title !== 'New Chat') return;
    const firstUser = messages[0];
    if (!firstUser || firstUser.role !== 'user') return;
    const title = firstUser.content.trim().slice(0, 60).replace(/\n/g, ' ') || 'New Chat';
    updateConversation(activeConversationId, { title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, activeConversationId, conversations, updateConversation]);

  const handleDeleteMessage = useCallback(
    (id: string) => {
      deleteMessage(id);
    },
    [deleteMessage],
  );

  const handleRegenerateMessage = useCallback(
    (id: string) => {
      if (!activeConversationId || isStreaming) return;
      const idx = messages.findIndex((m) => m.id === id);
      if (idx <= 0) return;
      // Find the user message just before this one
      let userMsg: (typeof messages)[0] | undefined;
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i]?.role === 'user') {
          userMsg = messages[i];
          break;
        }
      }
      if (!userMsg) return;
      // Remove the assistant message being regenerated, then resend
      deleteMessage(id);
      sendMessage(userMsg.content, {
        model: selectedModelId,
        conversationId: activeConversationId,
      });
    },
    [activeConversationId, messages, isStreaming, deleteMessage, sendMessage, selectedModelId],
  );

  const chatMessages = useMemo(
    () => messages.map((m) => toChatMessage(m, activeConversationId ?? '')),
    [messages, activeConversationId],
  );
  const isEmptyChat = chatMessages.length === 0 && !isLoading;

  // Count distinct research sources across all messages for the toggle badge.
  // chatMessages use the chat-store shape where searchResults is a flat array.
  const researchSourceCount = useMemo(() => {
    let count = 0;
    for (const m of chatMessages) {
      const sr = m.metadata?.searchResults;
      if (Array.isArray(sr)) {
        count += sr.filter((r) => r.url).length;
      }
    }
    return count;
  }, [chatMessages]);

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text-primary)]">
      {/* Sidebar */}
      <ChatSidebar
        sessions={conversations}
        activeSessionId={activeConversationId ?? undefined}
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

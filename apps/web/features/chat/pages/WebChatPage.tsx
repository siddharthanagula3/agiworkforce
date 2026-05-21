'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useChatStream } from '@/lib/hooks/useChatStream';
import { useConversations } from '@/lib/hooks/useConversations';
import { useChatStore } from '@/stores/chatStore';
import { getSupabaseClient } from '@/services/supabase';
import { useModelStore } from '@shared/stores/model-store';
import { ChatSidebar } from '../components/Sidebar/ChatSidebar';
import { ChatMessageList } from '../components/messages/ChatMessageList';
import { ChatComposerNew } from '../components/Composer/ChatComposerNew';
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
import type { ChatMessage } from '../stores/chat-store';
import { cn } from '@shared/lib/utils';

type SendMeta = {
  agentMode?: string;
  folderId?: string | null;
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
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
  const thinkingSteps = thinkingContent ? [thinkingContent] : undefined;

  return {
    id: m.id,
    sessionId: conversationId,
    role: m.role === 'system' ? 'assistant' : m.role,
    content: m.content,
    createdAt: new Date(m.createdAt),
    isStreaming: m.isStreaming,
    metadata:
      m.metadata || m.model
        ? {
            model: m.model,
            thinkingSteps,
            isThinkingStreaming: m.metadata?.isThinkingStreaming,
            isSearching: m.metadata?.isSearching,
            searchResults: m.metadata?.searchResults,
            isExecutingCode: m.metadata?.isExecutingCode,
            codeExecutionResult: m.metadata?.codeExecutionResult,
            reaction: m.metadata?.reaction,
          }
        : undefined,
  };
}

async function getAuthToken(): Promise<string> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  return session.access_token;
}

async function saveSystemMessage(params: {
  conversationId: string;
  content: string;
  metadata: MessageMetadata;
}): Promise<Message> {
  const authToken = await getAuthToken();
  const response = await fetch(`/api/chat/conversations/${params.conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
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
  const router = useRouter();
  const params = useParams();
  const urlConversationId = params?.['sessionId'] as string | undefined;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [composerPrefill, setComposerPrefill] = useState<string | undefined>(undefined);
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

  // Model from the model store (kept in sync by ComposerFooter)
  const selectedModelId = useModelStore((s) => s.selectedModelId);

  // Conversation CRUD
  const {
    conversations,
    createConversation,
    loadConversation,
    deleteConversation,
    updateConversation,
  } = useConversations();

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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
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
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Message list */}
        <div className="flex-1 overflow-hidden">
          <ChatMessageList
            messages={chatMessages}
            isLoading={isLoading && !isStreaming}
            onRegenerate={handleRegenerateMessage}
            onDelete={handleDeleteMessage}
            onSendMessage={(text) => setComposerPrefill(text)}
          />
        </div>

        {/* Composer */}
        <div
          className={cn('mx-auto w-full max-w-3xl px-4 pb-6', sidebarCollapsed ? 'max-w-4xl' : '')}
        >
          <ChatComposerNew
            onSend={handleSend}
            onStop={stopGeneration}
            isLoading={isLoading}
            isGenerating={isStreaming}
            prefillText={composerPrefill}
            onPrefillConsumed={() => setComposerPrefill(undefined)}
            clearSignal={composerClearSignal}
          />
        </div>
      </div>
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

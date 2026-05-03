'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useChatStream } from '@/lib/hooks/useChatStream';
import { useConversations } from '@/lib/hooks/useConversations';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@shared/stores/model-store';
import { ChatSidebar } from '../components/Sidebar/ChatSidebar';
import { MessageListNew } from '../components/messages/MessageListNew';
import { ChatComposerNew } from '../components/Composer/ChatComposerNew';
import type { Message } from '@/stores/chatStore';
import type { ChatMessage } from '../stores/chat-store';
import { cn } from '@shared/lib/utils';

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

export default function WebChatPage() {
  const router = useRouter();
  const params = useParams();
  const urlConversationId = params?.['sessionId'] as string | undefined;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Streaming send + store state
  const { sendMessage, stopGeneration, isStreaming } = useChatStream();
  const messages = useChatStore((s) => s.messages);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
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

  const handleSend = useCallback(
    async (
      content: string,
      attachments?: File[],
      _skillId?: string,
      meta?: { agentMode?: string; folderId?: string | null; webSearchEnabled?: boolean },
    ) => {
      const convId =
        urlConversationId ||
        activeConversationId ||
        (await createConversation('New Chat').then((c) => {
          if (c) {
            router.replace(`/chat/${c.id}`);
            return c.id;
          }
          return null;
        }));

      if (!convId) return;

      // Read image files as base64 data URLs so the LLM can process them
      const resolvedAttachments = attachments
        ? await Promise.all(
            attachments.map(async (f) => {
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
        webSearch: meta?.webSearchEnabled,
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
        {/* Message list or welcome state */}
        <div className="flex-1 overflow-hidden">
          {chatMessages.length === 0 && !isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
              <div className="text-center">
                <h1 className="text-2xl font-semibold text-foreground">What can I help with?</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ask anything — I support 25+ models including Claude, GPT, Gemini, and local LLMs.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {[
                  'Explain a complex concept',
                  'Help me write code',
                  'Summarize a document',
                  'Brainstorm ideas',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <MessageListNew
              messages={chatMessages}
              isLoading={isLoading && !isStreaming}
              onRegenerate={handleRegenerateMessage}
              onDelete={handleDeleteMessage}
            />
          )}
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
          />
        </div>
      </div>
    </div>
  );
}

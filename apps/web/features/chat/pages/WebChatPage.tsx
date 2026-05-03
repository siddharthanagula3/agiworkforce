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
    async (content: string, attachments?: File[]) => {
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

      await sendMessage(content, {
        model: selectedModelId,
        conversationId: convId,
        attachments: attachments?.map((f) => ({
          id: crypto.randomUUID(),
          type: f.type.startsWith('image/') ? ('image' as const) : ('file' as const),
          name: f.name,
          size: f.size,
          mimeType: f.type,
          content: undefined,
        })),
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
          <MessageListNew messages={chatMessages} isLoading={isLoading && !isStreaming} />
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

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Menu, Sparkles } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useChatStore, getGreetingTime } from '@features/chat/stores/chat-store';
import { ChatComposerNew } from '@features/chat/components/Composer/ChatComposerNew';
import { ChatSidebarNew } from '@features/chat/components/Sidebar/ChatSidebarNew';
import { MessageListNew } from '@features/chat/components/messages/MessageListNew';
import { SuggestedPrompts } from '@features/chat/components/SuggestedPrompts';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useModelStore } from '@shared/stores/model-store';
import { ChatAIService } from '@features/chat/services/chat-ai-service';

export default function ChatSessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params?.sessionId as string;
  const { user } = useAuthStore();
  const { selectedModelId } = useModelStore();

  const {
    sessions,
    messages: allMessages,
    sidebarOpen,
    setSidebarOpen,
    createSession,
    deleteSession,
    renameSession,
    addMessage,
    appendToMessage,
    setStreaming,
    deleteMessage,
    setLoading,
    setActiveSession,
    isLoading,
    loadMessagesFromDb,
    saveMessageToDb,
    saveSessionToDb,
  } = useChatStore();

  const [mounted, setMounted] = useState(false);
  const abortRef = useRef(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const messages = allMessages[sessionId] || [];

  // Set active session on mount
  useEffect(() => {
    if (sessionId) {
      setActiveSession(sessionId);
    }
  }, [sessionId, setActiveSession]);

  // Load messages from DB if we have none locally
  useEffect(() => {
    if (mounted && sessionId && messages.length === 0) {
      loadMessagesFromDb(sessionId);
    }
  }, [mounted, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const processAIResponse = async (
    userContent: string,
    currentMessages: typeof messages,
    skillId?: string,
  ) => {
    if (!sessionId || !user?.id) return;

    setLoading(true);

    // Create placeholder assistant message for streaming
    const assistantId = addMessage(sessionId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
      metadata: { model: selectedModelId },
    });

    try {
      // Build conversation history
      const conversationHistory = currentMessages
        .filter((m) => !m.isStreaming)
        .map((m) => ({ role: m.role, content: m.content }));

      // Use ChatAIService for unified skill-aware routing
      const fullResponse = await ChatAIService.sendMessage({
        sessionId,
        content: userContent,
        skillId,
        conversationHistory: [...conversationHistory, { role: 'user', content: userContent }],
        onChunk: (chunk) => {
          if (!abortRef.current) {
            const store = useChatStore.getState();
            store.appendToMessage(sessionId, assistantId, chunk);
          }
        },
      });

      // Finalize
      const store = useChatStore.getState();
      store.setStreaming(sessionId, assistantId, false);
      store.setLoading(false);

      // Save to DB in background
      const finalMessages = store.messages[sessionId] || [];
      const userMsg = finalMessages.find((m) => m.role === 'user' && m.content === userContent);
      const assistantMsg = finalMessages.find((m) => m.id === assistantId);

      if (userMsg) {
        saveMessageToDb(userMsg, user.id).catch(() => {});
      }
      if (assistantMsg) {
        saveMessageToDb(
          { ...assistantMsg, content: fullResponse, isStreaming: false },
          user.id,
        ).catch(() => {});
      }

      // Update session in DB
      const session = store.sessions.find((s) => s.id === sessionId);
      if (session) {
        saveSessionToDb(session, user.id).catch(() => {});
      }
    } catch (err) {
      console.error('[ChatSession] AI response error:', err);
      const store = useChatStore.getState();
      const errorContent =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      store.updateMessage(sessionId, assistantId, `**Error:** ${errorContent}`);
      store.setStreaming(sessionId, assistantId, false);
      store.setLoading(false);
    }
  };

  // Process pending user messages that need AI responses
  const pendingProcessedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!mounted || !sessionId || !user?.id) return;
    const msgs = useChatStore.getState().messages[sessionId] || [];
    if (msgs.length === 0) return;

    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg.role === 'user' && !pendingProcessedRef.current.has(lastMsg.id)) {
      pendingProcessedRef.current.add(lastMsg.id);
      const hasStreamingAssistant = msgs.some((m) => m.role === 'assistant' && m.isStreaming);
      if (!hasStreamingAssistant) {
        processAIResponse(lastMsg.content, msgs);
      }
    }
  }, [mounted, sessionId, user?.id, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewChat = useCallback(() => {
    const id = createSession(user?.id);
    router.push(`/chat/${id}`);
  }, [createSession, router, user?.id]);

  const handleDeleteSession = useCallback(
    (id: string) => {
      deleteSession(id);
      if (id === sessionId) {
        const remaining = useChatStore.getState().sessions;
        if (remaining.length > 0) {
          router.push(`/chat/${remaining[0].id}`);
        } else {
          router.push('/chat');
        }
      }
    },
    [deleteSession, sessionId, router],
  );

  const processAIResponseRef = useRef(processAIResponse);
  useEffect(() => {
    processAIResponseRef.current = processAIResponse;
  });

  const handleSend = useCallback(
    (content: string, _attachments?: File[], skillId?: string) => {
      if (!sessionId || !user?.id) return;

      addMessage(sessionId, { role: 'user', content });

      // Get current messages for conversation history
      const currentMsgs = useChatStore.getState().messages[sessionId] || [];
      processAIResponseRef.current(content, currentMsgs, skillId);
    },
    [sessionId, user?.id, addMessage],
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (sessionId) {
        deleteMessage(sessionId, messageId);
      }
    },
    [sessionId, deleteMessage],
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      handleSend(prompt);
    },
    [handleSend],
  );

  if (!mounted) {
    return <div className="flex h-full items-center justify-center bg-background" />;
  }

  const greeting = getGreetingTime();
  const hasMessages = messages.length > 0;

  return (
    <div className="relative flex h-full bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm sm:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Chat conversation sidebar */}
      <div
        className={cn(
          'border-r border-border/30 bg-card/30 backdrop-blur-sm transition-all duration-300 ease-in-out',
          sidebarOpen ? 'fixed inset-y-0 left-0 z-40 w-72 sm:relative sm:z-auto' : 'w-0',
          !sidebarOpen && 'overflow-hidden',
        )}
      >
        {sidebarOpen && (
          <ChatSidebarNew
            sessions={sessions}
            onNewChat={handleNewChat}
            onDeleteSession={handleDeleteSession}
            onRenameSession={renameSession}
            onToggleSidebar={() => setSidebarOpen(false)}
          />
        )}
      </div>

      {/* Sidebar toggle (when closed) */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg bg-card/60 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="Open sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {hasMessages ? (
          <>
            {/* Message list */}
            <div className="flex-1 overflow-hidden">
              <MessageListNew
                messages={messages}
                isLoading={isLoading}
                onDelete={handleDeleteMessage}
              />
            </div>

            {/* Composer */}
            <div className="pb-2 pt-2">
              <ChatComposerNew onSend={handleSend} isLoading={isLoading} />
            </div>
          </>
        ) : (
          <>
            {/* Empty session state */}
            <div className="flex flex-1 flex-col items-center justify-center px-4">
              <div className="w-full max-w-2xl">
                <div className="mb-8 text-center">
                  <div className="mb-3 flex items-center justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20">
                      <Sparkles className="h-6 w-6 text-teal-400" />
                    </div>
                  </div>
                  <h1 className="text-2xl font-semibold text-foreground">Good {greeting}</h1>
                  <p className="mt-1 text-muted-foreground">What can I help you with today?</p>
                </div>
                <div className="mb-8">
                  <SuggestedPrompts onSelect={handleSuggestedPrompt} />
                </div>
              </div>
            </div>

            {/* Composer */}
            <div className="pb-2 pt-2">
              <ChatComposerNew onSend={handleSend} isLoading={isLoading} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

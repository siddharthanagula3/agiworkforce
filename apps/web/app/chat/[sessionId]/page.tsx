'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Menu, Sparkles } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useChatStore, getGreetingTime } from '@features/chat/stores/chat-store';
import { ChatComposerNew } from '@features/chat/components/Composer/ChatComposerNew';
import { ChatSidebarNew } from '@features/chat/components/Sidebar/ChatSidebarNew';
import { MessageListNew } from '@features/chat/components/messages/MessageListNew';
import { SuggestedPrompts } from '@features/chat/components/SuggestedPrompts';

export default function ChatSessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params?.sessionId as string;

  const {
    sessions,
    messages: allMessages,
    sidebarOpen,
    setSidebarOpen,
    createSession,
    deleteSession,
    renameSession,
    addMessage,
    deleteMessage,
    setLoading,
    setActiveSession,
    isLoading,
  } = useChatStore();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const messages = allMessages[sessionId] || [];

  // Set active session on mount
  useEffect(() => {
    if (sessionId) {
      setActiveSession(sessionId);
    }
  }, [sessionId, setActiveSession]);

  const handleNewChat = useCallback(() => {
    const id = createSession();
    router.push(`/chat/${id}`);
  }, [createSession, router]);

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

  const handleSend = useCallback(
    (content: string) => {
      if (!sessionId) return;

      addMessage(sessionId, { role: 'user', content });

      // Simulate AI response
      setLoading(true);
      const assistantId = addMessage(sessionId, {
        role: 'assistant',
        content: '',
        isStreaming: true,
      });

      const responses = [
        "I'd be happy to help with that! ",
        'Let me think about this...\n\n',
        "Here's what I found:\n\n",
        'This is a simulated response. ',
        'Once connected to a real AI backend, ',
        "you'll receive actual responses here.\n\n",
        'The interface supports:\n',
        '- **Bold** and *italic* text\n',
        '- `inline code` and code blocks\n',
        '- Lists and tables\n',
        '- [Links](https://example.com)\n\n',
        '```typescript\n',
        'function greet(name: string) {\n',
        '  return `Hello, ${name}!`;\n',
        '}\n',
        '```\n',
      ];

      let index = 0;
      const interval = setInterval(() => {
        if (index < responses.length) {
          const store = useChatStore.getState();
          store.appendToMessage(sessionId, assistantId, responses[index]);
          index++;
        } else {
          clearInterval(interval);
          const store = useChatStore.getState();
          store.setStreaming(sessionId, assistantId, false);
          store.setLoading(false);
        }
      }, 80);
    },
    [sessionId, addMessage, setLoading],
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
    return <div className="flex h-screen items-center justify-center bg-background" />;
  }

  const greeting = getGreetingTime();
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div
        className={cn(
          'border-r border-border/30 bg-card/30 backdrop-blur-sm transition-all duration-300 ease-in-out',
          sidebarOpen ? 'w-0 sm:w-72' : 'w-0',
          'overflow-hidden',
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
          className="fixed left-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg bg-card/60 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted/60 hover:text-foreground"
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

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Sparkles } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useChatStore, getGreetingTime } from '@features/chat/stores/chat-store';
import { ChatComposerNew } from '@features/chat/components/Composer/ChatComposerNew';
import { ChatSidebarNew } from '@features/chat/components/Sidebar/ChatSidebarNew';
import { SuggestedPrompts } from '@features/chat/components/SuggestedPrompts';

export default function ChatPage() {
  const router = useRouter();
  const {
    sessions,
    sidebarOpen,
    setSidebarOpen,
    createSession,
    deleteSession,
    renameSession,
    addMessage,
    setLoading,
    isLoading,
  } = useChatStore();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const greeting = getGreetingTime();

  const handleNewChat = useCallback(() => {
    const id = createSession();
    router.push(`/chat/${id}`);
  }, [createSession, router]);

  const handleSend = useCallback(
    (content: string, _attachments?: File[]) => {
      // Create a new session, add the user message, navigate to it
      const sessionId = createSession();
      addMessage(sessionId, { role: 'user', content });

      // Simulate AI response
      setLoading(true);
      const assistantId = addMessage(sessionId, {
        role: 'assistant',
        content: '',
        isStreaming: true,
      });

      router.push(`/chat/${sessionId}`);

      // Simulate streaming response
      const responses = [
        "I'd be happy to help with that! ",
        'Let me think about this for a moment...\n\n',
        "Here's what I can tell you:\n\n",
        'This is a simulated response. ',
        'Once connected to an AI backend, ',
        "you'll get real responses here. ",
        'The chat interface supports **markdown**, `code blocks`, and more.',
      ];

      let index = 0;
      const interval = setInterval(() => {
        if (index < responses.length) {
          useChatStore.getState().appendToMessage(sessionId, assistantId, responses[index]);
          index++;
        } else {
          clearInterval(interval);
          useChatStore.getState().setStreaming(sessionId, assistantId, false);
          useChatStore.getState().setLoading(false);
        }
      }, 100);
    },
    [createSession, addMessage, setLoading, router],
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
            onDeleteSession={deleteSession}
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

      {/* Main area — centered empty state */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            {/* Greeting */}
            <div className="mb-8 text-center">
              <div className="mb-3 flex items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20">
                  <Sparkles className="h-6 w-6 text-teal-400" />
                </div>
              </div>
              <h1 className="text-2xl font-semibold text-foreground">Good {greeting}</h1>
              <p className="mt-1 text-muted-foreground">What can I help you with today?</p>
            </div>

            {/* Suggested prompts */}
            <div className="mb-8">
              <SuggestedPrompts onSelect={handleSuggestedPrompt} />
            </div>
          </div>
        </div>

        {/* Composer at bottom */}
        <div className="pb-2 pt-2">
          <ChatComposerNew onSend={handleSend} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}

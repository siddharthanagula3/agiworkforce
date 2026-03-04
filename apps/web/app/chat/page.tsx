'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Menu, Sparkles } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useChatStore, getGreetingTime } from '@features/chat/stores/chat-store';
import { ChatComposerNew } from '@features/chat/components/Composer/ChatComposerNew';
import { ChatSidebarNew } from '@features/chat/components/Sidebar/ChatSidebarNew';
import { SuggestedPrompts } from '@features/chat/components/SuggestedPrompts';
import { useAuthStore } from '@shared/stores/authentication-store';
import { ChatAIService } from '@features/chat/services/chat-ai-service';

/**
 * Inner component that reads ?skill= search params.
 * Wrapped in <Suspense> by the default export (Next.js 16 requirement).
 */
function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const {
    sessions,
    sidebarOpen,
    dbLoaded,
    setSidebarOpen,
    createSession,
    deleteSession,
    renameSession,
    addMessage,
    isLoading,
    loadSessionsFromDb,
  } = useChatStore();

  const [mounted, setMounted] = useState(false);
  const skillHandled = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Load sessions from Supabase on mount
  useEffect(() => {
    if (user?.id && !dbLoaded) {
      loadSessionsFromDb(user.id);
    }
  }, [user?.id, dbLoaded, loadSessionsFromDb]);

  // Reset skillHandled when searchParams change (e.g., navigating to different skill)
  const prevSkillParam = useRef<string | null>(null);

  // Handle ?skill= query parameter (from marketplace navigation)
  useEffect(() => {
    if (!mounted) return;

    const skillParam = searchParams.get('skill');
    if (!skillParam) return;

    // Skip if we already handled this exact skill param
    if (skillHandled.current && prevSkillParam.current === skillParam) return;
    skillHandled.current = true;
    prevSkillParam.current = skillParam;

    // Look up skill info for the system message
    const skills = ChatAIService.getAvailableSkillsSync();
    const skill = skills.find((s) => s.id === skillParam);
    const skillName =
      skill?.name ??
      skillParam
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    const skillCategory = skill?.category ?? 'General';

    // Create a new session and seed it with a system-style assistant message
    const sessionId = createSession(user?.id);
    addMessage(sessionId, {
      role: 'assistant',
      content: `Chatting with @${skillName} — an AI agent specialized in ${skillCategory}.`,
    });

    router.replace(`/chat/${sessionId}`);
  }, [mounted, searchParams, createSession, addMessage, router, user?.id]);

  const greeting = getGreetingTime();

  const handleNewChat = useCallback(() => {
    const id = createSession(user?.id);
    router.push(`/chat/${id}`);
  }, [createSession, router, user?.id]);

  const handleSend = useCallback(
    (content: string, _attachments?: File[]) => {
      // Create a new session, add the user message, navigate to it
      const sessionId = createSession(user?.id);
      addMessage(sessionId, { role: 'user', content });

      // Navigate to session page — AI response handled there
      router.push(`/chat/${sessionId}`);
    },
    [createSession, addMessage, router, user?.id],
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
          className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg bg-card/60 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted/60 hover:text-foreground"
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

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-background" />}>
      <ChatPageInner />
    </Suspense>
  );
}

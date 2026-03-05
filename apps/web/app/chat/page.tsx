'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Menu, PenLine, Bug, Lightbulb, Target, BarChart3, Code2, ChevronDown } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useChatStore, getGreetingTime } from '@features/chat/stores/chat-store';
import { ChatComposerNew } from '@features/chat/components/Composer/ChatComposerNew';
import { ChatSidebarNew } from '@features/chat/components/Sidebar/ChatSidebarNew';
import { useAuthStore } from '@shared/stores/authentication-store';
import { ChatAIService } from '@features/chat/services/chat-ai-service';

const SUGGESTION_PILLS = [
  {
    id: 'blog',
    icon: PenLine,
    label: 'Write a blog post about AI agents',
    prompt: 'Write a blog post about AI agents',
  },
  {
    id: 'debug',
    icon: Bug,
    label: 'Debug my React component',
    prompt: 'Debug my React component',
  },
  {
    id: 'explain',
    icon: Lightbulb,
    label: 'Explain quantum computing simply',
    prompt: 'Explain quantum computing simply',
  },
  {
    id: 'marketing',
    icon: Target,
    label: 'Create a marketing strategy',
    prompt: 'Create a marketing strategy',
  },
  {
    id: 'analyze',
    icon: BarChart3,
    label: 'Analyze this dataset',
    prompt: 'Analyze this dataset',
  },
  {
    id: 'api',
    icon: Code2,
    label: 'Design a REST API',
    prompt: 'Design a REST API',
  },
] as const;

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

  const firstName = useMemo(() => {
    const meta = user?.user_metadata;
    const fullName = meta ? (meta['full_name'] as string | undefined) : undefined;
    if (fullName) {
      const first = fullName.trim().split(/\s+/)[0];
      if (first) return first;
    }
    return 'there';
  }, [user?.user_metadata]);

  const handleNewChat = useCallback(() => {
    const id = createSession(user?.id);
    router.push(`/chat/${id}`);
  }, [createSession, router, user?.id]);

  const handleSend = useCallback(
    (content: string, _attachments?: File[]) => {
      const state = useChatStore.getState();
      const activeId = state.activeSessionId;
      const existingMessages = activeId ? state.messages[activeId] : null;

      // Reuse active session if it exists and is empty (just created by "New Chat")
      const sessionId =
        activeId && (!existingMessages || existingMessages.length === 0)
          ? activeId
          : createSession(user?.id);

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
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-4">
          <div className="w-full max-w-2xl">
            {/* Greeting */}
            <div className="mb-10 text-center">
              <h1 className="text-3xl font-semibold text-foreground">
                Good {greeting}, {firstName}
              </h1>
              <p className="mt-2 text-lg text-muted-foreground">How can I help you today?</p>
            </div>

            {/* Suggestion pills */}
            <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-3">
              {SUGGESTION_PILLS.map((pill) => {
                const Icon = pill.icon;
                return (
                  <button
                    key={pill.id}
                    onClick={() => handleSuggestedPrompt(pill.prompt)}
                    className="flex items-center gap-2.5 rounded-xl border border-border px-4 py-3 text-left text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/50 hover:text-foreground"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                    <span className="truncate">{pill.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Composer at bottom with model selector */}
        <div className="px-4 pb-4 pt-2">
          <div className="mx-auto max-w-2xl">
            {/* Model selector badge */}
            <div className="mb-2 flex justify-center">
              <button className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted/50 hover:text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>Auto</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <ChatComposerNew onSend={handleSend} isLoading={isLoading} />
          </div>
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

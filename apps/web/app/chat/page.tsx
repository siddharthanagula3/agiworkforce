'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Menu, Sparkles } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useChatStore } from '@features/chat/stores/chat-store';
import { ChatComposerNew } from '@features/chat/components/Composer/ChatComposerNew';
import { ChatSidebarNew } from '@features/chat/components/Sidebar/ChatSidebarNew';
import { useAuthStore } from '@shared/stores/authentication-store';
import { ChatAIService } from '@features/chat/services/chat-ai-service';

const SUGGESTED_PROMPTS = [
  { title: 'Explain a concept', text: 'Explain quantum computing in simple terms' },
  { title: 'Write code', text: 'Write a Python script to scrape a website' },
  { title: 'Research a topic', text: 'What are the latest developments in AI agents?' },
  { title: 'Analyze data', text: 'Help me analyze this CSV data and find trends' },
  { title: 'Draft content', text: 'Write a professional email declining a meeting' },
  { title: 'Debug an issue', text: 'My React component re-renders too many times, help me fix it' },
];

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
    activeSessionId,
    dbLoaded,
    createSession,
    deleteSession,
    renameSession,
    addMessage,
    isLoading,
    loadSessionsFromDb,
  } = useChatStore();

  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('chat-sidebar-collapsed') === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const skillHandled = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Persist collapse state
  useEffect(() => {
    localStorage.setItem('chat-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Keyboard shortcut Cmd/Ctrl+Shift+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Load sessions from Supabase on mount
  useEffect(() => {
    if (user?.id && !dbLoaded) {
      loadSessionsFromDb(user.id);
    }
  }, [user?.id, dbLoaded, loadSessionsFromDb]);

  // Reset skillHandled when searchParams change
  const prevSkillParam = useRef<string | null>(null);

  // Handle ?skill= query parameter (from marketplace navigation)
  useEffect(() => {
    if (!mounted) return;

    const skillParam = searchParams.get('skill');
    if (!skillParam) return;

    if (skillHandled.current && prevSkillParam.current === skillParam) return;
    skillHandled.current = true;
    prevSkillParam.current = skillParam;

    const skills = ChatAIService.getAvailableSkillsSync();
    const skill = skills.find((s) => s.id === skillParam);
    const skillName =
      skill?.name ??
      skillParam
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    const skillCategory = skill?.category ?? 'General';

    const sessionId = createSession(user?.id);
    addMessage(sessionId, {
      role: 'assistant',
      content: `Chatting with @${skillName} — an AI agent specialized in ${skillCategory}.`,
    });

    router.replace(`/chat/${sessionId}`);
  }, [mounted, searchParams, createSession, addMessage, router, user?.id]);

  const handleNewChat = useCallback(() => {
    const id = createSession(user?.id);
    router.push(`/chat/${id}`);
  }, [createSession, router, user?.id]);

  const handleSend = useCallback(
    (content: string, _attachments?: File[]) => {
      const state = useChatStore.getState();
      const activeId = state.activeSessionId;
      const existingMessages = activeId ? state.messages[activeId] : null;

      const sessionExists = activeId && state.sessions.some((s) => s.id === activeId);
      const isEmpty = !existingMessages || existingMessages.length === 0;
      const sessionId = sessionExists && isEmpty ? activeId : createSession(user?.id);

      addMessage(sessionId, { role: 'user', content });
      router.push(`/chat/${sessionId}`);
    },
    [createSession, addMessage, router, user?.id],
  );

  if (!mounted) {
    return <div className="flex h-full items-center justify-center" />;
  }

  return (
    <div className="flex h-full overflow-hidden bg-[#faf9f7] dark:bg-[#0f0f13]">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col lg:hidden w-[280px] shadow-2xl bg-[#f5f4f1] dark:bg-[#0b0c14] border-r border-black/[0.08] dark:border-white/[0.07] transform transition-transform duration-200 ease-in-out',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <ChatSidebarNew
          sessions={sessions}
          activeSessionId={activeSessionId ?? undefined}
          onNewChat={() => {
            setMobileSidebarOpen(false);
            handleNewChat();
          }}
          onSelectSession={(id) => {
            setMobileSidebarOpen(false);
            router.push(`/chat/${id}`);
          }}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onToggleSidebar={() => setMobileSidebarOpen(false)}
          collapsed={false}
        />
      </div>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex lg:flex-col shrink-0 transition-[width] duration-200 ease-in-out',
          sidebarCollapsed ? 'w-16' : 'w-[280px]',
        )}
      >
        <ChatSidebarNew
          sessions={sessions}
          activeSessionId={activeSessionId ?? undefined}
          onNewChat={handleNewChat}
          onSelectSession={(id) => router.push(`/chat/${id}`)}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          collapsed={sidebarCollapsed}
        />
      </aside>

      {/* Main area */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header bar */}
        <div className="flex items-center gap-3 border-b border-black/[0.06] dark:border-white/[0.06] px-3 py-2 lg:hidden">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-foreground transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground">AGI Workforce</span>
        </div>

        {/* Welcome / empty state */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-4">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-600/20 border border-teal-500/20">
              <Sparkles className="h-8 w-8 text-teal-500" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">What can I help you with?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask anything — I can write, code, research, analyze, and more.
            </p>
          </div>
          <div className="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt.text}
                onClick={() => handleSend(prompt.text)}
                className="rounded-xl border border-border/60 bg-muted/30 p-4 text-left text-sm hover:bg-muted/60 hover:border-border transition-colors"
              >
                <div className="font-medium text-foreground">{prompt.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{prompt.text}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Composer at bottom */}
        <ChatComposerNew onSend={handleSend} isLoading={isLoading} />
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center" />}>
      <ChatPageInner />
    </Suspense>
  );
}

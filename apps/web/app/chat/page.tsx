'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@shared/lib/utils';
import { useChatStore } from '@features/chat/stores/chat-store';
import { ChatComposerNew } from '@features/chat/components/Composer/ChatComposerNew';
import { ChatSidebarNew } from '@features/chat/components/Sidebar/ChatSidebarNew';
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
      {/* Sidebar */}
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
        {/* Empty state spacer */}
        <div className="flex-1 min-h-[40vh]" />

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

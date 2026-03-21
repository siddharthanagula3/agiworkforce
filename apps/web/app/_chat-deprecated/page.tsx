'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { Sparkles } from 'lucide-react';
import { useChatStore } from '@features/chat/stores/chat-store';
import { ChatComposerNew } from '@features/chat/components/Composer/ChatComposerNew';
import { SuggestedPrompts } from '@features/chat/components/SuggestedPrompts';
import { ConnectorDiscoveryBar } from '@features/chat/components/ConnectorDiscoveryBar';
import { useAuthStore } from '@shared/stores/authentication-store';
import { ChatAIService } from '@features/chat/services/chat-ai-service';
import { GreetingBanner } from '@features/chat/components/GreetingBanner/GreetingBanner';

/**
 * Inner component that reads ?skill= search params.
 * Wrapped in <Suspense> by the default export (Next.js 16 requirement).
 */
function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const { dbLoaded, createSession, addMessage, isLoading, loadSessionsFromDb } = useChatStore();

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
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Welcome / empty state */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-4">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-600/20 border border-teal-500/20">
            <Sparkles className="h-8 w-8 text-teal-500" />
          </div>
          <GreetingBanner visible={mounted} />
        </div>
        <div className="w-full max-w-2xl">
          <SuggestedPrompts onSelect={handleSend} />
          <div className="mt-6 flex justify-center">
            <ConnectorDiscoveryBar />
          </div>
        </div>
      </div>

      {/* Composer at bottom */}
      <ChatComposerNew onSend={handleSend} isLoading={isLoading} />
    </div>
  );
}

export default function ChatPage() {
  return (
    <ErrorBoundary componentName="ChatPage" compact>
      <Suspense fallback={<div className="flex h-full items-center justify-center" />}>
        <ChatPageInner />
      </Suspense>
    </ErrorBoundary>
  );
}

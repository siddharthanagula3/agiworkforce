'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Menu, ChevronDown, Check } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useChatStore, type ChatMessage } from '@features/chat/stores/chat-store';
import { useArtifactsStore } from '@features/chat/stores/artifacts-store';
import { ChatComposerNew } from '@features/chat/components/Composer/ChatComposerNew';
import { ChatSidebarNew } from '@features/chat/components/Sidebar/ChatSidebarNew';
import { MessageListNew } from '@features/chat/components/messages/MessageListNew';
import {
  ArtifactsPanel,
  ArtifactsToggleButton,
} from '@features/chat/components/artifacts/ArtifactsPanel';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useModelStore, AVAILABLE_MODELS } from '@shared/stores/model-store';
import { ChatAIService } from '@features/chat/services/chat-ai-service';
import { logger } from '@shared/lib/logger';

const POPULAR_MODEL_IDS = [
  'claude-sonnet-4-6',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.0-flash',
  'claude-haiku-4-5-20251001',
  'deepseek-chat',
  'mistral-large-latest',
];

function ModelSelectorButton({
  selectedModelId,
  onSelect,
}: {
  selectedModelId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popularModels = AVAILABLE_MODELS.filter((m) => POPULAR_MODEL_IDS.includes(m.id));
  const currentModel = AVAILABLE_MODELS.find((m) => m.id === selectedModelId);
  const displayName = currentModel?.name ?? selectedModelId;
  const truncated = displayName.length > 20 ? displayName.slice(0, 20) + '…' : displayName;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 hover:border-border transition-colors"
        aria-label="Select model"
      >
        <span>{truncated}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-xl border border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl">
          {popularModels.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                onSelect(model.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted/60 transition-colors"
            >
              <Check
                className={cn(
                  'h-3 w-3 shrink-0',
                  model.id === selectedModelId ? 'text-primary' : 'opacity-0',
                )}
              />
              <div className="min-w-0 text-left">
                <div className="truncate font-medium text-foreground">{model.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">{model.provider}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatSessionPage() {
  const router = useRouter();
  const params = useParams();
  const rawSessionId = params?.['sessionId'];
  const sessionId: string | undefined =
    typeof rawSessionId === 'string'
      ? rawSessionId
      : Array.isArray(rawSessionId)
        ? rawSessionId[0]
        : undefined;
  const { user } = useAuthStore();
  const { selectedModelId } = useModelStore();

  const {
    sessions,
    messages: allMessages,
    createSession,
    deleteSession,
    renameSession,
    addMessage,
    deleteMessage,
    setLoading,
    setActiveSession,
    isLoading,
    loadMessagesFromDb,
    saveMessageToDb,
    saveSessionToDb,
  } = useChatStore();

  const { extractArtifactsFromContent, clearArtifacts } = useArtifactsStore();

  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('chat-sidebar-collapsed') === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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

  const messages = useMemo(
    () => (sessionId ? allMessages[sessionId] || [] : []),
    [allMessages, sessionId],
  );

  // Set active session on mount
  useEffect(() => {
    if (sessionId) {
      setActiveSession(sessionId);
    }
  }, [sessionId, setActiveSession]);

  // Clear artifacts when switching sessions
  useEffect(() => {
    clearArtifacts();
  }, [sessionId, clearArtifacts]);

  // Track which messages have already been processed for artifact extraction
  const processedArtifactIdsRef = useRef<Set<string>>(new Set());

  // Extract artifacts from existing messages when they load
  useEffect(() => {
    if (!mounted || messages.length === 0) return;
    for (const msg of messages) {
      if (
        msg.role === 'assistant' &&
        !msg.isStreaming &&
        msg.content &&
        !processedArtifactIdsRef.current.has(msg.id)
      ) {
        processedArtifactIdsRef.current.add(msg.id);
        extractArtifactsFromContent(msg.content, msg.id);
      }
    }
  }, [mounted, messages, extractArtifactsFromContent]);

  // Load messages from DB if we have none locally
  useEffect(() => {
    if (mounted && sessionId && messages.length === 0) {
      loadMessagesFromDb(sessionId);
    }
  }, [mounted, sessionId, messages.length, loadMessagesFromDb]);

  const processAIResponse = async (
    userContent: string,
    currentMessages: ChatMessage[],
    skillId?: string,
    userMessageId?: string,
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
      // NOTE: conversationHistory already includes the user message (added by handleSend
      // via addMessage before calling processAIResponse), so don't append it again.
      const fullResponse = await ChatAIService.sendMessage({
        sessionId,
        content: userContent,
        skillId,
        conversationHistory,
        onChunk: (chunk) => {
          const store = useChatStore.getState();
          store.appendToMessage(sessionId, assistantId, chunk);
        },
      });

      // Finalize
      const store = useChatStore.getState();
      store.setStreaming(sessionId, assistantId, false);
      store.setLoading(false);

      // Extract artifacts from the completed AI response
      extractArtifactsFromContent(fullResponse, assistantId);

      // Save to DB in background
      const finalMessages = store.messages[sessionId] || [];
      const userMsg = userMessageId
        ? finalMessages.find((m) => m.id === userMessageId)
        : finalMessages.find((m) => m.role === 'user' && m.content === userContent);
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
      logger.error('[ChatSession] AI response error:', err);
      const store = useChatStore.getState();
      const errorContent =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      store.updateMessage(sessionId, assistantId, `**Error:** ${errorContent}`);
      store.setStreaming(sessionId, assistantId, false);
      store.setLoading(false);
    }
  };

  // Process pending user messages from navigation (e.g., /chat → /chat/[sessionId]).
  // Runs ONCE on mount only. handleSend handles messages sent on this page directly.
  const initialProcessedRef = useRef(false);
  useEffect(() => {
    if (!mounted || !sessionId || !user?.id || initialProcessedRef.current) return;
    initialProcessedRef.current = true;

    const msgs = useChatStore.getState().messages[sessionId] || [];
    if (msgs.length === 0) return;

    const lastMsg = msgs[msgs.length - 1];
    const hasStreamingAssistant = msgs.some((m) => m.role === 'assistant' && m.isStreaming);

    if (lastMsg && lastMsg.role === 'user' && !hasStreamingAssistant) {
      processAIResponse(lastMsg.content, msgs);
    }
    // processAIResponse is intentionally excluded from deps — a ref keeps it current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, sessionId, user?.id]);

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
          router.push(`/chat/${remaining[0]!.id}`);
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

      const userMessageId = addMessage(sessionId, { role: 'user', content });

      // Get current messages for conversation history
      const currentMsgs = useChatStore.getState().messages[sessionId] || [];
      processAIResponseRef.current(content, currentMsgs, skillId, userMessageId);
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

  if (!mounted) {
    return <div className="flex h-full items-center justify-center bg-background" />;
  }

  if (!sessionId) {
    return <div className="flex h-full items-center justify-center bg-background" />;
  }

  const hasMessages = messages.length > 0;

  const currentSession = sessions.find((s) => s.id === sessionId);
  const sessionTitle = currentSession?.title || 'New Chat';

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
          activeSessionId={sessionId}
          onNewChat={() => {
            setMobileSidebarOpen(false);
            handleNewChat();
          }}
          onSelectSession={(id) => {
            setMobileSidebarOpen(false);
            router.push(`/chat/${id}`);
          }}
          onDeleteSession={handleDeleteSession}
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
          activeSessionId={sessionId}
          onNewChat={handleNewChat}
          onSelectSession={(id) => router.push(`/chat/${id}`)}
          onDeleteSession={handleDeleteSession}
          onRenameSession={renameSession}
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
          collapsed={sidebarCollapsed}
        />
      </aside>

      {/* Artifacts toggle (always visible, top right) */}
      <div className="absolute right-3 top-3 z-20">
        <ArtifactsToggleButton />
      </div>

      {/* Main chat area */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Sticky header bar — mobile hamburger + session title + model selector */}
        <div className="flex items-center gap-2 border-b border-black/[0.06] dark:border-white/[0.06] px-3 py-2 sticky top-0 z-10 bg-[#faf9f7] dark:bg-[#0f0f13]">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-foreground transition-colors lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
          <ModelSelectorButton
            selectedModelId={selectedModelId}
            onSelect={(id) => useModelStore.getState().setSelectedModelId(id)}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {sessionTitle}
          </span>
        </div>

        {hasMessages ? (
          <>
            {/* Message list */}
            <div className="relative flex-1 overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-[#faf9f7] dark:from-[#0f0f13] to-transparent" />
              <MessageListNew
                messages={messages}
                isLoading={isLoading}
                onDelete={handleDeleteMessage}
              />
            </div>

            {/* Composer */}
            <ChatComposerNew onSend={handleSend} isLoading={isLoading} />
          </>
        ) : (
          <>
            {/* Empty session — space above composer */}
            <div className="flex-1 min-h-[40vh]" />
            <ChatComposerNew onSend={handleSend} isLoading={isLoading} />
          </>
        )}
      </main>

      {/* Artifacts panel (slides in from right) */}
      <ArtifactsPanel />
    </div>
  );
}

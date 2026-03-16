'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useChatStore, type ChatMessage } from '@features/chat/stores/chat-store';
import { useArtifactsStore } from '@features/chat/stores/artifacts-store';
import { ChatComposerNew } from '@features/chat/components/Composer/ChatComposerNew';
import { MessageListNew } from '@features/chat/components/messages/MessageListNew';
import {
  ArtifactsPanel,
  ArtifactsToggleButton,
} from '@features/chat/components/artifacts/ArtifactsPanel';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useModelStore, AVAILABLE_MODELS } from '@shared/stores/model-store';
import { ChatAIService } from '@features/chat/services/chat-ai-service';
import { logger } from '@shared/lib/logger';
import { ModelSelectorButton } from '@/components/UnifiedAgenticChat/ModelSelectorButton';

export default function ChatSessionPage() {
  const params = useParams();
  const rawSessionId = params?.['sessionId'];
  const sessionId: string | undefined =
    typeof rawSessionId === 'string'
      ? rawSessionId
      : Array.isArray(rawSessionId)
        ? rawSessionId[0]
        : undefined;
  const { user } = useAuthStore();
  const { selectedModelId, thinkingEnabled } = useModelStore();

  const {
    sessions,
    messages: allMessages,
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
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
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
  const currentModel = AVAILABLE_MODELS.find((m) => m.id === selectedModelId);
  const modelDisplayName = currentModel?.name ?? selectedModelId;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Artifacts toggle (always visible, top right) */}
      <div className="absolute right-3 top-3 z-20">
        <ArtifactsToggleButton />
      </div>

      {/* Sticky header bar — model selector + session title */}
      <div className="flex items-center gap-2 border-b border-[var(--chat-border-subtle)] px-3 py-2 sticky top-0 z-10 bg-[var(--chat-bg)]">
        <ModelSelectorButton
          modelDisplayName={modelDisplayName}
          thinkingModeEnabled={thinkingEnabled}
          isOpen={modelSelectorOpen}
          onOpenChange={setModelSelectorOpen}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {sessionTitle}
        </span>
      </div>

      {hasMessages ? (
        <>
          {/* Message list */}
          <div className="relative flex-1 overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-[var(--chat-bg)] to-transparent" />
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

      {/* Artifacts panel (slides in from right) */}
      <ArtifactsPanel />
    </div>
  );
}

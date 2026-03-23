import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { ChatRuntime } from '../lib/runtime';
import { useChatStore, getSystemPromptForMode } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';

export function useChat(runtime: ChatRuntime | null) {
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const assistantMessageIdRef = useRef<string | null>(null);
  // Use ref for isStreaming to avoid stale closures in useCallback
  const isStreamingRef = useRef(false);
  isStreamingRef.current = useChatStore((s) => s.isStreaming);

  // Register stream callback on runtime to receive assistant responses
  useEffect(() => {
    if (!runtime?.onStream) return;

    const unsubscribe = runtime.onStream((event) => {
      const store = useChatStore.getState();
      const convId = store.currentConversationId;
      if (!convId) return;

      switch (event.type) {
        case 'content': {
          // Create or append to assistant message
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            store.addMessage(convId, {
              id,
              role: 'assistant',
              content: event.content,
              timestamp: new Date().toISOString(),
            });
          } else {
            // Append content to existing assistant message
            const msgs = store.messages[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              store.updateMessage(convId, assistantMessageIdRef.current, {
                content: msg.content + event.content,
              });
            }
          }
          break;
        }
        case 'done': {
          assistantMessageIdRef.current = null;
          store.stopStreaming();
          break;
        }
        case 'error': {
          assistantMessageIdRef.current = null;
          store.stopStreaming();
          toast.error(event.error || 'Failed to get response');
          break;
        }
      }
    });

    return unsubscribe;
  }, [runtime]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!runtime || isStreamingRef.current) return;

      const store = useChatStore.getState();

      // Auto-create conversation if none exists
      let convId = store.currentConversationId;
      if (!convId) {
        convId = crypto.randomUUID();
        store.addConversation({
          id: convId,
          title: content.substring(0, 50) || 'New Chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          archived: false,
          pinned: false,
        });
        store.setCurrentConversation(convId);
      }

      const systemPrompt = getSystemPromptForMode(store.activeMode);
      const selectedModelId = useModelStore.getState().selectedModelId;
      const webSearchEnabled = store.webSearchEnabled;

      // Reset assistant message ref for new response
      assistantMessageIdRef.current = null;

      store.addMessage(convId, {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      });
      store.startStreaming();

      // Build full conversation history for multi-turn context
      const allMessages = store.messages[convId] ?? [];
      const messageHistory = allMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      void runtime
        .sendMessage(convId, content, {
          ...(systemPrompt ? { systemPrompt } : {}),
          model: selectedModelId,
          webSearch: webSearchEnabled,
          messageHistory,
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          toast.error(message || 'Failed to send message');
        })
        .finally(() => {
          // Safety net — stop streaming if onStream 'done' wasn't received
          if (useChatStore.getState().isStreaming) {
            useChatStore.getState().stopStreaming();
          }
        });
    },
    [runtime],
  );

  const stopGeneration = useCallback(() => {
    if (runtime && currentConversationId) {
      runtime.stopGeneration(currentConversationId);
      assistantMessageIdRef.current = null;
      useChatStore.getState().stopStreaming();
    }
  }, [runtime, currentConversationId]);

  const isStreaming = useChatStore((s) => s.isStreaming);
  return { sendMessage, stopGeneration, isStreaming };
}

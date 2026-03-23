import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { ChatRuntime } from '../lib/runtime';
import { useChatStore, getSystemPromptForMode } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';

export function useChat(runtime: ChatRuntime | null) {
  const isStreaming = useChatStore((s) => s.isStreaming);
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const assistantMessageIdRef = useRef<string | null>(null);

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
      if (!runtime || !currentConversationId || isStreaming) return;

      const store = useChatStore.getState();
      const systemPrompt = getSystemPromptForMode(store.activeMode);
      const selectedModelId = useModelStore.getState().selectedModelId;

      // Reset assistant message ref for new response
      assistantMessageIdRef.current = null;

      store.addMessage(currentConversationId, {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      });
      store.startStreaming();

      void runtime
        .sendMessage(currentConversationId, content, {
          ...(systemPrompt ? { systemPrompt } : {}),
          model: selectedModelId,
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
    [runtime, currentConversationId, isStreaming],
  );

  const stopGeneration = useCallback(() => {
    if (runtime && currentConversationId) {
      runtime.stopGeneration(currentConversationId);
      assistantMessageIdRef.current = null;
      useChatStore.getState().stopStreaming();
    }
  }, [runtime, currentConversationId]);

  return { sendMessage, stopGeneration, isStreaming };
}

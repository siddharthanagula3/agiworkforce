import { useCallback } from 'react';
import type { ChatRuntime } from '../lib/runtime';
import { useChatStore, getSystemPromptForMode } from '../stores/chatStore';

export function useChat(runtime: ChatRuntime | null) {
  const isStreaming = useChatStore((s) => s.isStreaming);
  const currentConversationId = useChatStore((s) => s.currentConversationId);

  const sendMessage = useCallback(
    (content: string) => {
      if (!runtime || !currentConversationId || isStreaming) return;

      const store = useChatStore.getState();
      const systemPrompt = getSystemPromptForMode(store.activeMode);

      store.addMessage(currentConversationId, {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      });
      store.startStreaming();

      void runtime
        .sendMessage(currentConversationId, content, systemPrompt ? { systemPrompt } : undefined)
        .finally(() => {
          store.stopStreaming();
        });
    },
    [runtime, currentConversationId, isStreaming],
  );

  const stopGeneration = useCallback(() => {
    if (runtime && currentConversationId) {
      runtime.stopGeneration(currentConversationId);
      useChatStore.getState().stopStreaming();
    }
  }, [runtime, currentConversationId]);

  return { sendMessage, stopGeneration, isStreaming };
}

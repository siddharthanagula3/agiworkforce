import { useCallback, useMemo, useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';
import { useProjectStore } from '../stores/projectStore';
import type { ChatRuntime } from '../lib/runtime';
import type { ChatMessage } from '../lib/types';
import { generateId } from '../lib/utils';

export function useChat(runtime: ChatRuntime) {
  const abortRef = useRef<AbortController | null>(null);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const startStreaming = useChatStore((s) => s.startStreaming);
  const stopStreamingState = useChatStore((s) => s.stopStreaming);
  const thinkingEnabled = useModelStore((s) => s.thinkingEnabled);
  const getSelectedModel = useModelStore((s) => s.getSelectedModel);
  const activeProject = useProjectStore((s) => s.getActiveProject);

  const sendMessage = useCallback(
    async (content: string, attachments?: ChatMessage['attachments']) => {
      // FIX 7: Read live value from store instead of using potentially-stale closure
      const conversationId = useChatStore.getState().currentConversationId;
      if (!conversationId || !content.trim()) return;

      const model = getSelectedModel();
      if (!model) return;

      const userMessage: ChatMessage = {
        id: generateId(),
        conversationId,
        role: 'user',
        content: content.trim(),
        createdAt: new Date().toISOString(),
        model: model.id,
        provider: model.provider,
        attachments,
      };

      addMessage(conversationId, userMessage);

      const assistantId = generateId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        conversationId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        model: model.id,
        provider: model.provider,
        isStreaming: true,
      };

      addMessage(conversationId, assistantMessage);
      startStreaming();

      const controller = new AbortController();
      abortRef.current = controller;

      // FIX 1: Accumulate content locally to avoid shared-store race condition
      let accumulatedContent = '';

      try {
        const stream = runtime.sendMessage({
          conversationId,
          content: content.trim(),
          model: model.id,
          provider: model.provider,
          attachments,
          enableThinking: thinkingEnabled && model.supportsThinking,
          enableWebSearch: false,
          projectInstructions: activeProject()?.instructions,
          signal: controller.signal,
        });

        for await (const chunk of stream) {
          if (chunk.type === 'text' && chunk.content) {
            accumulatedContent += chunk.content;
            updateMessage(conversationId, assistantId, {
              content: accumulatedContent,
            });
          } else if (chunk.type === 'done') {
            updateMessage(conversationId, assistantId, {
              isStreaming: false,
              content: accumulatedContent,
            });
          } else if (chunk.type === 'error') {
            updateMessage(conversationId, assistantId, {
              isStreaming: false,
              content: chunk.content ?? 'An error occurred.',
            });
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          updateMessage(conversationId, assistantId, {
            isStreaming: false,
            content: `Error: ${(err as Error).message}`,
          });
        }
      } finally {
        stopStreamingState();
        abortRef.current = null;
      }
    },
    [
      thinkingEnabled,
      runtime,
      addMessage,
      updateMessage,
      startStreaming,
      stopStreamingState,
      getSelectedModel,
      activeProject,
    ],
  );

  // FIX 3: Remove stopStreamingState from stopGeneration — finally block handles it
  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    const conversationId = useChatStore.getState().currentConversationId;
    if (conversationId) {
      runtime.stopGeneration(conversationId);
    }
  }, [runtime]);

  return useMemo(() => ({ sendMessage, stopGeneration }), [sendMessage, stopGeneration]);
}

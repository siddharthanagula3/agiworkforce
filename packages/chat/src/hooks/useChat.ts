import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { ChatRuntime } from '../lib/runtime';
import type { ChatMessage } from '../lib/types';
import { useChatStore, getSystemPromptForMode } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';

/**
 * Get the desktop chat store if available (exposed via window.__AGI_DESKTOP_CHAT_STORE__).
 * Falls back to the package chat store.
 */
function getDesktopStore() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const desktopStore = (window as any).__AGI_DESKTOP_CHAT_STORE__;
  return desktopStore?.getState?.() ?? null;
}

/** Add message using the desktop store (1-arg) or package store (2-arg). */
function storeAddMessage(msg: Partial<ChatMessage> & { role: string; content: string }) {
  const desktop = getDesktopStore();
  if (desktop?.addMessage) {
    // Desktop store: addMessage({ role, content }) — auto-creates conversation
    desktop.addMessage({ role: msg.role, content: msg.content, id: msg.id });
    return;
  }
  // Fallback: package store
  const store = useChatStore.getState();
  const convId = store.activeConversationId;
  if (convId) {
    store.addMessage(convId, msg as ChatMessage);
  }
}

export function useChat(runtime: ChatRuntime | null) {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const assistantMessageIdRef = useRef<string | null>(null);
  // Use ref for isStreaming to avoid stale closures in useCallback
  const isStreamingRef = useRef(false);
  isStreamingRef.current = useChatStore((s) => s.isStreaming);

  // Register stream callback on runtime to receive assistant responses
  useEffect(() => {
    if (!runtime?.onStream) return;

    const unsubscribe = runtime.onStream((event) => {
      const store = useChatStore.getState();
      const convId = store.activeConversationId;
      if (!convId) return;

      switch (event.type) {
        case 'content': {
          // Create or append to assistant message
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            storeAddMessage({
              id,
              role: 'assistant',
              content: event.content,
              timestamp: new Date().toISOString(),
              isStreaming: true,
            });
          } else {
            // Append content to existing assistant message
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              store.updateMessage(convId, assistantMessageIdRef.current, {
                content: msg.content + event.content,
              });
            }
          }
          break;
        }
        case 'thinking': {
          // Store thinking text in the assistant message
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            storeAddMessage({
              id,
              role: 'assistant',
              content: '',
              timestamp: new Date().toISOString(),
              thinking: event.content,
              isStreaming: true,
              thinkingBlock: {
                id: crypto.randomUUID(),
                steps: [
                  {
                    id: crypto.randomUUID(),
                    type: 'thinking',
                    content: event.content,
                  },
                ],
                summary: 'Thinking...',
              },
            });
          } else {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const existingThinking = msg.thinking ?? '';
              const existingBlock = msg.thinkingBlock;
              const thinkingStepId =
                existingBlock?.steps.find((s) => s.type === 'thinking')?.id ?? crypto.randomUUID();
              const updatedSteps = existingBlock
                ? [
                    ...existingBlock.steps.filter((s) => s.type !== 'thinking'),
                    {
                      id: thinkingStepId,
                      type: 'thinking' as const,
                      content: existingThinking + event.content,
                    },
                  ]
                : [
                    {
                      id: crypto.randomUUID(),
                      type: 'thinking' as const,
                      content: existingThinking + event.content,
                    },
                  ];
              store.updateMessage(convId, assistantMessageIdRef.current, {
                thinking: existingThinking + event.content,
                thinkingBlock: {
                  id: existingBlock?.id ?? crypto.randomUUID(),
                  steps: updatedSteps,
                  summary: 'Thinking...',
                },
              });
            }
          }
          break;
        }
        case 'tool_call': {
          // Store tool call info in the assistant message
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            storeAddMessage({
              id,
              role: 'assistant',
              content: '',
              timestamp: new Date().toISOString(),
              isStreaming: true,
              toolCalls: [
                {
                  id: event.toolCall.id,
                  name: event.toolCall.name,
                  args: event.toolCall.args,
                  status: 'running',
                },
              ],
            });
          } else {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const existingCalls = msg.toolCalls ?? [];
              const existingIdx = existingCalls.findIndex((tc) => tc.id === event.toolCall.id);
              const newCall = {
                id: event.toolCall.id,
                name: event.toolCall.name,
                args: event.toolCall.args,
                status: 'running' as const,
              };
              const updatedCalls =
                existingIdx >= 0
                  ? existingCalls.map((tc, idx) => (idx === existingIdx ? newCall : tc))
                  : [...existingCalls, newCall];
              store.updateMessage(convId, assistantMessageIdRef.current, {
                toolCalls: updatedCalls,
              });
            }
          }
          break;
        }
        case 'tool_result': {
          // Update an existing tool call with its result
          if (assistantMessageIdRef.current) {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const updatedCalls = (msg.toolCalls ?? []).map((tc) =>
                tc.id === event.toolCallId
                  ? { ...tc, result: event.result, status: 'completed' as const }
                  : tc,
              );
              store.updateMessage(convId, assistantMessageIdRef.current, {
                toolCalls: updatedCalls,
              });
            }
          }
          break;
        }
        case 'done': {
          // Mark the message as no longer streaming
          if (assistantMessageIdRef.current) {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const doneUpdates: Partial<ChatMessage> = { isStreaming: false };
              // Mark thinking block as done
              if (msg.thinkingBlock) {
                const hasCompletionStep = msg.thinkingBlock.steps.some((s) => s.type === 'done');
                if (!hasCompletionStep) {
                  doneUpdates.thinkingBlock = {
                    ...msg.thinkingBlock,
                    steps: [
                      ...msg.thinkingBlock.steps,
                      {
                        id: crypto.randomUUID(),
                        type: 'done',
                        content: 'Done',
                      },
                    ],
                    summary: 'Thought process',
                  };
                }
              }
              store.updateMessage(convId, assistantMessageIdRef.current, doneUpdates);
            }
          }
          assistantMessageIdRef.current = null;
          store.stopStreaming();
          break;
        }
        case 'error': {
          if (assistantMessageIdRef.current) {
            store.updateMessage(convId, assistantMessageIdRef.current, {
              isStreaming: false,
            });
          }
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

      // Add user message — desktop store auto-creates conversation if needed
      storeAddMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content,
      });

      // Get activeConversationId from desktop store (it may have just been created)
      const desktop = getDesktopStore();
      const convId = desktop?.activeConversationId ?? store.activeConversationId;

      if (!convId) {
        toast.error('Failed to create conversation');
        return;
      }

      store.startStreaming();

      const systemPrompt = getSystemPromptForMode(store.activeMode);
      const modelState = useModelStore.getState();
      const selectedModelId = modelState.selectedModelId;
      const thinkingEnabled = modelState.thinkingEnabled;
      const webSearchEnabled = store.webSearchEnabled;

      // Reset assistant message ref for new response
      assistantMessageIdRef.current = null;

      // Build full conversation history for multi-turn context
      const allMessages = store.messagesByConversation[convId] ?? [];
      const messageHistory = allMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      void runtime
        .sendMessage(convId, content, {
          ...(systemPrompt ? { systemPrompt } : {}),
          model: selectedModelId,
          webSearch: webSearchEnabled,
          thinkingEnabled,
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
    if (runtime && activeConversationId) {
      runtime.stopGeneration(activeConversationId);
      assistantMessageIdRef.current = null;
      useChatStore.getState().stopStreaming();
    }
  }, [runtime, activeConversationId]);

  const isStreaming = useChatStore((s) => s.isStreaming);
  return { sendMessage, stopGeneration, isStreaming };
}

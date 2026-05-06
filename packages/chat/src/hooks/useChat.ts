import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { ChatHostBridge } from '../lib/hostBridge';
import type { ChatRuntime } from '../lib/runtime';
import type { ChatMessage } from '../lib/types';
import { syncPackageStoreFromHost } from './useHostBridgeSync';
import { useChatStore, getSystemPromptForMode } from '../stores/chatStore';
import { useModelStore } from '../stores/modelStore';

interface UseChatOptions {
  hostBridge?: ChatHostBridge | null;
  externalAddMessage?: (msg: { role: string; content: string; id?: string }) => void;
}

export function useChat(runtime: ChatRuntime | null, options?: UseChatOptions) {
  const externalAddMessageRef = useRef(options?.externalAddMessage);
  externalAddMessageRef.current = options?.externalAddMessage;
  const hostBridgeRef = useRef(options?.hostBridge ?? null);
  hostBridgeRef.current = options?.hostBridge ?? null;

  /** Add message to the host bridge when provided, then to the package store for rendering. */
  const addMsg = useCallback((msg: Partial<ChatMessage> & { role: string; content: string }) => {
    const msgId = msg.id ?? crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const hostBridge = hostBridgeRef.current;

    if (hostBridge?.addMessage) {
      hostBridge.addMessage({ role: msg.role, content: msg.content, id: msgId });
    } else if (externalAddMessageRef.current) {
      externalAddMessageRef.current({ role: msg.role, content: msg.content, id: msgId });
    }

    const pkgStore = useChatStore.getState();
    let convId = pkgStore.activeConversationId;

    if (!convId && hostBridge) {
      syncPackageStoreFromHost(hostBridge);
      convId = useChatStore.getState().activeConversationId;
    }

    if (convId) {
      pkgStore.addMessage(convId, {
        id: msgId,
        role: msg.role,
        content: msg.content,
        timestamp,
      } as ChatMessage);
    }
  }, []);

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
            addMsg({
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
            addMsg({
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
            addMsg({
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
                  ? {
                      ...tc,
                      result: event.result ?? event.error ?? tc.result,
                      status: event.error ? ('failed' as const) : ('completed' as const),
                    }
                  : tc,
              );
              store.updateMessage(convId, assistantMessageIdRef.current, {
                toolCalls: updatedCalls,
              });
            }
          }
          break;
        }
        case 'artifact': {
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            addMsg({
              id,
              role: 'assistant',
              content: '',
              timestamp: new Date().toISOString(),
              isStreaming: true,
              artifacts: [event.artifact],
            });
          } else {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const existingArtifacts = msg.artifacts ?? [];
              const artifactIndex = existingArtifacts.findIndex(
                (artifact) => artifact.id === event.artifact.id,
              );
              const updatedArtifacts =
                artifactIndex >= 0
                  ? existingArtifacts.map((artifact, index) =>
                      index === artifactIndex ? event.artifact : artifact,
                    )
                  : [...existingArtifacts, event.artifact];

              store.updateMessage(convId, assistantMessageIdRef.current, {
                artifacts: updatedArtifacts,
              });
            }
          }
          break;
        }
        case 'search_results': {
          if (!assistantMessageIdRef.current) {
            const id = crypto.randomUUID();
            assistantMessageIdRef.current = id;
            addMsg({
              id,
              role: 'assistant',
              content: '',
              timestamp: new Date().toISOString(),
              isStreaming: true,
              webSearchResults: [event.search],
            });
          } else {
            const msgs = store.messagesByConversation[convId];
            const msg = msgs?.find((m) => m.id === assistantMessageIdRef.current);
            if (msg) {
              const existingSearches = msg.webSearchResults ?? [];
              const searchIndex = existingSearches.findIndex(
                (search) => search.id === event.search.id,
              );
              const updatedSearches =
                searchIndex >= 0
                  ? existingSearches.map((search, index) =>
                      index === searchIndex ? event.search : search,
                    )
                  : [...existingSearches, event.search];

              store.updateMessage(convId, assistantMessageIdRef.current, {
                webSearchResults: updatedSearches,
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
  }, [runtime, addMsg]);

  const sendMessage = useCallback(
    (content: string, agentMode?: string, effort?: string) => {
      if (!runtime || isStreamingRef.current) return;

      const store = useChatStore.getState();

      // Add user message — desktop store auto-creates conversation if needed
      addMsg({
        id: crypto.randomUUID(),
        role: 'user',
        content,
      });

      // Re-read after addMsg (which may have synced the convId from desktop store)
      const convId = useChatStore.getState().activeConversationId;

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
          ...(agentMode ? { agentMode } : {}),
          ...(effort ? { effort } : {}),
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
    [runtime, addMsg],
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

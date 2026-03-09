/**
 * useStopGeneration
 *
 * Custom hook that encapsulates handleStopGeneration and the NEW_CHAT_ABORT_EVENT useEffect
 * from UnifiedAgenticChat.
 */
import { useEffect, useCallback } from 'react';
import { isTauri } from '../../lib/tauri-mock';
import { invoke as ipcInvoke } from '../../utils/ipc';
import { useUnifiedChatStore, uuidToDbId } from '../../stores/unifiedChatStore';
import { NEW_CHAT_ABORT_EVENT } from '../../lib/newChatReset';

export interface UseStopGenerationConfig {
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  activeStreamSessionsRef: React.MutableRefObject<Map<number, string>>;
  toolExecutionTimeoutsRef: React.MutableRefObject<
    Map<
      string,
      {
        conversationId: number;
        softTimeoutId: ReturnType<typeof setTimeout>;
        hardTimeoutId: ReturnType<typeof setTimeout>;
      }
    >
  >;
  streamWatchdogTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  updateMessage: ReturnType<typeof useUnifiedChatStore.getState>['updateMessage'];
  setIsLoading: ReturnType<typeof useUnifiedChatStore.getState>['setIsLoading'];
  setStreamingMessage: ReturnType<typeof useUnifiedChatStore.getState>['setStreamingMessage'];
  clearQueuedStreamUpdates: (messageId?: string) => void;
}

export function useStopGeneration(config: UseStopGenerationConfig) {
  const {
    abortControllerRef,
    activeStreamSessionsRef,
    toolExecutionTimeoutsRef,
    streamWatchdogTimeoutRef,
    updateMessage,
    setIsLoading,
    setStreamingMessage,
    clearQueuedStreamUpdates,
  } = config;

  const handleStopGeneration = useCallback(async () => {
    // AUDIT-STREAM-059 fix: Clear the stream watchdog when user stops generation
    if (streamWatchdogTimeoutRef.current) {
      clearTimeout(streamWatchdogTimeoutRef.current);
      streamWatchdogTimeoutRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // AUDIT-STREAM-038 fix: Pass conversation ID for scoped stop
    const activeConversationId = useUnifiedChatStore.getState().activeConversationId;
    const conversationDbId = activeConversationId ? uuidToDbId(activeConversationId) : undefined;

    if (isTauri) {
      try {
        await ipcInvoke('chat_stop_generation', { conversationId: conversationDbId });
      } catch (error) {
        console.warn('[UnifiedAgenticChat] Failed to stop generation:', error);
      }
    }

    const currentStreamingId = useUnifiedChatStore.getState().currentStreamingMessageId;
    if (currentStreamingId) {
      clearQueuedStreamUpdates(currentStreamingId);
      updateMessage(currentStreamingId, {
        metadata: { streaming: false },
      });
    } else {
      clearQueuedStreamUpdates();
    }

    // AUDIT-STREAM-037 fix: Clear per-tool timeout callbacks to prevent stale timeout errors
    toolExecutionTimeoutsRef.current.forEach((timeoutEntry) => {
      clearTimeout(timeoutEntry.softTimeoutId);
      clearTimeout(timeoutEntry.hardTimeoutId);
    });
    toolExecutionTimeoutsRef.current.clear();

    setIsLoading(false);
    setStreamingMessage(null);
  }, [
    abortControllerRef,
    streamWatchdogTimeoutRef,
    toolExecutionTimeoutsRef,
    updateMessage,
    setIsLoading,
    setStreamingMessage,
    clearQueuedStreamUpdates,
  ]);

  useEffect(() => {
    const handleNewConversation = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      activeStreamSessionsRef.current.clear();
      toolExecutionTimeoutsRef.current.forEach((timeoutEntry) => {
        clearTimeout(timeoutEntry.softTimeoutId);
        clearTimeout(timeoutEntry.hardTimeoutId);
      });
      toolExecutionTimeoutsRef.current.clear();

      if (isTauri) {
        void ipcInvoke('chat_stop_generation').catch((error: unknown) => {
          console.warn('[UnifiedAgenticChat] Failed to stop generation on new chat:', error);
        });
      }

      const state = useUnifiedChatStore.getState();
      if (state.currentStreamingMessageId) {
        clearQueuedStreamUpdates(state.currentStreamingMessageId);
        updateMessage(state.currentStreamingMessageId, {
          metadata: { streaming: false },
        });
      } else {
        clearQueuedStreamUpdates();
      }
      setIsLoading(false);
      setStreamingMessage(null);
      const unifiedState = useUnifiedChatStore.getState();
      unifiedState.clearActionTrail();
      unifiedState.clearToolStreams();
    };

    window.addEventListener(NEW_CHAT_ABORT_EVENT, handleNewConversation);
    return () => window.removeEventListener(NEW_CHAT_ABORT_EVENT, handleNewConversation);
  }, [
    abortControllerRef,
    activeStreamSessionsRef,
    toolExecutionTimeoutsRef,
    clearQueuedStreamUpdates,
    setIsLoading,
    setStreamingMessage,
    updateMessage,
  ]);

  return { handleStopGeneration };
}

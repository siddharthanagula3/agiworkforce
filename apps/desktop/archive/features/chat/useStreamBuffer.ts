/**
 * useStreamBuffer
 *
 * Custom hook that manages stream throttling state — batches stream updates
 * using requestAnimationFrame to avoid React saturation.
 */
import { useRef, useCallback } from 'react';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';

export function useStreamBuffer() {
  // Stream Throttling state - batches updates to avoid React saturation
  const streamBufferRef = useRef<Map<string, string>>(new Map());
  const rafIdRef = useRef<number | null>(null);
  const lastStreamActivityAtRef = useRef<number>(0);

  /**
   * Processes buffered stream updates using requestAnimationFrame.
   * This batches multiple chunks into a single React update per frame.
   */
  const processStreamBuffer = useCallback(() => {
    if (streamBufferRef.current.size === 0) {
      rafIdRef.current = null;
      return;
    }

    const state = useUnifiedChatStore.getState();
    streamBufferRef.current.forEach((content, messageId) => {
      state.updateMessage(messageId, {
        content,
        metadata: { streaming: true },
      });
    });

    streamBufferRef.current.clear();
    rafIdRef.current = requestAnimationFrame(processStreamBuffer);
  }, []);

  const queueStreamUpdate = useCallback(
    (messageId: string, fullContent: string) => {
      streamBufferRef.current.set(messageId, fullContent);
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(processStreamBuffer);
      }
    },
    [processStreamBuffer],
  ); // Added queueStreamUpdate via useCallback dependency

  const clearQueuedStreamUpdates = useCallback((messageId?: string) => {
    if (messageId) {
      streamBufferRef.current.delete(messageId);
    } else {
      streamBufferRef.current.clear();
    }

    if (streamBufferRef.current.size === 0 && rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const markStreamActivity = useCallback(() => {
    lastStreamActivityAtRef.current = Date.now();
  }, []);

  return {
    streamBufferRef,
    rafIdRef,
    processStreamBuffer,
    queueStreamUpdate,
    clearQueuedStreamUpdates,
    markStreamActivity,
    lastStreamActivityAtRef,
  };
}

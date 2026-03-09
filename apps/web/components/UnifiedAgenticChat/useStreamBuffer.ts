/**
 * useStreamBuffer
 *
 * Custom hook that encapsulates all stream-buffering refs and callbacks used by
 * the UnifiedAgenticChat component. Provides throttled stream updates via
 * requestAnimationFrame to avoid React saturation, plus lifecycle refs for
 * abort controllers, tool execution timeouts, listener registration guards,
 * and active stream session tracking.
 */
import { useRef, useCallback } from 'react';
import { useUnifiedChatStore } from '@/stores/unified/unifiedChatStore';

export interface StreamBufferRefs {
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  streamBufferRef: React.MutableRefObject<Map<string, string>>;
  rafIdRef: React.MutableRefObject<number | null>;
  streamWatchdogTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  lastStreamActivityAtRef: React.MutableRefObject<number>;
  unlistenFnsRef: React.MutableRefObject<Array<() => void | Promise<void>>>;
  listenerSetupGenerationRef: React.MutableRefObject<number>;
  isMountedRef: React.MutableRefObject<boolean>;
  toolExecutionTimeoutsRef: React.MutableRefObject<
    Map<
      string,
      {
        softTimeoutId: ReturnType<typeof setTimeout>;
        hardTimeoutId: ReturnType<typeof setTimeout>;
      }
    >
  >;
  activeStreamSessionsRef: React.MutableRefObject<Map<number, string>>;
}

export interface StreamBufferCallbacks {
  processStreamBuffer: () => void;
  queueStreamUpdate: (messageId: string, fullContent: string) => void;
  clearQueuedStreamUpdates: (messageId?: string) => void;
  markStreamActivity: () => void;
}

export type UseStreamBufferReturn = StreamBufferRefs & StreamBufferCallbacks;

export function useStreamBuffer(): UseStreamBufferReturn {
  const abortControllerRef = useRef<AbortController | null>(null);
  // Ref to store unlisten functions for synchronous cleanup
  // Note: Unlisten can return void or Promise<void> depending on the event type
  const unlistenFnsRef = useRef<Array<() => void | Promise<void>>>([]);
  // Guards async listener registration against StrictMode/dev double-mount races.
  const listenerSetupGenerationRef = useRef(0);
  const isMountedRef = useRef(true);
  const toolExecutionTimeoutsRef = useRef<
    Map<
      string,
      {
        softTimeoutId: ReturnType<typeof setTimeout>;
        hardTimeoutId: ReturnType<typeof setTimeout>;
      }
    >
  >(new Map());

  // CHT-005 fix: Track active stream sessions to prevent race conditions
  const activeStreamSessionsRef = useRef<Map<number, string>>(new Map());

  // AUDIT-STREAM-059 fix: Track stream watchdog timeout
  const streamWatchdogTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastStreamActivityAtRef = useRef<number>(0);

  // Stream Throttling state - batches updates to avoid React saturation
  const streamBufferRef = useRef<Map<string, string>>(new Map());
  const rafIdRef = useRef<number | null>(null);

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
    abortControllerRef,
    streamBufferRef,
    rafIdRef,
    streamWatchdogTimeoutRef,
    lastStreamActivityAtRef,
    unlistenFnsRef,
    listenerSetupGenerationRef,
    isMountedRef,
    toolExecutionTimeoutsRef,
    activeStreamSessionsRef,
    processStreamBuffer,
    queueStreamUpdate,
    clearQueuedStreamUpdates,
    markStreamActivity,
  };
}

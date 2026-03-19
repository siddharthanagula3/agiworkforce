import { useEffect, useRef } from 'react';
import { listen } from '../lib/tauri-mock';
import { useExecutionSidecarStore } from '../stores/executionSidecarStore';

/**
 * Auto-opens the execution sidecar when an agentic loop starts,
 * and collapses it (with delay) when the loop ends.
 *
 * Respects user intent: if the user manually closed the sidecar
 * during the current session, it will not auto-reopen.
 */
export function useExecutionSidecarAutoOpen(): void {
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      // Listen for agentic loop start
      const unlistenStart = await listen<{ conversation_id: number; max_iterations: number }>(
        'agentic:loop-started',
        () => {
          if (!isMounted) return;

          // Clear any pending collapse timer
          if (collapseTimerRef.current) {
            clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = null;
          }

          const state = useExecutionSidecarStore.getState();
          // Only auto-open if user hasn't manually closed this session
          if (!state.userClosedThisSession) {
            state.open();
          }
        },
      );

      if (isMounted) {
        unlisteners.push(unlistenStart);
      } else {
        unlistenStart(); // Already unmounted, clean up immediately
      }

      // Listen for agentic loop end
      const unlistenEnd = await listen<{ conversation_id: number; iterations_used: number }>(
        'agentic:loop-ended',
        () => {
          if (!isMounted) return;

          // Collapse after 3 second delay (not close, so user can still see results)
          collapseTimerRef.current = setTimeout(() => {
            if (!isMounted) return;
            const state = useExecutionSidecarStore.getState();
            if (state.isOpen && !state.isCollapsed) {
              state.collapse();
            }
            collapseTimerRef.current = null;
          }, 3000);
        },
      );

      if (isMounted) {
        unlisteners.push(unlistenEnd);
      } else {
        unlistenEnd(); // Already unmounted, clean up immediately
      }
    };

    setup();

    return () => {
      isMounted = false;

      // Cleanup timer
      const collapseTimer = collapseTimerRef.current;
      if (collapseTimer) {
        clearTimeout(collapseTimer);
      }

      // Cleanup any listeners that have already resolved
      unlisteners.forEach((fn) => fn());
    };
  }, []);
}

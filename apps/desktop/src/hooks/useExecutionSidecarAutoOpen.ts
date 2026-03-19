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
    const unlisteners: Promise<() => void>[] = [];

    // Listen for agentic loop start
    unlisteners.push(
      listen<{ conversation_id: number; max_iterations: number }>('agentic:loop-started', () => {
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
      }),
    );

    // Listen for agentic loop end
    unlisteners.push(
      listen<{ conversation_id: number; iterations_used: number }>('agentic:loop-ended', () => {
        // Collapse after 3 second delay (not close, so user can still see results)
        collapseTimerRef.current = setTimeout(() => {
          const state = useExecutionSidecarStore.getState();
          if (state.isOpen && !state.isCollapsed) {
            state.collapse();
          }
          collapseTimerRef.current = null;
        }, 3000);
      }),
    );

    return () => {
      // Cleanup timer
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }

      // Cleanup listeners
      unlisteners.forEach((p) =>
        p
          .then((unlisten) => unlisten())
          .catch(() => {
            // Cleanup is best-effort
          }),
      );
    };
  }, []);
}

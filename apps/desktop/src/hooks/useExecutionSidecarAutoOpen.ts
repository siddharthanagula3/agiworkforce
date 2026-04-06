import { useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chat/chatStore';
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
    const handleLoopActiveChange = (isActive: boolean) => {
      if (isActive) {
        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current);
          collapseTimerRef.current = null;
        }

        const state = useExecutionSidecarStore.getState();
        if (!state.userClosedThisSession) {
          state.open();
        }
        return;
      }

      collapseTimerRef.current = setTimeout(() => {
        const state = useExecutionSidecarStore.getState();
        if (state.isOpen && !state.isCollapsed) {
          state.collapse();
        }
        collapseTimerRef.current = null;
      }, 3000);
    };

    const getIsLoopActive = () => useChatStore.getState().agenticLoopStatus?.active ?? false;
    let previousIsActive = getIsLoopActive();

    if (previousIsActive) {
      handleLoopActiveChange(true);
    }

    const unsubscribe = useChatStore.subscribe(
      (state) => state.agenticLoopStatus?.active ?? false,
      (isActive) => {
        if (isActive === previousIsActive) {
          return;
        }

        previousIsActive = isActive;
        handleLoopActiveChange(isActive);
      },
    );

    return () => {
      const collapseTimer = collapseTimerRef.current;
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimerRef.current = null;
      }
      unsubscribe();
    };
  }, []);
}

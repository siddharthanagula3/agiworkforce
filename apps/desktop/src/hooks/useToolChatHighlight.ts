import { useEffect, useRef } from 'react';
import { useExecutionSidecarStore } from '../stores/executionSidecarStore';

const HIGHLIGHT_DURATION_MS = 1500;
const HIGHLIGHT_CLASS = 'execution-sidecar-highlight';

/**
 * When `highlightedToolId` changes in the sidecar store, scrolls to the
 * corresponding tool entry in the chat message list and applies a brief
 * highlight animation.
 */
export function useToolChatHighlight(): void {
  const highlightedToolId = useExecutionSidecarStore((s) => s.highlightedToolId);
  const setHighlightedToolId = useExecutionSidecarStore((s) => s.setHighlightedToolId);
  const activeHighlightRef = useRef<Element | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear previous highlight
    if (activeHighlightRef.current) {
      activeHighlightRef.current.classList.remove(HIGHLIGHT_CLASS);
      activeHighlightRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!highlightedToolId) {
      return;
    }

    // Find the tool element in the DOM via data attribute or ID
    const targetElement =
      document.querySelector(`[data-tool-id="${highlightedToolId}"]`) ??
      document.getElementById(`tool-${highlightedToolId}`);

    if (!targetElement) {
      // If element not found, clear the highlight ID
      setHighlightedToolId(null);
      return;
    }

    // Scroll into view
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Apply highlight class
    targetElement.classList.add(HIGHLIGHT_CLASS);
    activeHighlightRef.current = targetElement;

    // Remove highlight after duration
    timerRef.current = setTimeout(() => {
      targetElement.classList.remove(HIGHLIGHT_CLASS);
      activeHighlightRef.current = null;
      setHighlightedToolId(null);
      timerRef.current = null;
    }, HIGHLIGHT_DURATION_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [highlightedToolId, setHighlightedToolId]);
}

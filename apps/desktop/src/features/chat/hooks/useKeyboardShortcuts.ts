/**
 * useKeyboardShortcuts Hook
 *
 * Handles keyboard shortcuts for the chat input area.
 */

import { useEffect } from 'react';

export interface UseKeyboardShortcutsOptions {
  /** Callback when Alt+P is pressed (toggle model selector) */
  onToggleModelSelector?: () => void;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions): void {
  const { onToggleModelSelector, onEscape } = options;

  // Global Alt+P shortcut
  useEffect(() => {
    if (!onToggleModelSelector) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        onToggleModelSelector();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onToggleModelSelector]);

  // Escape key handler
  useEffect(() => {
    if (!onEscape) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onEscape]);
}

export default useKeyboardShortcuts;

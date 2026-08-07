/**
 * Keyboard Shortcuts Hook
 * Provides keyboard shortcuts for common chat actions
 */

import { useEffect, useCallback } from 'react';
import { safePlatform } from '@shared/utils/browser-utils';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  category: 'navigation' | 'conversation' | 'message' | 'ui';
}

/** A shortcut as DOCUMENTED — the same shape without a handler. */
export type KeyboardShortcutDoc = Omit<KeyboardShortcut, 'action'>;

/**
 * The single documented list of chat keyboard shortcuts.
 *
 * There used to be THREE parallel lists: the `handleKeyDown` if-chain below
 * (what actually fires), a `shortcuts` array returned from this hook that no
 * caller read, and a separate four-entry array in `WebChatPage` that WAS the
 * one handed to `KeyboardShortcutsDialog`. They had drifted: Escape,
 * Cmd+Shift+C and Cmd+Shift+R all worked and none of them appeared in the
 * dialog, so the shortcuts screen under-reported the shortcuts that existed.
 *
 * This is now the one list any surface documents from. It must stay in step
 * with the bindings in `handleKeyDown`; `use-keyboard-shortcuts.test.ts` pins
 * that correspondence in both directions.
 */
export const KEYBOARD_SHORTCUT_DOCS: readonly KeyboardShortcutDoc[] = [
  { key: 'K', ctrl: true, meta: true, description: 'Open search', category: 'navigation' },
  { key: '/', ctrl: true, meta: true, description: 'Show keyboard shortcuts', category: 'ui' },
  { key: 'N', ctrl: true, meta: true, description: 'New conversation', category: 'conversation' },
  { key: 'B', ctrl: true, meta: true, description: 'Toggle sidebar', category: 'ui' },
  { key: 'Escape', description: 'Focus message composer', category: 'navigation' },
  {
    key: 'C',
    ctrl: true,
    meta: true,
    shift: true,
    description: 'Copy last message',
    category: 'message',
  },
  {
    key: 'R',
    ctrl: true,
    meta: true,
    shift: true,
    description: 'Regenerate last message',
    category: 'message',
  },
];

interface UseKeyboardShortcutsOptions {
  onNewChat?: () => void;
  onSearch?: () => void;
  onShowShortcuts?: () => void;
  onToggleSidebar?: () => void;
  onFocusComposer?: () => void;
  onCopyLastMessage?: () => void;
  onRegenerateLastMessage?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const {
    onNewChat,
    onSearch,
    onShowShortcuts,
    onToggleSidebar,
    onFocusComposer,
    onCopyLastMessage,
    onRegenerateLastMessage,
    enabled = true,
  } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in input fields (except for specific keys)
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Use modern platform detection instead of deprecated navigator.platform
      const isMac = safePlatform.isMac();
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;

      // Cmd/Ctrl + K: Open search
      if (modifierKey && event.key === 'k') {
        event.preventDefault();
        onSearch?.();
        return;
      }

      // Cmd/Ctrl + /: Show keyboard shortcuts
      if (modifierKey && event.key === '/') {
        event.preventDefault();
        onShowShortcuts?.();
        return;
      }

      // Cmd/Ctrl + N: New chat
      if (modifierKey && event.key === 'n') {
        event.preventDefault();
        onNewChat?.();
        return;
      }

      // Cmd/Ctrl + B: Toggle sidebar
      if (modifierKey && event.key === 'b') {
        event.preventDefault();
        onToggleSidebar?.();
        return;
      }

      // Escape: Focus composer (when not in input field)
      if (event.key === 'Escape' && !isInputField) {
        event.preventDefault();
        onFocusComposer?.();
        return;
      }

      // Cmd/Ctrl + Shift + C: Copy last message
      if (modifierKey && event.shiftKey && event.key === 'c') {
        event.preventDefault();
        onCopyLastMessage?.();
        return;
      }

      // Cmd/Ctrl + Shift + R: Regenerate last message
      if (modifierKey && event.shiftKey && event.key === 'r') {
        event.preventDefault();
        onRegenerateLastMessage?.();
        return;
      }
    },
    [
      enabled,
      onNewChat,
      onSearch,
      onShowShortcuts,
      onToggleSidebar,
      onFocusComposer,
      onCopyLastMessage,
      onRegenerateLastMessage,
    ],
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);

  // Derived from the canonical list above rather than restated, so the
  // documented set and the bound set cannot drift apart again.
  const handlers: Record<string, (() => void) | undefined> = {
    'Open search': onSearch,
    'Show keyboard shortcuts': onShowShortcuts,
    'New conversation': onNewChat,
    'Toggle sidebar': onToggleSidebar,
    'Focus message composer': onFocusComposer,
    'Copy last message': onCopyLastMessage,
    'Regenerate last message': onRegenerateLastMessage,
  };
  const shortcuts: KeyboardShortcut[] = KEYBOARD_SHORTCUT_DOCS.map((doc) => ({
    ...doc,
    action: () => handlers[doc.description]?.(),
  }));

  return { shortcuts };
}

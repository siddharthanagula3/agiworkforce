
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

export type KeyboardShortcutDoc = Omit<KeyboardShortcut, 'action'>;

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

      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      const isMac = safePlatform.isMac();
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;

      if (modifierKey && event.key === 'k') {
        event.preventDefault();
        onSearch?.();
        return;
      }

      if (modifierKey && event.key === '/') {
        event.preventDefault();
        onShowShortcuts?.();
        return;
      }

      if (modifierKey && event.key === 'n') {
        event.preventDefault();
        onNewChat?.();
        return;
      }

      if (modifierKey && event.key === 'b') {
        event.preventDefault();
        onToggleSidebar?.();
        return;
      }

      if (event.key === 'Escape' && !isInputField) {
        event.preventDefault();
        onFocusComposer?.();
        return;
      }

      if (modifierKey && event.shiftKey && event.key === 'c') {
        event.preventDefault();
        onCopyLastMessage?.();
        return;
      }

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

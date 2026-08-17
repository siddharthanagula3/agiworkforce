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
  {
    key: 'A',
    ctrl: true,
    meta: true,
    shift: true,
    description: 'Toggle artifacts panel',
    category: 'ui',
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
  onToggleArtifacts?: () => void;
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
    onToggleArtifacts,
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
      // Shift makes the browser report the shifted character ('C', not 'c'), so
      // every Shift binding below has to compare against the unshifted letter.
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      const matched = (
        [
          [modifierKey && key === 'k', onSearch],
          [modifierKey && key === '/', onShowShortcuts],
          [modifierKey && key === 'n', onNewChat],
          [modifierKey && key === 'b', onToggleSidebar],
          [key === 'Escape' && !isInputField, onFocusComposer],
          [modifierKey && event.shiftKey && key === 'c', onCopyLastMessage],
          [modifierKey && event.shiftKey && key === 'r', onRegenerateLastMessage],
          [modifierKey && event.shiftKey && key === 'a', onToggleArtifacts],
        ] as ReadonlyArray<readonly [boolean, (() => void) | undefined]>
      ).find(([isMatch]) => isMatch);

      // Swallowing the browser default for a shortcut this mount does not
      // implement would break the key for whoever does; only claim what we run.
      const run = matched?.[1];
      if (!run) return;
      event.preventDefault();
      run();
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
      onToggleArtifacts,
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
    'Toggle artifacts panel': onToggleArtifacts,
  };
  const shortcuts: KeyboardShortcut[] = KEYBOARD_SHORTCUT_DOCS.map((doc) => ({
    ...doc,
    action: () => handlers[doc.description]?.(),
  }));

  return { shortcuts };
}

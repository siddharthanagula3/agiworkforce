import { useEffect, useCallback } from 'react';
import { safePlatform } from '@shared/utils/browser-utils';
import { useSettingsStore } from '@shared/stores/web-settings-store';

// A fresh [] each render changes the identity every time and defeats the
// memoization below, which is what the exhaustive-deps warning was pointing at.
const EMPTY_SHORTCUT_IDS: string[] = [];

export interface KeyboardShortcut {
  id: string;
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  category: 'navigation' | 'conversation' | 'message' | 'ui';
}

export type KeyboardShortcutDoc = Omit<KeyboardShortcut, 'action'> & { id: string };

export const KEYBOARD_SHORTCUT_DOCS: readonly KeyboardShortcutDoc[] = [
  {
    key: 'K',
    ctrl: true,
    meta: true,
    id: 'open-search',
    description: 'Open search',
    category: 'navigation',
  },
  {
    key: '/',
    ctrl: true,
    meta: true,
    id: 'show-shortcuts',
    description: 'Show keyboard shortcuts',
    category: 'ui',
  },
  {
    // Cmd/Ctrl+N is a browser-reserved new-window accelerator; the page never
    // sees the keydown, so it cannot be bound to anything. Both ChatGPT and
    // Claude bind new-chat to Shift+Cmd/Ctrl+O for the same reason.
    key: 'O',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'new-conversation',
    description: 'New conversation',
    category: 'conversation',
  },
  {
    key: 'B',
    ctrl: true,
    meta: true,
    id: 'toggle-sidebar',
    description: 'Toggle sidebar',
    category: 'ui',
  },
  {
    key: 'Escape',
    id: 'focus-composer',
    description: 'Focus message composer',
    category: 'navigation',
  },
  {
    key: 'C',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'copy-last-message',
    description: 'Copy last message',
    category: 'message',
  },
  {
    key: 'R',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'regenerate-last-message',
    description: 'Regenerate last message',
    category: 'message',
  },
  {
    key: 'A',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'toggle-artifacts',
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

  const disabledIds = useSettingsStore((state) => state.disabledShortcutIds) ?? EMPTY_SHORTCUT_IDS;

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

      // Driven by KEYBOARD_SHORTCUT_DOCS rather than a parallel hardcoded list.
      // The two used to be separate, so the Settings list described bindings
      // this matcher did not read, and a disable switch over that list would
      // have been decorative. One source now decides both what is shown and
      // what fires.
      const handlerFor: Record<string, (() => void) | undefined> = {
        'open-search': onSearch,
        'show-shortcuts': onShowShortcuts,
        'new-conversation': onNewChat,
        'toggle-sidebar': onToggleSidebar,
        'focus-composer': onFocusComposer,
        'copy-last-message': onCopyLastMessage,
        'regenerate-last-message': onRegenerateLastMessage,
        'toggle-artifacts': onToggleArtifacts,
      };

      const matched = KEYBOARD_SHORTCUT_DOCS.filter((doc) => !disabledIds.includes(doc.id))
        .map((doc): readonly [boolean, (() => void) | undefined] => {
          const wantsModifier = Boolean(doc.ctrl || doc.meta);
          const modifierOk = wantsModifier ? modifierKey : !modifierKey;
          const shiftOk = Boolean(doc.shift) === event.shiftKey;
          const altOk = Boolean(doc.alt) === event.altKey;
          const keyOk = doc.key.length === 1 ? key === doc.key.toLowerCase() : key === doc.key;
          // Escape must not steal a keystroke from a field the user is typing in.
          const contextOk = doc.key === 'Escape' ? !isInputField : true;
          return [modifierOk && shiftOk && altOk && keyOk && contextOk, handlerFor[doc.id]];
        })
        .find(([isMatch]) => isMatch);

      // Swallowing the browser default for a shortcut this mount does not
      // implement would break the key for whoever does; only claim what we run.
      const run = matched?.[1];
      if (!run) return;
      event.preventDefault();
      run();
    },
    [
      disabledIds,
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
    'open-search': onSearch,
    'show-shortcuts': onShowShortcuts,
    'new-conversation': onNewChat,
    'toggle-sidebar': onToggleSidebar,
    'focus-composer': onFocusComposer,
    'copy-last-message': onCopyLastMessage,
    'regenerate-last-message': onRegenerateLastMessage,
    'toggle-artifacts': onToggleArtifacts,
  };
  const shortcuts: KeyboardShortcut[] = KEYBOARD_SHORTCUT_DOCS.map((doc) => ({
    ...doc,
    action: () => handlers[doc.id]?.(),
  }));

  return { shortcuts };
}

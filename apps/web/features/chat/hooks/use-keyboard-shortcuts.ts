import { useEffect, useCallback } from 'react';
import { safePlatform } from '@shared/utils/browser-utils';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import {
  CHAT_SHORTCUTS,
  findShortcut,
  formatShortcutKeys,
  matchesShortcut,
  type ShortcutDefinition,
} from '@agiworkforce/unified-chat';

// A fresh [] each render changes the identity every time and defeats the
// memoization below, which is what the exhaustive-deps warning was pointing at.
const EMPTY_SHORTCUT_IDS: string[] = [];

export type KeyboardShortcutDoc = ShortcutDefinition;

export interface KeyboardShortcut extends KeyboardShortcutDoc {
  action: () => void;
}

/** Every binding the help dialog lists, from the one shared registry. */
export const KEYBOARD_SHORTCUT_DOCS: readonly KeyboardShortcutDoc[] = CHAT_SHORTCUTS;

/** The bindings this hook matches on the window; composer bindings live in the composer. */
const APP_SHORTCUTS = CHAT_SHORTCUTS.filter((doc) => doc.scope === 'app');

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return (
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

function shortcutYieldsToFocus(
  event: KeyboardEvent,
  doc: Pick<KeyboardShortcutDoc, 'firesInEditable'>,
): boolean {
  if (event.defaultPrevented) return true;
  return !doc.firesInEditable && isEditableTarget(event.target);
}

export function findShortcutDoc(id: string): KeyboardShortcutDoc | undefined {
  return findShortcut(id);
}

export { formatShortcutKeys };

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

      const isMac = safePlatform.isMac();

      // Driven by the shared registry rather than a parallel hardcoded list, so
      // the Settings list, the disable switches and this matcher cannot disagree.
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

      const matched = APP_SHORTCUTS.find(
        (doc) =>
          !disabledIds.includes(doc.id) &&
          !shortcutYieldsToFocus(event, doc) &&
          matchesShortcut(event, doc, isMac),
      );

      // Swallowing the browser default for a shortcut this mount does not
      // implement would break the key for whoever does; only claim what we run.
      const run = matched ? handlerFor[matched.id] : undefined;
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
  const shortcuts: KeyboardShortcut[] = APP_SHORTCUTS.map((doc) => ({
    ...doc,
    action: () => handlers[doc.id]?.(),
  }));

  return { shortcuts };
}

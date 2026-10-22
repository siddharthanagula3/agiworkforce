import { TOGGLE_SIDEBAR_SHORTCUT } from '@agiworkforce/ui';
import { OPEN_SEARCH_SHORTCUT } from '@agiworkforce/ui/search-shortcut';

export type ShortcutCategory = 'navigation' | 'conversation' | 'message' | 'ui' | 'composer';

/**
 * `app` bindings are matched on the window, `composer` bindings by the message
 * field's own key handler. An unmodified `app` binding never fires inside a text
 * field, so it can share a key with a `composer` binding without colliding.
 */
export type ShortcutScope = 'app' | 'composer';

export interface ShortcutChord {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutDefinition extends ShortcutChord {
  id: string;
  description: string;
  category: ShortcutCategory;
  scope: ShortcutScope;
  firesInEditable?: boolean;
}

export const COMPOSER_FOLLOW_UP_INVERT_SHORTCUT: ShortcutDefinition = {
  key: 'Enter',
  ctrl: true,
  meta: true,
  shift: true,
  id: 'composer-follow-up-invert',
  firesInEditable: true,
  description: 'While a reply runs, send this follow-up the other way (steer or queue)',
  category: 'composer',
  scope: 'composer',
};

export const CHAT_SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    ...OPEN_SEARCH_SHORTCUT,
    id: 'open-search',
    firesInEditable: true,
    description: 'Open search',
    category: 'navigation',
    scope: 'app',
  },
  {
    key: '/',
    ctrl: true,
    meta: true,
    id: 'show-shortcuts',
    firesInEditable: true,
    description: 'Show keyboard shortcuts',
    category: 'ui',
    scope: 'app',
  },
  {
    // Cmd/Ctrl+N is a browser-reserved new-window accelerator the page never
    // receives; both ChatGPT and Claude bind new chat to Shift+Cmd/Ctrl+O.
    key: 'O',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'new-conversation',
    firesInEditable: true,
    description: 'New conversation',
    category: 'conversation',
    scope: 'app',
  },
  {
    ...TOGGLE_SIDEBAR_SHORTCUT,
    id: 'toggle-sidebar',
    description: 'Toggle sidebar',
    category: 'ui',
    scope: 'app',
  },
  {
    key: 'Escape',
    id: 'focus-composer',
    description: 'Focus message composer',
    category: 'navigation',
    scope: 'app',
  },
  {
    key: 'C',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'copy-last-message',
    firesInEditable: true,
    description: 'Copy last message',
    category: 'message',
    scope: 'app',
  },
  {
    key: 'R',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'regenerate-last-message',
    firesInEditable: true,
    description: 'Regenerate last message',
    category: 'message',
    scope: 'app',
  },
  {
    key: 'A',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'toggle-artifacts',
    firesInEditable: true,
    description: 'Toggle artifacts panel',
    category: 'ui',
    scope: 'app',
  },
  {
    key: 'K',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'select-model',
    firesInEditable: true,
    description: 'Select model',
    category: 'composer',
    scope: 'app',
  },
  {
    key: 'Y',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'toggle-voice',
    firesInEditable: true,
    description: 'Toggle voice',
    category: 'composer',
    scope: 'app',
  },
  {
    key: 'H',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'set-custom-instructions',
    firesInEditable: true,
    description: 'Set custom instructions',
    category: 'ui',
    scope: 'app',
  },
  {
    key: 'X',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'copy-last-code-block',
    firesInEditable: true,
    description: 'Copy last code block',
    category: 'message',
    scope: 'app',
  },
  {
    key: 'Backspace',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'delete-conversation',
    firesInEditable: true,
    description: 'Delete chat',
    category: 'conversation',
    scope: 'app',
  },
  {
    key: 'Enter',
    id: 'composer-send',
    firesInEditable: true,
    description: 'Send message',
    category: 'composer',
    scope: 'composer',
  },
  {
    key: 'Enter',
    shift: true,
    id: 'composer-new-line',
    firesInEditable: true,
    description: 'New line',
    category: 'composer',
    scope: 'composer',
  },
  COMPOSER_FOLLOW_UP_INVERT_SHORTCUT,
  {
    key: 'Escape',
    id: 'composer-stop',
    firesInEditable: true,
    description: 'Stop the response',
    category: 'composer',
    scope: 'composer',
  },
  {
    key: 'ArrowUp',
    id: 'composer-edit-last',
    firesInEditable: true,
    description: 'Edit your last message (empty composer)',
    category: 'composer',
    scope: 'composer',
  },
  {
    key: 'U',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'composer-add-files',
    firesInEditable: true,
    description: 'Add photos & files',
    category: 'composer',
    scope: 'composer',
  },
  {
    key: 'S',
    ctrl: true,
    meta: true,
    shift: true,
    id: 'composer-toggle-dictation',
    firesInEditable: true,
    description: 'Toggle dictation',
    category: 'composer',
    scope: 'composer',
  },
];

export function findShortcut(
  id: string,
  shortcuts: readonly ShortcutDefinition[] = CHAT_SHORTCUTS,
): ShortcutDefinition | undefined {
  return shortcuts.find((shortcut) => shortcut.id === id);
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
};

export function formatShortcutKeys(shortcut: ShortcutChord, isMac: boolean): string[] {
  const keys: string[] = [];
  if (shortcut.ctrl || shortcut.meta) keys.push(isMac ? '⌘' : 'Ctrl');
  if (shortcut.shift) keys.push(isMac ? '⇧' : 'Shift');
  if (shortcut.alt) keys.push(isMac ? '⌥' : 'Alt');
  keys.push(KEY_LABELS[shortcut.key] ?? shortcut.key);
  return keys;
}

function hasPlatformModifier(chord: ShortcutChord): boolean {
  return Boolean(chord.ctrl || chord.meta);
}

export function shortcutChordKey(chord: ShortcutChord): string {
  return [
    hasPlatformModifier(chord) ? 'mod' : '',
    chord.shift ? 'shift' : '',
    chord.alt ? 'alt' : '',
    chord.key.toLowerCase(),
  ].join('+');
}

export interface ShortcutKeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Shift makes the browser report the shifted character, so letters compare unshifted. */
export function matchesShortcut(
  event: ShortcutKeyEventLike,
  shortcut: ShortcutChord,
  isMac: boolean,
): boolean {
  const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
  if (hasPlatformModifier(shortcut) !== modifierPressed) return false;
  if (Boolean(shortcut.shift) !== event.shiftKey) return false;
  if (Boolean(shortcut.alt) !== event.altKey) return false;
  return shortcut.key.length === 1
    ? event.key.toLowerCase() === shortcut.key.toLowerCase()
    : event.key === shortcut.key;
}

/** An unmodified app binding is skipped while the user types, so it cannot reach the composer. */
export function firesInTextFields(shortcut: ShortcutDefinition): boolean {
  return shortcut.scope === 'composer' || hasPlatformModifier(shortcut) || Boolean(shortcut.alt);
}

function scopesOverlap(left: ShortcutDefinition, right: ShortcutDefinition): boolean {
  if (left.scope === right.scope) return true;
  return firesInTextFields(left) && firesInTextFields(right);
}

export interface ShortcutConflict {
  chord: string;
  ids: readonly [string, string];
}

/**
 * Two bindings that can receive the same keystroke, or a binding on a chord
 * something outside the page claims first (a native menu accelerator, a
 * capture-phase listener). The matcher runs the first hit only, so either case
 * advertises a shortcut that never fires.
 */
export function findShortcutConflicts(
  shortcuts: readonly ShortcutDefinition[] = CHAT_SHORTCUTS,
  reserved: readonly (ShortcutChord & { id: string })[] = [],
): ShortcutConflict[] {
  const conflicts: ShortcutConflict[] = [];
  shortcuts.forEach((shortcut, index) => {
    const chord = shortcutChordKey(shortcut);
    for (const other of shortcuts.slice(index + 1)) {
      if (shortcutChordKey(other) === chord && scopesOverlap(shortcut, other)) {
        conflicts.push({ chord, ids: [shortcut.id, other.id] });
      }
    }
    for (const claimed of reserved) {
      if (shortcutChordKey(claimed) === chord) {
        conflicts.push({ chord, ids: [shortcut.id, claimed.id] });
      }
    }
  });
  const ids = shortcuts.map((shortcut) => shortcut.id);
  ids.forEach((id, index) => {
    if (ids.indexOf(id) !== index) conflicts.push({ chord: 'id', ids: [id, id] });
  });
  return conflicts;
}

import { useEffect, useCallback, useMemo } from 'react';
import { HOST_MENU_SHORTCUTS, HOST_SHORTCUT_CHOICES } from '@agiworkforce/local-runtime-contract';
import { safePlatform } from '@shared/utils/browser-utils';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import {
  CHAT_SHORTCUTS,
  findShortcut,
  findShortcutConflicts,
  formatShortcutKeys,
  matchesShortcut,
  type ShortcutChord,
  type ShortcutDefinition,
} from '@agiworkforce/unified-chat';

// A fresh [] each render changes the identity every time and defeats the
// memoization below, which is what the exhaustive-deps warning was pointing at.
const EMPTY_SHORTCUT_IDS: string[] = [];
const EMPTY_SHORTCUT_BINDINGS: Readonly<Record<string, ShortcutChord>> = {};

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

/**
 * Only these accept a recorded combination. The other app shortcuts have their
 * default chord printed from fixed values elsewhere (the sidebar search hint,
 * the account menu, the desktop View menu, the command menu), so rebinding
 * them would leave those hints advertising a key that no longer fires.
 */
export const REBINDABLE_SHORTCUT_IDS: ReadonlySet<string> = new Set([
  'focus-composer',
  'copy-last-message',
  'regenerate-last-message',
  'toggle-artifacts',
]);

export function isRebindableShortcut(doc: KeyboardShortcutDoc): boolean {
  return doc.scope === 'app' && REBINDABLE_SHORTCUT_IDS.has(doc.id);
}

function normalizedChord(chord: ShortcutChord): ShortcutChord {
  return {
    key: chord.key,
    ctrl: Boolean(chord.ctrl),
    meta: Boolean(chord.meta),
    shift: Boolean(chord.shift),
    alt: Boolean(chord.alt),
  };
}

export function withShortcutBindings(
  docs: readonly KeyboardShortcutDoc[],
  bindings: Readonly<Record<string, ShortcutChord>>,
): KeyboardShortcutDoc[] {
  return docs.map((doc) => {
    const chord = Object.hasOwn(bindings, doc.id) ? bindings[doc.id] : undefined;
    if (!chord || !isRebindableShortcut(doc)) return doc;
    return { ...doc, ...normalizedChord(chord) };
  });
}

export function findShortcutDoc(id: string): KeyboardShortcutDoc | undefined {
  const doc = findShortcut(id);
  if (!doc) return undefined;
  const bindings = useSettingsStore.getState().shortcutBindings ?? EMPTY_SHORTCUT_BINDINGS;
  return withShortcutBindings([doc], bindings)[0];
}

export interface ReservedShortcut extends ShortcutChord {
  id: string;
  description: string;
}

const BROWSER_OR_SYSTEM = 'the browser or your system';

function platformChord(key: string, shift = false): ShortcutChord {
  return { key, ctrl: true, meta: true, shift };
}

function acceleratorChord(accelerator: string): ShortcutChord {
  const parts = accelerator.split('+');
  const last = parts.pop() ?? '';
  const modifiers = parts.map((part) => part.toLowerCase());
  const mod = modifiers.some((part) =>
    ['commandorcontrol', 'cmdorctrl', 'command', 'control'].includes(part),
  );
  return {
    key: last === 'Plus' ? '+' : last === 'Space' ? ' ' : last,
    ctrl: mod,
    meta: mod,
    shift: modifiers.includes('shift'),
    alt: modifiers.includes('alt') || modifiers.includes('option'),
  };
}

const BROWSER_RESERVED_KEYS: readonly (readonly [key: string, shift: boolean])[] = [
  ['N', false],
  ['N', true],
  ['T', false],
  ['T', true],
  ['W', false],
  ['W', true],
  ['Q', false],
  ['Q', true],
  ['H', false],
  ['M', false],
  ['L', false],
  ['R', false],
  ['S', false],
  ['D', false],
  ['J', false],
  ['O', false],
  ['U', false],
  ['G', false],
  ['A', false],
  ['C', false],
  ['V', false],
  ['V', true],
  ['X', false],
  ['Y', false],
  ['Z', false],
  ['Z', true],
  ['B', true],
  ['I', true],
  ['J', true],
  ['Tab', false],
  ['Tab', true],
  [' ', false],
  ['=', false],
  ['ArrowLeft', false],
  ['ArrowRight', false],
  ['ArrowUp', false],
  ['ArrowDown', false],
  ['Backspace', false],
  ['1', false],
  ['2', false],
  ['3', false],
  ['4', false],
  ['5', false],
  ['6', false],
  ['7', false],
  ['8', false],
  ['9', false],
];

/**
 * Chords something other than this registry answers first: the browser and
 * the OS, the desktop shell's menu and global hotkeys, and the page's own
 * handlers outside the registry (command menu, find, Code panes, composer).
 */
export const RESERVED_SHORTCUTS: readonly ReservedShortcut[] = [
  ...BROWSER_RESERVED_KEYS.map(([key, shift]) => ({
    id: `browser-${shift ? 'shift-' : ''}${key}`,
    description: BROWSER_OR_SYSTEM,
    ...platformChord(key, shift),
  })),
  { id: 'command-menu', description: 'the command menu', ...platformChord('K') },
  { id: 'find-in-chat', description: 'Find in conversation', ...platformChord('F') },
  { id: 'code-files', description: 'Files in Code', ...platformChord('P') },
  { id: 'code-review', description: 'Review in Code', ...platformChord('G', true) },
  {
    id: 'code-permissions',
    description: 'Switch permissions in Code',
    ...platformChord('M', true),
  },
  { id: 'code-close-pane', description: 'Close pane in Code', ...platformChord('\\') },
  { id: 'composer-send-modifier', description: 'Send message', ...platformChord('Enter') },
  ...HOST_MENU_SHORTCUTS.map((shortcut) => ({
    id: shortcut.id,
    description: `the desktop app (${shortcut.description})`,
    ...acceleratorChord(shortcut.accelerator),
  })),
  ...Object.entries(HOST_SHORTCUT_CHOICES).flatMap(([key, accelerators]) =>
    accelerators.map((accelerator) => ({
      id: `host-global-${key}-${accelerator}`,
      description: 'a desktop app global shortcut',
      ...acceleratorChord(accelerator),
    })),
  ),
];

const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  'Shift',
  'Control',
  'Meta',
  'Alt',
  'AltGraph',
  'CapsLock',
  'Fn',
  'FnLock',
  'Hyper',
  'Super',
  'OS',
  'Dead',
  'Unidentified',
  'Process',
]);

/** The combination a keydown spells, or null while only modifiers are held. */
export function chordFromKeyboardEvent(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  isMac: boolean,
): ShortcutChord | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  return {
    key: event.key.length === 1 ? event.key.toUpperCase() : event.key,
    ctrl: mod,
    meta: mod,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}

export type ShortcutBindingCheck =
  | { ok: true }
  | { ok: false; reason: 'needs-modifier' }
  | { ok: false; reason: 'taken'; by: string };

/**
 * A recorded combination must hold Cmd or Ctrl, so it cannot swallow typing,
 * and no Option or Alt, which turns letters into other characters on a Mac.
 * It is checked against the effective bindings and everything reserved.
 */
export function checkShortcutBinding(
  target: KeyboardShortcutDoc,
  chord: ShortcutChord,
  docs: readonly KeyboardShortcutDoc[],
): ShortcutBindingCheck {
  if (!(chord.ctrl || chord.meta) || chord.alt) return { ok: false, reason: 'needs-modifier' };
  const others = docs.filter((doc) => doc.id !== target.id);
  const candidate = { ...target, ...normalizedChord(chord) };
  const conflict = findShortcutConflicts([candidate, ...others], RESERVED_SHORTCUTS).find(
    ({ ids }) => ids[0] === target.id && ids[1] !== target.id,
  );
  if (!conflict) return { ok: true };
  const otherId = conflict.ids[1];
  const by =
    others.find((doc) => doc.id === otherId)?.description ??
    RESERVED_SHORTCUTS.find((reserved) => reserved.id === otherId)?.description ??
    BROWSER_OR_SYSTEM;
  return { ok: false, reason: 'taken', by };
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
  const bindings = useSettingsStore((state) => state.shortcutBindings) ?? EMPTY_SHORTCUT_BINDINGS;
  const appShortcuts = useMemo(() => withShortcutBindings(APP_SHORTCUTS, bindings), [bindings]);

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

      const matched = appShortcuts.find(
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
      appShortcuts,
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
  const shortcuts: KeyboardShortcut[] = appShortcuts.map((doc) => ({
    ...doc,
    action: () => handlers[doc.id]?.(),
  }));

  return { shortcuts };
}

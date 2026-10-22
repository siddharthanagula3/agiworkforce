import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOST_MENU_SHORTCUTS } from '@agiworkforce/local-runtime-contract';
import { findShortcutConflicts, type ShortcutChord } from '@agiworkforce/unified-chat';

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { KEYBOARD_SHORTCUT_DOCS, useKeyboardShortcuts } from './use-keyboard-shortcuts';

const APP_DOCS = KEYBOARD_SHORTCUT_DOCS.filter((doc) => doc.scope === 'app');

/** An Electron accelerator as the chord the page would see, were it delivered. */
function acceleratorChord(accelerator: string): ShortcutChord {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const modifiers = parts.map((part) => part.toLowerCase());
  const mod = modifiers.some((part) =>
    ['commandorcontrol', 'cmdorctrl', 'command', 'control'].includes(part),
  );
  return {
    key: key === 'Plus' ? '+' : key,
    ctrl: mod,
    meta: mod,
    shift: modifiers.includes('shift'),
    alt: modifiers.includes('alt') || modifiers.includes('option'),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function press(key: string, modifiers: { meta?: boolean; shift?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    // A real browser reports the shifted character, so Shift+a arrives as 'A'.
    key: modifiers.shift && key.length === 1 ? key.toUpperCase() : key,
    metaKey: modifiers.meta ?? false,
    ctrlKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

const HANDLER_KEYS = [
  'onSearch',
  'onShowShortcuts',
  'onNewChat',
  'onToggleSidebar',
  'onFocusComposer',
  'onCopyLastMessage',
  'onRegenerateLastMessage',
  'onToggleArtifacts',
  'onSelectModel',
  'onToggleVoice',
  'onSetCustomInstructions',
  'onCopyLastCodeBlock',
  'onDeleteConversation',
] as const;

type HandlerKey = (typeof HANDLER_KEYS)[number];

function renderWithSpies() {
  const handlers = {} as Record<HandlerKey, ReturnType<typeof vi.fn<() => void>>>;
  for (const key of HANDLER_KEYS) handlers[key] = vi.fn<() => void>();
  const view = renderHook(() => useKeyboardShortcuts(handlers));
  return { handlers, view };
}

describe('KEYBOARD_SHORTCUT_DOCS', () => {
  it('documents every shortcut the hook binds', () => {
    expect(APP_DOCS.map((doc) => doc.description)).toEqual([
      'Open search',
      'Show keyboard shortcuts',
      'New conversation',
      'Toggle sidebar',
      'Focus message composer',
      'Copy last message',
      'Regenerate last message',
      'Toggle artifacts panel',
      'Select model',
      'Toggle voice',
      'Set custom instructions',
      'Copy last code block',
      'Delete chat',
    ]);
  });

  it('includes the three shortcuts the old dialog list omitted', () => {
    const described = KEYBOARD_SHORTCUT_DOCS.map((doc) => doc.description);
    expect(described).toContain('Focus message composer');
    expect(described).toContain('Copy last message');
    expect(described).toContain('Regenerate last message');
  });

  // CommandPaletteProvider claims Cmd/Ctrl+K on `document` in the capture phase
  // and stops propagation, so any doc claiming that key here is unreachable.
  it('does not claim the key the command palette captures', () => {
    const shadowed = KEYBOARD_SHORTCUT_DOCS.filter(
      (doc) => doc.key.toLowerCase() === 'k' && (doc.meta || doc.ctrl) && !doc.shift && !doc.alt,
    );
    expect(shadowed).toEqual([]);
  });

  it('carries no handler, so a documentation surface cannot invoke one', () => {
    for (const doc of KEYBOARD_SHORTCUT_DOCS) {
      expect(doc).not.toHaveProperty('action');
    }
  });

  // The matcher takes the first doc whose chord matches, so a second doc on the
  // same chord is a binding the shortcuts dialog advertises and nothing runs.
  // A desktop menu accelerator is consumed by the shell before the page sees
  // it, and the command palette captures Cmd/Ctrl+K on `document`.
  it('has no conflicting chord, with the page or with what claims keys before it', () => {
    const reserved = [
      ...HOST_MENU_SHORTCUTS.map((shortcut) => ({
        id: shortcut.id,
        ...acceleratorChord(shortcut.accelerator),
      })),
      { id: 'command-palette', key: 'K', ctrl: true, meta: true },
    ];

    expect(findShortcutConflicts(KEYBOARD_SHORTCUT_DOCS, reserved)).toEqual([]);
  });

  it('lists the composer keys alongside the app keys', () => {
    const composerIds = KEYBOARD_SHORTCUT_DOCS.filter((doc) => doc.scope === 'composer').map(
      (doc) => doc.id,
    );
    expect(composerIds).toEqual([
      'composer-send',
      'composer-new-line',
      'composer-follow-up-invert',
      'composer-stop',
      'composer-edit-last',
      'composer-add-files',
      'composer-toggle-dictation',
    ]);
  });
});

describe('useKeyboardShortcuts bindings', () => {
  it.each([
    ['f', { meta: true, shift: true }, 'onSearch'],
    ['/', { meta: true }, 'onShowShortcuts'],
    ['o', { meta: true, shift: true }, 'onNewChat'],
    ['b', { meta: true }, 'onToggleSidebar'],
    ['Escape', {}, 'onFocusComposer'],
    ['c', { meta: true, shift: true }, 'onCopyLastMessage'],
    ['r', { meta: true, shift: true }, 'onRegenerateLastMessage'],
    ['a', { meta: true, shift: true }, 'onToggleArtifacts'],
    ['k', { meta: true, shift: true }, 'onSelectModel'],
    ['y', { meta: true, shift: true }, 'onToggleVoice'],
    ['h', { meta: true, shift: true }, 'onSetCustomInstructions'],
    ['x', { meta: true, shift: true }, 'onCopyLastCodeBlock'],
    ['Backspace', { meta: true, shift: true }, 'onDeleteConversation'],
  ] as const)('fires %s for %s', (key, modifiers, handlerKey) => {
    const { handlers } = renderWithSpies();

    press(key, modifiers);

    expect(handlers[handlerKey]).toHaveBeenCalledTimes(1);
  });

  it('every documented shortcut actually fires something', () => {
    const { handlers } = renderWithSpies();
    const pressed = APP_DOCS.map((doc) => {
      press(doc.key.length === 1 ? doc.key.toLowerCase() : doc.key, {
        meta: Boolean(doc.meta || doc.ctrl),
        shift: Boolean(doc.shift),
      });
      return doc.description;
    });

    expect(pressed).toHaveLength(APP_DOCS.length);
    const totalCalls = Object.values(handlers).reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    expect(totalCalls).toBe(APP_DOCS.length);
  });

  it('does not steal Escape while the user is typing', () => {
    const { handlers } = renderWithSpies();
    const input = document.createElement('textarea');
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(handlers.onFocusComposer).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('leaves the browser default alone for a shortcut this mount does not handle', () => {
    renderHook(() => useKeyboardShortcuts({ onToggleArtifacts: vi.fn() }));

    expect(press('f', { meta: true, shift: true }).defaultPrevented).toBe(false);
    expect(press('a', { meta: true, shift: true }).defaultPrevented).toBe(true);
  });

  it('binds nothing when disabled', () => {
    const onSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSearch, enabled: false }));

    press('f', { meta: true, shift: true });

    expect(onSearch).not.toHaveBeenCalled();
  });
});

describe('useKeyboardShortcuts while focus is in a field or editor', () => {
  function pressOn(
    target: Element,
    key: string,
    modifiers: { meta?: boolean; shift?: boolean } = {},
  ): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: modifiers.shift && key.length === 1 ? key.toUpperCase() : key,
      metaKey: modifiers.meta ?? false,
      ctrlKey: modifiers.meta ?? false,
      shiftKey: modifiers.shift ?? false,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  }

  function mount<T extends HTMLElement>(element: T): T {
    document.body.appendChild(element);
    return element;
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  function editables(): Element[] {
    const textInput = document.createElement('input');
    textInput.type = 'text';
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const line = document.createElement('span');
    editor.appendChild(line);
    mount(editor);
    return [mount(textInput), mount(document.createElement('textarea')), editor, line];
  }

  it('leaves Cmd+B to every kind of editable element', () => {
    const { handlers } = renderWithSpies();

    for (const target of editables()) {
      expect(pressOn(target, 'b', { meta: true }).defaultPrevented).toBe(false);
    }

    expect(handlers.onToggleSidebar).not.toHaveBeenCalled();
  });

  it('still toggles the sidebar from a control that takes no text', () => {
    const { handlers } = renderWithSpies();
    const checkbox = mount(document.createElement('input'));
    checkbox.type = 'checkbox';

    pressOn(checkbox, 'b', { meta: true });

    expect(handlers.onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('runs the shortcuts meant to work while typing', () => {
    const { handlers } = renderWithSpies();

    for (const target of editables()) pressOn(target, 'o', { meta: true, shift: true });

    expect(handlers.onNewChat).toHaveBeenCalledTimes(4);
  });

  it('never runs a shortcut the focused element already handled', () => {
    const { handlers } = renderWithSpies();
    const editor = mount(document.createElement('div'));
    editor.setAttribute('contenteditable', 'true');
    editor.addEventListener('keydown', (event) => event.preventDefault());

    pressOn(editor, '/', { meta: true });

    expect(handlers.onShowShortcuts).not.toHaveBeenCalled();
  });

  it('keeps Cmd+B out of a CodeMirror editor', () => {
    const { handlers } = renderWithSpies();
    const view = new EditorView({
      state: EditorState.create({ doc: 'const a = 1;' }),
      parent: mount(document.createElement('div')),
    });

    pressOn(view.contentDOM, 'b', { meta: true });

    expect(handlers.onToggleSidebar).not.toHaveBeenCalled();
    view.destroy();
  });

  it('names exactly the shortcuts that yield to a focused field', () => {
    expect(
      KEYBOARD_SHORTCUT_DOCS.filter((doc) => !doc.firesInEditable).map((doc) => doc.id),
    ).toEqual(['toggle-sidebar', 'focus-composer']);
  });
});

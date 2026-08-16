import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KEYBOARD_SHORTCUT_DOCS, useKeyboardShortcuts } from './use-keyboard-shortcuts';

afterEach(() => {
  vi.restoreAllMocks();
});

function press(key: string, modifiers: { meta?: boolean; shift?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
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
    expect(KEYBOARD_SHORTCUT_DOCS.map((doc) => doc.description)).toEqual([
      'Open search',
      'Show keyboard shortcuts',
      'New conversation',
      'Toggle sidebar',
      'Focus message composer',
      'Copy last message',
      'Regenerate last message',
    ]);
  });

  it('includes the three shortcuts the old dialog list omitted', () => {
    const described = KEYBOARD_SHORTCUT_DOCS.map((doc) => doc.description);
    expect(described).toContain('Focus message composer');
    expect(described).toContain('Copy last message');
    expect(described).toContain('Regenerate last message');
  });

  it('carries no handler, so a documentation surface cannot invoke one', () => {
    for (const doc of KEYBOARD_SHORTCUT_DOCS) {
      expect(doc).not.toHaveProperty('action');
    }
  });
});

describe('useKeyboardShortcuts bindings', () => {
  it.each([
    ['k', { meta: true }, 'onSearch'],
    ['/', { meta: true }, 'onShowShortcuts'],
    ['n', { meta: true }, 'onNewChat'],
    ['b', { meta: true }, 'onToggleSidebar'],
    ['Escape', {}, 'onFocusComposer'],
    ['c', { meta: true, shift: true }, 'onCopyLastMessage'],
    ['r', { meta: true, shift: true }, 'onRegenerateLastMessage'],
  ] as const)('fires %s for %s', (key, modifiers, handlerKey) => {
    const { handlers } = renderWithSpies();

    press(key, modifiers);

    expect(handlers[handlerKey]).toHaveBeenCalledTimes(1);
  });

  it('every documented shortcut actually fires something', () => {
    const { handlers } = renderWithSpies();
    const pressed = KEYBOARD_SHORTCUT_DOCS.map((doc) => {
      press(doc.key.length === 1 ? doc.key.toLowerCase() : doc.key, {
        meta: Boolean(doc.meta || doc.ctrl),
        shift: Boolean(doc.shift),
      });
      return doc.description;
    });

    expect(pressed).toHaveLength(KEYBOARD_SHORTCUT_DOCS.length);
    const totalCalls = Object.values(handlers).reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    expect(totalCalls).toBe(KEYBOARD_SHORTCUT_DOCS.length);
  });

  it('does not steal Escape while the user is typing', () => {
    const { handlers } = renderWithSpies();
    const input = document.createElement('textarea');
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(handlers.onFocusComposer).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('binds nothing when disabled', () => {
    const onSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSearch, enabled: false }));

    press('k', { meta: true });

    expect(onSearch).not.toHaveBeenCalled();
  });
});

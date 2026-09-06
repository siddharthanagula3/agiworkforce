import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useKeyboardShortcuts, KEYBOARD_SHORTCUT_DOCS } from '../use-keyboard-shortcuts';
import { useSettingsStore } from '@shared/stores/web-settings-store';

function pressCmd(key: string, extra: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(window, { key, metaKey: true, ctrlKey: true, ...extra });
}

beforeEach(() => {
  useSettingsStore.setState({ disabledShortcutIds: [] });
});

// A switch that stores a preference nothing reads is decorative. The matcher is
// driven by KEYBOARD_SHORTCUT_DOCS and skips disabled ids, so switching one off
// genuinely stops the key firing.
describe('turning a keyboard shortcut off actually stops it', () => {
  it('fires the handler while the shortcut is enabled', () => {
    const onSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onSearch }));

    pressCmd('k');

    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('does not fire once the shortcut is switched off', () => {
    const onSearch = vi.fn();
    useSettingsStore.setState({ disabledShortcutIds: ['open-search'] });
    renderHook(() => useKeyboardShortcuts({ onSearch }));

    pressCmd('k');

    expect(onSearch).not.toHaveBeenCalled();
  });

  it('leaves other shortcuts alone when one is disabled', () => {
    const onSearch = vi.fn();
    const onNewChat = vi.fn();
    useSettingsStore.setState({ disabledShortcutIds: ['open-search'] });
    renderHook(() => useKeyboardShortcuts({ onSearch, onNewChat }));

    pressCmd('k');
    pressCmd('o', { shiftKey: true });

    expect(onSearch).not.toHaveBeenCalled();
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('fires again after restoring defaults', () => {
    const onSearch = vi.fn();
    useSettingsStore.setState({ disabledShortcutIds: ['open-search'] });
    const { rerender } = renderHook(() => useKeyboardShortcuts({ onSearch }));

    pressCmd('k');
    expect(onSearch).not.toHaveBeenCalled();

    useSettingsStore.getState().restoreShortcutDefaults();
    rerender();
    pressCmd('k');

    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('still distinguishes shift-modified bindings from their unshifted twins', () => {
    const onCopyLastMessage = vi.fn();
    const onNewChat = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onCopyLastMessage, onNewChat }));

    pressCmd('c', { shiftKey: true });
    pressCmd('c');
    pressCmd('o');

    expect(onCopyLastMessage).toHaveBeenCalledTimes(1);
    expect(onNewChat).not.toHaveBeenCalled();

    pressCmd('o', { shiftKey: true });

    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('gives every documented shortcut a stable id to toggle', () => {
    const ids = KEYBOARD_SHORTCUT_DOCS.map((d) => d.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findShortcutConflicts } from '@agiworkforce/unified-chat';

import {
  KEYBOARD_SHORTCUT_DOCS,
  RESERVED_SHORTCUTS,
  checkShortcutBinding,
  findShortcutDoc,
  useKeyboardShortcuts,
  withShortcutBindings,
} from '../use-keyboard-shortcuts';
import { useSettingsStore } from '@shared/stores/web-settings-store';

function press(key: string, modifiers: { mod?: boolean; shift?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    metaKey: modifiers.mod ?? false,
    ctrlKey: modifiers.mod ?? false,
    shiftKey: modifiers.shift ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

const copyDoc = KEYBOARD_SHORTCUT_DOCS.find((doc) => doc.id === 'copy-last-message')!;

beforeEach(() => {
  useSettingsStore.setState({ disabledShortcutIds: [], shortcutBindings: {} });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('recorded shortcut keys', () => {
  it('fire on the recorded combination and no longer on the default', () => {
    useSettingsStore
      .getState()
      .setShortcutBinding('copy-last-message', { key: 'E', ctrl: true, meta: true, shift: true });
    const onCopyLastMessage = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onCopyLastMessage }));

    press('C', { mod: true, shift: true });
    expect(onCopyLastMessage).not.toHaveBeenCalled();

    press('E', { mod: true, shift: true });
    expect(onCopyLastMessage).toHaveBeenCalledTimes(1);
  });

  it('go back to the default after Restore defaults', () => {
    useSettingsStore
      .getState()
      .setShortcutBinding('copy-last-message', { key: 'E', ctrl: true, meta: true, shift: true });
    useSettingsStore.getState().restoreShortcutDefaults();
    const onCopyLastMessage = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onCopyLastMessage }));

    press('C', { mod: true, shift: true });
    expect(onCopyLastMessage).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().shortcutBindings).toEqual({});
  });

  it('ignore a stored binding for a shortcut whose keys are printed elsewhere', () => {
    const bindings = { 'open-search': { key: 'E', ctrl: true, meta: true } };
    const search = KEYBOARD_SHORTCUT_DOCS.find((doc) => doc.id === 'open-search')!;
    expect(withShortcutBindings([search], bindings)[0]).toBe(search);
  });

  it('show in the shared lookup other surfaces read', () => {
    useSettingsStore
      .getState()
      .setShortcutBinding('toggle-artifacts', { key: 'E', ctrl: true, meta: true });
    expect(findShortcutDoc('toggle-artifacts')).toMatchObject({ key: 'E', shift: false });
  });

  it('are refused when another binding or a reserved chord holds them', () => {
    const docs = withShortcutBindings(KEYBOARD_SHORTCUT_DOCS, {});
    expect(checkShortcutBinding(copyDoc, { key: 'K', ctrl: true, meta: true }, docs)).toEqual({
      ok: false,
      reason: 'taken',
      by: 'the command menu',
    });
    expect(
      checkShortcutBinding(copyDoc, { key: 'Enter', ctrl: true, meta: true, shift: true }, docs),
    ).toMatchObject({ ok: false, reason: 'taken' });
    expect(
      checkShortcutBinding(copyDoc, { key: 'E', alt: true, ctrl: true, meta: true }, docs),
    ).toEqual({
      ok: false,
      reason: 'needs-modifier',
    });
    expect(
      checkShortcutBinding(copyDoc, { key: 'E', ctrl: true, meta: true, shift: true }, docs),
    ).toEqual({ ok: true });
  });

  it('reserve nothing a default binding already uses', () => {
    expect(findShortcutConflicts(KEYBOARD_SHORTCUT_DOCS, RESERVED_SHORTCUTS)).toEqual([]);
  });
});

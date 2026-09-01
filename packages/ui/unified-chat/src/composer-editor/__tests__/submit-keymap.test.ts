import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { ComposerExtensionsConfig } from '../extensions';
import {
  ARROW_DOWN_KEY,
  ARROW_UP_KEY,
  ENTER_KEY,
  ESCAPE_KEY,
  TAB_KEY,
} from '../extensions/submit-keymap';
import { composerText } from '../serialization';
import { createTestEditor, modifierKey, pressKey, seedText, setComposing } from './harness';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const SEEDED_TEXT = 'draft';

function withEditor(overrides: Partial<ComposerExtensionsConfig>): Editor {
  editor = createTestEditor(overrides);
  seedText(editor, SEEDED_TEXT);
  editor.commands.focus('end');
  return editor;
}

describe('ComposerSubmitKeymap · Enter', () => {
  it('submits on a bare Enter', () => {
    const onSubmit = vi.fn();
    const instance = withEditor({ onSubmit });
    expect(pressKey(instance, { key: ENTER_KEY })).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(composerText(instance)).toBe(SEEDED_TEXT);
  });

  it('does not submit mid-composition and leaves the newline to the editor', () => {
    const onSubmit = vi.fn();
    const instance = withEditor({ onSubmit });
    setComposing(instance, true);
    pressKey(instance, { key: ENTER_KEY });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(composerText(instance)).toBe(`${SEEDED_TEXT}\n`);
  });

  it('does not submit while a host menu owns the composer', () => {
    const onSubmit = vi.fn();
    const instance = withEditor({ onSubmit, isMenuActive: () => true, onMenuKey: () => true });
    expect(pressKey(instance, { key: ENTER_KEY })).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(composerText(instance)).toBe(SEEDED_TEXT);
  });

  it('still refuses to submit when an open menu declines the key', () => {
    const onSubmit = vi.fn();
    const instance = withEditor({ onSubmit, isMenuActive: () => true, onMenuKey: () => false });
    pressKey(instance, { key: ENTER_KEY });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(composerText(instance)).toBe(`${SEEDED_TEXT}\n`);
  });

  it('splits a paragraph on Shift-Enter instead of submitting', () => {
    const onSubmit = vi.fn();
    const instance = withEditor({ onSubmit });
    expect(pressKey(instance, { key: ENTER_KEY, shiftKey: true })).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(composerText(instance)).toBe(`${SEEDED_TEXT}\n`);
  });

  it('inserts a newline rather than submitting in mod-enter mode', () => {
    const onSubmit = vi.fn();
    const instance = withEditor({ onSubmit, resolveSendShortcut: () => 'mod-enter' });
    pressKey(instance, { key: ENTER_KEY });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(composerText(instance)).toBe(`${SEEDED_TEXT}\n`);
  });
});

describe('ComposerSubmitKeymap · Mod-Enter', () => {
  it('submits in enter mode', () => {
    const onSubmit = vi.fn();
    const instance = withEditor({ onSubmit });
    expect(pressKey(instance, { key: ENTER_KEY, ...modifierKey() })).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(composerText(instance)).toBe(SEEDED_TEXT);
  });

  it('submits in mod-enter mode', () => {
    const onSubmit = vi.fn();
    const instance = withEditor({ onSubmit, resolveSendShortcut: () => 'mod-enter' });
    expect(pressKey(instance, { key: ENTER_KEY, ...modifierKey() })).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not submit mid-composition or while a menu is open', () => {
    const onSubmit = vi.fn();
    const instance = withEditor({ onSubmit });
    setComposing(instance, true);
    pressKey(instance, { key: ENTER_KEY, ...modifierKey() });
    setComposing(instance, false);
    expect(onSubmit).not.toHaveBeenCalled();

    instance.destroy();
    const guarded = withEditor({ onSubmit, isMenuActive: () => true, onMenuKey: () => false });
    pressKey(guarded, { key: ENTER_KEY, ...modifierKey() });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('ComposerSubmitKeymap · menu delegation', () => {
  it('forwards navigation keys only while the host menu is open', () => {
    const onMenuKey = vi.fn((_key: string) => true);
    let menuOpen = false;
    const instance = withEditor({ isMenuActive: () => menuOpen, onMenuKey });

    for (const key of [ARROW_UP_KEY, ARROW_DOWN_KEY, TAB_KEY, ESCAPE_KEY]) {
      expect(pressKey(instance, { key })).toBe(false);
    }
    expect(onMenuKey).not.toHaveBeenCalled();

    menuOpen = true;
    for (const key of [ARROW_UP_KEY, ARROW_DOWN_KEY, TAB_KEY, ESCAPE_KEY]) {
      expect(pressKey(instance, { key })).toBe(true);
    }
    expect(onMenuKey.mock.calls.map(([key]) => key)).toEqual([
      ARROW_UP_KEY,
      ARROW_DOWN_KEY,
      TAB_KEY,
      ESCAPE_KEY,
    ]);
  });

  it('lets Escape bubble when no menu claims it', () => {
    const instance = withEditor({ isMenuActive: () => true, onMenuKey: () => false });
    expect(pressKey(instance, { key: ESCAPE_KEY })).toBe(false);
  });
});

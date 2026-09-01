import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPOSER_EDITOR_MODES,
  COMPOSER_EDITOR_STORAGE_KEY,
  resolveComposerEditorMode,
} from '../composerEditorGate';

afterEach(() => {
  localStorage.removeItem(COMPOSER_EDITOR_STORAGE_KEY);
});

describe('composerEditorGate', () => {
  it('resolves to the textarea when nothing is stored', () => {
    expect(resolveComposerEditorMode()).toBe(COMPOSER_EDITOR_MODES.textarea);
  });

  it('reads the same key and values web writes', () => {
    expect(COMPOSER_EDITOR_STORAGE_KEY).toBe('agi.composer-editor');

    localStorage.setItem(COMPOSER_EDITOR_STORAGE_KEY, COMPOSER_EDITOR_MODES.editor);
    expect(resolveComposerEditorMode()).toBe(COMPOSER_EDITOR_MODES.editor);

    localStorage.setItem(COMPOSER_EDITOR_STORAGE_KEY, COMPOSER_EDITOR_MODES.textarea);
    expect(resolveComposerEditorMode()).toBe(COMPOSER_EDITOR_MODES.textarea);
  });

  it('falls back to the textarea for a value it does not recognise', () => {
    for (const stored of ['', 'Editor', 'prosemirror', '{"mode":"editor"}']) {
      localStorage.setItem(COMPOSER_EDITOR_STORAGE_KEY, stored);
      expect(resolveComposerEditorMode()).toBe(COMPOSER_EDITOR_MODES.textarea);
    }
  });
});

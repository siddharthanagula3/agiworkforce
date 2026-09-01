import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPOSER_EDITOR_MODES,
  COMPOSER_EDITOR_QUERY_PARAM,
  COMPOSER_EDITOR_STORAGE_KEY,
  resolveComposerEditorBuildMode,
  resolveComposerEditorEnabled,
  resolveComposerEditorMode,
} from './composer-editor-gate';

const ENV_KEY = 'NEXT_PUBLIC_COMPOSER_EDITOR';

function setQuery(value: string | null) {
  const search = value === null ? '' : `?${COMPOSER_EDITOR_QUERY_PARAM}=${value}`;
  window.history.replaceState({}, '', `/${search}`);
}

afterEach(() => {
  setQuery(null);
  window.localStorage.clear();
  delete process.env[ENV_KEY];
  vi.restoreAllMocks();
});

describe('composer editor gate', () => {
  it('renders the legacy textarea when nothing asks for the editor', () => {
    expect(resolveComposerEditorMode()).toBe(COMPOSER_EDITOR_MODES.textarea);
    expect(resolveComposerEditorEnabled()).toBe(false);
  });

  it('takes the build-time default when there is no override', () => {
    process.env[ENV_KEY] = COMPOSER_EDITOR_MODES.editor;

    expect(resolveComposerEditorEnabled()).toBe(true);
  });

  it('lets a stored override beat the build-time default', () => {
    process.env[ENV_KEY] = COMPOSER_EDITOR_MODES.textarea;
    window.localStorage.setItem(COMPOSER_EDITOR_STORAGE_KEY, COMPOSER_EDITOR_MODES.editor);

    expect(resolveComposerEditorEnabled()).toBe(true);
  });

  it('lets the query param beat both, so an e2e run can pin either side', () => {
    process.env[ENV_KEY] = COMPOSER_EDITOR_MODES.editor;
    window.localStorage.setItem(COMPOSER_EDITOR_STORAGE_KEY, COMPOSER_EDITOR_MODES.editor);
    setQuery(COMPOSER_EDITOR_MODES.textarea);

    expect(resolveComposerEditorEnabled()).toBe(false);
  });

  it('ignores values that name neither implementation', () => {
    setQuery('tiptap');
    window.localStorage.setItem(COMPOSER_EDITOR_STORAGE_KEY, 'yes');
    process.env[ENV_KEY] = COMPOSER_EDITOR_MODES.editor;

    expect(resolveComposerEditorEnabled()).toBe(true);
  });

  /**
   * The two arms render different elements, so a server render that honoured a
   * client-only override would hand the browser markup it never produced.
   */
  it('gives a server render the build default no matter what the overrides say', () => {
    process.env[ENV_KEY] = COMPOSER_EDITOR_MODES.textarea;
    window.localStorage.setItem(COMPOSER_EDITOR_STORAGE_KEY, COMPOSER_EDITOR_MODES.editor);
    setQuery(COMPOSER_EDITOR_MODES.editor);

    expect(resolveComposerEditorBuildMode()).toBe(COMPOSER_EDITOR_MODES.textarea);
    expect(resolveComposerEditorMode()).toBe(COMPOSER_EDITOR_MODES.editor);
  });

  it('lands on the textarea when the build-time default names nothing', () => {
    expect(resolveComposerEditorBuildMode()).toBe(COMPOSER_EDITOR_MODES.textarea);
  });

  it('falls through to the build-time default when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    process.env[ENV_KEY] = COMPOSER_EDITOR_MODES.editor;

    expect(resolveComposerEditorEnabled()).toBe(true);
  });
});

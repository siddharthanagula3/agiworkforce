export const COMPOSER_EDITOR_QUERY_PARAM = 'composer';
export const COMPOSER_EDITOR_STORAGE_KEY = 'agi.composer-editor';

export const COMPOSER_EDITOR_MODES = {
  editor: 'editor',
  textarea: 'textarea',
} as const;

export type ComposerEditorMode = (typeof COMPOSER_EDITOR_MODES)[keyof typeof COMPOSER_EDITOR_MODES];

function parseMode(raw: string | null | undefined): ComposerEditorMode | null {
  if (raw === COMPOSER_EDITOR_MODES.editor) return COMPOSER_EDITOR_MODES.editor;
  if (raw === COMPOSER_EDITOR_MODES.textarea) return COMPOSER_EDITOR_MODES.textarea;
  return null;
}

function readQueryOverride(): ComposerEditorMode | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseMode(new URLSearchParams(window.location.search).get(COMPOSER_EDITOR_QUERY_PARAM));
  } catch {
    // A malformed query string is not a reason to change which editor renders.
    return null;
  }
}

function readStoredOverride(): ComposerEditorMode | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseMode(window.localStorage.getItem(COMPOSER_EDITOR_STORAGE_KEY));
  } catch {
    // Storage blocked by the browser falls through to the build-time default.
    return null;
  }
}

export function resolveComposerEditorMode(): ComposerEditorMode {
  return (
    readQueryOverride() ??
    readStoredOverride() ??
    // Must stay a literal bracket read: Next inlines NEXT_PUBLIC_* by matching
    // the source text, and scripts/env-doctor.mjs scans for the same shape.
    parseMode(process.env['NEXT_PUBLIC_COMPOSER_EDITOR']) ??
    COMPOSER_EDITOR_MODES.textarea
  );
}

export function resolveComposerEditorEnabled(): boolean {
  return resolveComposerEditorMode() === COMPOSER_EDITOR_MODES.editor;
}

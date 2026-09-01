import type { ChatInterfaceProps } from '@agiworkforce/unified-chat';
import { safeGetItem } from '../utils/localStorage';

export const COMPOSER_EDITOR_STORAGE_KEY = 'agi.composer-editor';

export type ComposerEditorMode = NonNullable<ChatInterfaceProps['composerEditorMode']>;

export const COMPOSER_EDITOR_MODES = {
  editor: 'editor',
  textarea: 'textarea',
} as const satisfies Record<ComposerEditorMode, ComposerEditorMode>;

function parseMode(raw: string | null): ComposerEditorMode | null {
  if (raw === COMPOSER_EDITOR_MODES.editor) return COMPOSER_EDITOR_MODES.editor;
  if (raw === COMPOSER_EDITOR_MODES.textarea) return COMPOSER_EDITOR_MODES.textarea;
  return null;
}

/**
 * Reads the same key and accepts the same two values as web's composer gate, so
 * one stored override moves both surfaces. Anything else stored — including the
 * value web writes for a mode desktop has not shipped — resolves to the
 * textarea, which is the arm every consumer gets until the founder flips it.
 */
export function resolveComposerEditorMode(): ComposerEditorMode {
  return parseMode(safeGetItem(COMPOSER_EDITOR_STORAGE_KEY)) ?? COMPOSER_EDITOR_MODES.textarea;
}

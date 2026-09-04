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

export function resolveComposerEditorMode(): ComposerEditorMode {
  return parseMode(safeGetItem(COMPOSER_EDITOR_STORAGE_KEY)) ?? COMPOSER_EDITOR_MODES.textarea;
}

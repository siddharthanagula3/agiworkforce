import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import type { Extensions } from '@tiptap/core';
import { ComposerMaxLength } from './max-length';
import type { ComposerMaxLengthOptions } from './max-length';
import { createComposerMention } from './mention';
import type { ResolveComposerMentionConfig } from './mention';
import { ComposerSubmitKeymap } from './submit-keymap';
import type { ComposerSubmitKeymapOptions } from './submit-keymap';

export interface ComposerExtensionsConfig
  extends ComposerSubmitKeymapOptions, ComposerMaxLengthOptions {
  resolveMention: ResolveComposerMentionConfig;
}

export function createComposerExtensions(config: ComposerExtensionsConfig): Extensions {
  const { resolveMention, resolveLimit, ...keymap } = config;
  return [
    Document,
    Paragraph,
    Text,
    createComposerMention(resolveMention),
    UndoRedo,
    ComposerMaxLength.configure({ resolveLimit }),
    ComposerSubmitKeymap.configure(keymap),
  ];
}

export {
  ComposerMaxLength,
  COMPOSER_MAX_LENGTH_PLUGIN_KEY,
  COMPOSER_PROGRAMMATIC_META,
} from './max-length';
export { ComposerSubmitKeymap, SEND_ON_ENTER } from './submit-keymap';
export {
  COMPOSER_MENTION_CLASS_NAME,
  COMPOSER_MENTION_NODE_NAME,
  COMPOSER_MENTION_PLUGIN_KEY,
  COMPOSER_MENTION_TRIGGER_CHAR,
  composerFindSuggestionMatch,
  createComposerMention,
  renderComposerMentionText,
} from './mention';

export {
  ComposerEditor,
  COMPOSER_EDITOR_ATTRIBUTE,
  COMPOSER_EDITOR_CONTENT_CLASS,
  COMPOSER_EDITOR_DISABLED_CLASS,
  COMPOSER_EDITOR_PLACEHOLDER_CLASS,
  COMPOSER_EDITOR_ROOT_CLASS,
} from './ComposerEditor';

export {
  COMPOSER_BLOCK_SEPARATOR,
  composerDocumentToText,
  composerText,
  textToComposerDocument,
} from './serialization';

export {
  COMPOSER_MAX_LENGTH_PLUGIN_KEY,
  COMPOSER_MENTION_CLASS_NAME,
  COMPOSER_MENTION_NODE_NAME,
  COMPOSER_MENTION_PLUGIN_KEY,
  COMPOSER_MENTION_TRIGGER_CHAR,
  COMPOSER_PROGRAMMATIC_META,
  ComposerMaxLength,
  ComposerSubmitKeymap,
  SEND_ON_ENTER,
  composerFindSuggestionMatch,
  createComposerExtensions,
  createComposerMention,
  renderComposerMentionText,
} from './extensions';
export type { ComposerExtensionsConfig } from './extensions';

export {
  createComposerMentionCommit,
  createComposerSuggestionRenderer,
} from './suggestion-adapter';
export type { ComposerSuggestionProps, ResolveComposerMentionMenu } from './suggestion-adapter';

export type {
  ComposerAttachmentPasteDecision,
  ComposerCaretPosition,
  ComposerEditorHandle,
  ComposerEditorProps,
  ComposerMentionAttributes,
  ComposerMentionCommit,
  ComposerMentionConfig,
  ComposerMentionMenuAdapter,
  ComposerMentionMenuState,
  ComposerSendShortcut,
} from './types';

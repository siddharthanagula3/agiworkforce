import Mention from '@tiptap/extension-mention';
import { PluginKey } from '@tiptap/pm/state';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { matchMentionQuery } from '../../lib/mentionQuery';
import { MENTION_LEAF_PLACEHOLDER } from '../mention-range';
import { createComposerSuggestionRenderer } from '../suggestion-adapter';
import type { ResolveComposerMentionMenu } from '../suggestion-adapter';
import type { ComposerMentionAttributes, ComposerMentionConfig } from '../types';

export const COMPOSER_MENTION_NODE_NAME = 'mention';
export const COMPOSER_MENTION_TRIGGER_CHAR = '@';
export const COMPOSER_MENTION_CLASS_NAME = 'composer-editor__mention';
export const COMPOSER_MENTION_PLUGIN_KEY = new PluginKey('composerMention');

const DELETE_TRIGGER_WITH_BACKSPACE = true;
const MENTION_TAG_NAME = 'span';
const MENTION_TRAILING_SPACE = ' ';
const TEXT_NODE_NAME = 'text';

type ComposerFindSuggestionMatch = NonNullable<
  SuggestionOptions<unknown, ComposerMentionAttributes>['findSuggestionMatch']
>;

export function renderComposerMentionText(attributes: ComposerMentionAttributes): string {
  return `${COMPOSER_MENTION_TRIGGER_CHAR}${attributes.label ?? attributes.id}`;
}

export const composerFindSuggestionMatch: ComposerFindSuggestionMatch = ({ char, $position }) => {
  if (char !== COMPOSER_MENTION_TRIGGER_CHAR) return null;
  const textBefore = $position.parent.textBetween(
    0,
    $position.parentOffset,
    null,
    MENTION_LEAF_PLACEHOLDER,
  );
  const match = matchMentionQuery(textBefore);
  if (!match) return null;
  return {
    range: { from: $position.start() + match.startIndex, to: $position.pos },
    query: match.query,
    text: textBefore.slice(match.startIndex),
  };
};

export type ResolveComposerMentionConfig = () => ComposerMentionConfig | undefined;

function toMentionAttributes(attributes: Record<string, unknown>): ComposerMentionAttributes {
  const { id, label } = attributes;
  return {
    id: typeof id === 'string' ? id : '',
    label: typeof label === 'string' ? label : null,
  };
}

export function createComposerMention(resolveConfig: ResolveComposerMentionConfig) {
  const resolveMenu: ResolveComposerMentionMenu = () => resolveConfig()?.menu;
  const renderText = (attributes: ComposerMentionAttributes): string =>
    (resolveConfig()?.renderText ?? renderComposerMentionText)(attributes);

  return Mention.configure({
    HTMLAttributes: { class: COMPOSER_MENTION_CLASS_NAME },
    deleteTriggerWithBackspace: DELETE_TRIGGER_WITH_BACKSPACE,
    renderText: ({ node }) => renderText(toMentionAttributes(node.attrs)),
    renderHTML: ({ options, node }) => [
      MENTION_TAG_NAME,
      options.HTMLAttributes,
      renderText(toMentionAttributes(node.attrs)),
    ],
    suggestion: {
      char: COMPOSER_MENTION_TRIGGER_CHAR,
      pluginKey: COMPOSER_MENTION_PLUGIN_KEY,
      findSuggestionMatch: composerFindSuggestionMatch,
      render: createComposerSuggestionRenderer(resolveMenu),
      command: ({ editor, range, props }) => {
        const nodeAfter = editor.state.selection.$to.nodeAfter;
        const to = nodeAfter?.text?.startsWith(MENTION_TRAILING_SPACE) ? range.to + 1 : range.to;
        editor
          .chain()
          .focus()
          .insertContentAt({ from: range.from, to }, [
            { type: COMPOSER_MENTION_NODE_NAME, attrs: props },
            { type: TEXT_NODE_NAME, text: MENTION_TRAILING_SPACE },
          ])
          .run();
      },
    },
  });
}

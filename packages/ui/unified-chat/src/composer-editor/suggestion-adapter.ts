import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import type {
  ComposerMentionAttributes,
  ComposerMentionCommit,
  ComposerMentionMenuAdapter,
  ComposerMentionMenuState,
} from './types';

export type ComposerSuggestionProps = SuggestionProps<unknown, ComposerMentionAttributes>;

type ComposerSuggestionRenderer = NonNullable<
  SuggestionOptions<unknown, ComposerMentionAttributes>['render']
>;

export type ResolveComposerMentionMenu = () => ComposerMentionMenuAdapter | undefined;

export function createComposerMentionCommit(props: ComposerSuggestionProps): ComposerMentionCommit {
  return {
    insertMention: (attributes) => props.command(attributes),
    removeQuery: () => {
      props.editor.chain().deleteRange(props.range).run();
    },
  };
}

function toMenuState(props: ComposerSuggestionProps): ComposerMentionMenuState {
  return { query: props.query, commit: createComposerMentionCommit(props) };
}

export function createComposerSuggestionRenderer(
  resolveMenu: ResolveComposerMentionMenu,
): ComposerSuggestionRenderer {
  return () => ({
    onStart: (props) => {
      resolveMenu()?.onOpen?.(toMenuState(props));
    },
    onUpdate: (props) => {
      resolveMenu()?.onUpdate?.(toMenuState(props));
    },
    onExit: () => {
      resolveMenu()?.onClose?.();
    },
    onKeyDown: ({ event }) => {
      if (event.isComposing) return false;
      return resolveMenu()?.onKeyDown?.(event) ?? false;
    },
  });
}

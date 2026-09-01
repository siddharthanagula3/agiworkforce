import { TextSelection } from '@tiptap/pm/state';
import type { Editor, Range } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export const MENTION_LEAF_PLACEHOLDER = '\uFFFC';

const BOUNDARY_WHITESPACE = /[ \t]/;
const MENTION_JOIN_SEPARATOR = ' ';
const NO_SEPARATOR = '';

export interface ComposerMentionRemoval {
  from: number;
  to: number;
  insert: string;
}

/**
 * Must stay character-identical to the textarea arm's `replaceMentionToken`
 * (apps/web ChatComposerNew): boundary whitespace collapses to a single space
 * between surviving text, and to nothing at a block edge.
 */
export function resolveComposerMentionRemoval(
  doc: ProseMirrorNode,
  range: Range,
): ComposerMentionRemoval {
  const $from = doc.resolve(range.from);
  const block = $from.parent;
  const blockStart = $from.start();
  const blockText = block.textBetween(0, block.content.size, null, MENTION_LEAF_PLACEHOLDER);

  let start = Math.max(range.from - blockStart, 0);
  let end = Math.min(Math.max(range.to - blockStart, start), blockText.length);
  while (start > 0 && BOUNDARY_WHITESPACE.test(blockText.charAt(start - 1))) start -= 1;
  while (end < blockText.length && BOUNDARY_WHITESPACE.test(blockText.charAt(end))) end += 1;

  const joinsText = start > 0 && end < blockText.length;
  return {
    from: blockStart + start,
    to: blockStart + end,
    insert: joinsText ? MENTION_JOIN_SEPARATOR : NO_SEPARATOR,
  };
}

export function removeComposerMentionQuery(editor: Editor, range: Range): void {
  editor
    .chain()
    .command(({ tr, state, dispatch }) => {
      if (!dispatch) return true;
      const removal = resolveComposerMentionRemoval(state.doc, range);
      tr.delete(removal.from, removal.to);
      if (removal.insert) tr.insertText(removal.insert, removal.from);
      tr.setSelection(TextSelection.create(tr.doc, removal.from + removal.insert.length));
      return true;
    })
    .focus()
    .run();
}

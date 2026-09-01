import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import {
  COMPOSER_MENTION_NODE_NAME,
  COMPOSER_MENTION_TRIGGER_CHAR,
  composerFindSuggestionMatch,
} from '../extensions/mention';
import { removeComposerMentionQuery } from '../mention-range';
import { composerText } from '../serialization';
import { createTestEditor, seedText } from './harness';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const FIRST_BLOCK_START = 1;
const CARET_AT_END = undefined;

function matchAtCaret(target: Editor) {
  return composerFindSuggestionMatch({
    char: COMPOSER_MENTION_TRIGGER_CHAR,
    allowSpaces: false,
    allowToIncludeChar: false,
    allowedPrefixes: null,
    startOfLine: false,
    $position: target.state.selection.$from,
  });
}

function caretOffsetInBlock(target: Editor): number {
  const { $from } = target.state.selection;
  return $from.pos - $from.start();
}

function abandonQuery(text: string, caretOffset?: number) {
  editor = createTestEditor();
  seedText(editor, text);
  if (caretOffset === undefined) editor.commands.focus('end');
  else editor.commands.setTextSelection(FIRST_BLOCK_START + caretOffset);

  const match = matchAtCaret(editor);
  if (!match) return null;
  removeComposerMentionQuery(editor, match.range);
  return { text: composerText(editor), caret: caretOffsetInBlock(editor) };
}

describe('abandoning a mention query · parity with replaceMentionToken', () => {
  it.each([
    ['hello @doc', CARET_AT_END, 'hello', 5],
    ['@doc bar', 4, 'bar', 0],
    ['hello @doc world', 10, 'hello world', 6],
    ['@doc', CARET_AT_END, '', 0],
  ])('turns %j into %j with the caret at %i', (input, caretOffset, expected, caret) => {
    expect(abandonQuery(input, caretOffset)).toEqual({ text: expected, caret });
  });

  it('collapses a run of spaces on both sides to one', () => {
    expect(abandonQuery('hello   @doc   world', 12)).toEqual({ text: 'hello world', caret: 6 });
  });

  it('collapses tabs the same way it collapses spaces', () => {
    expect(abandonQuery('hello\t@doc\tworld', 10)).toEqual({ text: 'hello world', caret: 6 });
  });

  it('strips a trailing space with nothing after it', () => {
    expect(abandonQuery('hello @doc ', 10)).toEqual({ text: 'hello', caret: 5 });
  });

  it('joins surviving text that never had a space between it', () => {
    expect(abandonQuery('hello @docworld', 10)).toEqual({ text: 'hello world', caret: 6 });
  });

  it('joins with a space when punctuation follows the query', () => {
    expect(abandonQuery('hello @doc!', 10)).toEqual({ text: 'hello !', caret: 6 });
  });

  it('leaves punctuation that precedes the trigger untouched', () => {
    expect(abandonQuery('punctuation, @grace')).toEqual({ text: 'punctuation,', caret: 12 });
  });

  it('never opens a query mid-word, so there is nothing to remove', () => {
    expect(abandonQuery('hello@doc')).toBeNull();
    expect(abandonQuery('email me at ada@example.com', 19)).toBeNull();
  });

  it('never opens a query behind an opening bracket', () => {
    expect(abandonQuery('(@grace')).toBeNull();
  });
});

describe('abandoning a mention query · block boundaries', () => {
  it('treats the start of a later paragraph as a block edge, not a join', () => {
    expect(abandonQuery('line one\n@ada')).toEqual({ text: 'line one\n', caret: 0 });
    expect(editor?.state.selection.from).toBe(11);
  });

  it('keeps the caret in the paragraph the query sat in', () => {
    expect(abandonQuery('line one\nhello @ada')).toEqual({ text: 'line one\nhello', caret: 5 });
    expect(editor?.state.selection.from).toBe(16);
  });

  it('counts a committed mention chip as one character when widening', () => {
    editor = createTestEditor();
    editor
      .chain()
      .insertContent([
        { type: COMPOSER_MENTION_NODE_NAME, attrs: { id: 'ada', label: 'ada' } },
        { type: 'text', text: ' @gr' },
      ])
      .focus('end')
      .run();

    const match = matchAtCaret(editor);
    expect(match).not.toBeNull();
    if (!match) return;
    removeComposerMentionQuery(editor, match.range);

    expect(composerText(editor)).toBe('@ada');
    expect(caretOffsetInBlock(editor)).toBe(1);
  });
});

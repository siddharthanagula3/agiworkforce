import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import { matchMentionQuery } from '../../lib/mentionQuery';
import {
  COMPOSER_MENTION_NODE_NAME,
  COMPOSER_MENTION_TRIGGER_CHAR,
  composerFindSuggestionMatch,
  renderComposerMentionText,
} from '../extensions/mention';
import { composerText } from '../serialization';
import { MENTION_CORPUS } from './mention-corpus';
import { createTestEditor, generateStrings, seedText } from './harness';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const OTHER_TRIGGER_CHAR = '#';

function matchAtCursor(text: string) {
  editor ??= createTestEditor();
  seedText(editor, text);
  editor.commands.focus('end');
  const $position: ResolvedPos = editor.state.selection.$from;
  return composerFindSuggestionMatch({
    char: COMPOSER_MENTION_TRIGGER_CHAR,
    allowSpaces: false,
    allowToIncludeChar: false,
    allowedPrefixes: null,
    startOfLine: false,
    $position,
  });
}

describe('composerFindSuggestionMatch · equivalence with matchMentionQuery', () => {
  it('agrees with the shared matcher across the corpus', () => {
    for (const text of MENTION_CORPUS) {
      const expected = matchMentionQuery(text);
      const actual = matchAtCursor(text);
      expect(actual === null, `null-ness for ${JSON.stringify(text)}`).toBe(expected === null);
      if (!expected || !actual) continue;
      expect(actual.query, `query for ${JSON.stringify(text)}`).toBe(expected.query);
      expect(actual.text, `text for ${JSON.stringify(text)}`).toBe(text.slice(expected.startIndex));
      expect(actual.range.to - actual.range.from).toBe(actual.text.length);
    }
  });

  it('agrees with the shared matcher across generated strings', () => {
    for (const text of generateStrings(200, 7)) {
      const expected = matchMentionQuery(text);
      const actual = matchAtCursor(text);
      expect(actual === null, `null-ness for ${JSON.stringify(text)}`).toBe(expected === null);
      if (!expected || !actual) continue;
      expect(actual.query).toBe(expected.query);
      expect(actual.text).toBe(text.slice(expected.startIndex));
    }
  });

  it('anchors the range on the trigger character', () => {
    const match = matchAtCursor('hello @ada');
    expect(match).not.toBeNull();
    editor ??= createTestEditor();
    expect(editor.state.doc.textBetween(match?.range.from ?? 0, match?.range.to ?? 0)).toBe('@ada');
  });

  it('ignores a trigger character it was not configured for', () => {
    editor = createTestEditor();
    seedText(editor, 'hello @ada');
    editor.commands.focus('end');
    expect(
      composerFindSuggestionMatch({
        char: OTHER_TRIGGER_CHAR,
        allowSpaces: false,
        allowToIncludeChar: false,
        allowedPrefixes: null,
        startOfLine: false,
        $position: editor.state.selection.$from,
      }),
    ).toBeNull();
  });

  it('does not trigger when a committed mention sits directly before the trigger', () => {
    editor = createTestEditor();
    editor
      .chain()
      .insertContent([
        { type: COMPOSER_MENTION_NODE_NAME, attrs: { id: 'ada', label: 'ada' } },
        { type: 'text', text: '@gr' },
      ])
      .focus('end')
      .run();
    expect(
      composerFindSuggestionMatch({
        char: COMPOSER_MENTION_TRIGGER_CHAR,
        allowSpaces: false,
        allowToIncludeChar: false,
        allowedPrefixes: null,
        startOfLine: false,
        $position: editor.state.selection.$from,
      }),
    ).toBeNull();
  });
});

describe('mention wire format', () => {
  it('renders the label, falling back to the id', () => {
    expect(renderComposerMentionText({ id: 'ada', label: 'Ada Lovelace' })).toBe('@Ada Lovelace');
    expect(renderComposerMentionText({ id: 'ada' })).toBe('@ada');
    expect(renderComposerMentionText({ id: 'ada', label: null })).toBe('@ada');
  });

  it('serializes a committed chip back into the plain-text form', () => {
    editor = createTestEditor();
    editor
      .chain()
      .insertContent([
        { type: 'text', text: 'ping ' },
        { type: COMPOSER_MENTION_NODE_NAME, attrs: { id: 'ada', label: 'ada' } },
        { type: 'text', text: ' about it' },
      ])
      .run();
    expect(composerText(editor)).toBe('ping @ada about it');
  });

  it('honours a host-supplied renderText', () => {
    const prefix = 'skill:';
    editor = createTestEditor({
      resolveMention: () => ({
        menu: {},
        renderText: (attributes) => `${prefix}${attributes.label ?? attributes.id}`,
      }),
    });
    editor
      .chain()
      .insertContent([{ type: COMPOSER_MENTION_NODE_NAME, attrs: { id: 'ada', label: 'ada' } }])
      .run();
    expect(composerText(editor)).toBe('skill:ada');
  });
});

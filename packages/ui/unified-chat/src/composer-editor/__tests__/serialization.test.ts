import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import { composerText } from '../serialization';
import { COMPOSER_PARAGRAPH_NODE_NAME } from '../serialization';
import { createTestEditor, generateStrings, seedText } from './harness';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function roundTrip(text: string): string {
  editor ??= createTestEditor();
  seedText(editor, text);
  return composerText(editor);
}

describe('composer serialization · line-per-paragraph', () => {
  it('turns every newline into its own paragraph', () => {
    editor = createTestEditor();
    seedText(editor, 'first\nsecond\nthird');
    const paragraphs = editor.state.doc.content.content;
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs.every((node) => node.type.name === COMPOSER_PARAGRAPH_NODE_NAME)).toBe(true);
    expect(paragraphs.map((node) => node.textContent)).toEqual(['first', 'second', 'third']);
  });

  it('round-trips the shapes the composer actually sees', () => {
    const cases = [
      '',
      'hello',
      'hello\nworld',
      '\n',
      '\n\n\n',
      'a\n\nb',
      '  leading and trailing  ',
      'trailing newline\n',
      '\nleading newline',
      'tab\tseparated',
      '@mention at start',
      'emoji 🌱 and 漢字',
    ];
    for (const text of cases) {
      expect(roundTrip(text)).toBe(text);
    }
  });

  it('round-trips generated strings exactly', () => {
    for (const text of generateStrings(200)) {
      expect(roundTrip(text)).toBe(text);
    }
  });

  it('reports an empty document for the empty string', () => {
    editor = createTestEditor();
    seedText(editor, '');
    expect(editor.isEmpty).toBe(true);
    expect(composerText(editor)).toBe('');
  });
});

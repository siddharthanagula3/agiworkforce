import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import { composerText, textToComposerDocument } from '../serialization';
import { createTestEditor, seedText } from './harness';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const LIMIT = 10;

function typeText(instance: Editor, text: string): void {
  instance.chain().focus('end').insertContent({ type: 'text', text }).run();
}

describe('ComposerMaxLength · serialized length', () => {
  it('accepts input up to the limit and rejects the character past it', () => {
    editor = createTestEditor({ resolveLimit: () => LIMIT });
    typeText(editor, '0123456789');
    expect(composerText(editor)).toBe('0123456789');
    typeText(editor, 'x');
    expect(composerText(editor)).toBe('0123456789');
  });

  it('counts a newline, which document characters do not', () => {
    const overByItsSeparator = 'abcde\nfghij';
    editor = createTestEditor({ resolveLimit: () => LIMIT });
    editor.commands.setContent(textToComposerDocument(overByItsSeparator));
    expect(composerText(editor)).toBe('');

    editor.destroy();
    editor = createTestEditor({ resolveLimit: () => overByItsSeparator.length });
    editor.commands.setContent(textToComposerDocument(overByItsSeparator));
    expect(composerText(editor)).toBe(overByItsSeparator);
  });

  it('lets a document that is already over the limit shrink', () => {
    editor = createTestEditor({ resolveLimit: () => LIMIT });
    seedText(editor, 'far beyond the limit');
    expect(composerText(editor)).toBe('far beyond the limit');
    editor.chain().focus('end').deleteRange({ from: 1, to: 5 }).run();
    expect(composerText(editor)).toBe('beyond the limit');
  });

  it('never blocks a programmatic write', () => {
    editor = createTestEditor({ resolveLimit: () => LIMIT });
    seedText(editor, 'a draft restored from the store is longer than the cap');
    expect(composerText(editor)).toBe('a draft restored from the store is longer than the cap');
  });

  it('is unbounded when no limit is configured', () => {
    editor = createTestEditor();
    typeText(editor, 'x'.repeat(LIMIT * 100));
    expect(composerText(editor)).toHaveLength(LIMIT * 100);
  });

  it('reads the limit at transaction time, so a host can change it', () => {
    let limit = LIMIT;
    editor = createTestEditor({ resolveLimit: () => limit });
    typeText(editor, '0123456789');
    typeText(editor, 'x');
    expect(composerText(editor)).toHaveLength(LIMIT);
    limit = LIMIT * 2;
    typeText(editor, 'x');
    expect(composerText(editor)).toHaveLength(LIMIT + 1);
  });
});

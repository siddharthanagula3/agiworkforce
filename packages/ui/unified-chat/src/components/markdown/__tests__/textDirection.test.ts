import { describe, expect, it } from 'vitest';
import { markdownToDocumentBlocks } from '../markdownDocument';
import { RIGHT_TO_LEFT_TEXT, documentDirection, textDirection } from '../textDirection';

describe('text direction', () => {
  it('takes the direction of the first strong letter', () => {
    expect(textDirection('123 مرحبا hello')).toBe('rtl');
    expect(textDirection('123 hello مرحبا')).toBe('ltr');
    expect(textDirection('123 !?')).toBeNull();
    expect(RIGHT_TO_LEFT_TEXT.test('ש')).toBe(true);
    expect(RIGHT_TO_LEFT_TEXT.test('a')).toBe(false);
  });

  it('reads a document from its first directional block, then its title, then left to right', () => {
    expect(documentDirection(markdownToDocumentBlocks('- שלום\n- עולם'))).toBe('rtl');
    expect(documentDirection(markdownToDocumentBlocks('```\ncode\n```'), 'تقرير')).toBe('rtl');
    expect(documentDirection(markdownToDocumentBlocks('```\ncode\n```'))).toBe('ltr');
  });
});

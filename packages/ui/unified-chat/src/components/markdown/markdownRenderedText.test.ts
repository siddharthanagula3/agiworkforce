import { describe, expect, it } from 'vitest';
import { markdownRenderedText } from './markdownDocument';

describe('the text a reader sees in a rendered message', () => {
  it('joins text across inline formatting', () => {
    expect(markdownRenderedText('alpha **beta**')).toBe('alpha beta');
    expect(markdownRenderedText('alpha *beta* gamma')).toBe('alpha beta gamma');
    expect(markdownRenderedText('alpha ~~beta~~ [gamma](https://example.com)')).toBe(
      'alpha beta gamma',
    );
  });

  it('keeps plain text and inline code as written', () => {
    expect(markdownRenderedText('alpha beta')).toBe('alpha beta');
    expect(markdownRenderedText('run `a * b` now')).toBe('run a * b now');
  });

  it('keeps literal asterisks inside code', () => {
    expect(markdownRenderedText('```js\nconst x = a * b * c;\n```')).toBe('const x = a * b * c;');
  });

  it('separates blocks, list items and table cells with a line break', () => {
    expect(markdownRenderedText('alpha\n\nbeta')).toBe('alpha\nbeta');
    expect(markdownRenderedText('# Title\n\n- one\n- **two**')).toBe('Title\none\ntwo');
    expect(markdownRenderedText('| a | b |\n| - | - |\n| c | d |')).toBe('a\nb\nc\nd');
  });

  it('is empty for a message with nothing to read', () => {
    expect(markdownRenderedText('')).toBe('');
    expect(markdownRenderedText('---')).toBe('');
  });
});

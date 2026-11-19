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

  it('keeps the words of two lines apart', () => {
    expect(markdownRenderedText('alpha\nbeta')).toBe('alpha\nbeta');
    expect(markdownRenderedText('alpha  \nbeta')).toBe('alpha\nbeta');
    expect(markdownRenderedText('alpha<br>beta')).toBe('alpha\nbeta');
  });

  it('keeps a tag a sentence names as words the reader saw', () => {
    expect(
      markdownRenderedText('Zebrafish pages load the <script> tag before the <style> tag.'),
    ).toBe('Zebrafish pages load the <script> tag before the <style> tag.');
    expect(markdownRenderedText('Use the <img> tag or the <input> tag, and a line<br>break')).toBe(
      'Use the <img> tag or the <input> tag, and a line\nbreak',
    );
  });

  it('still removes markup, Markdown marks and the markup a window cut short', () => {
    expect(markdownRenderedText('a <b>bold</b> and **strong** <span class="x">span</span>')).toBe(
      'a bold and strong span',
    );
    expect(markdownRenderedText('<span style="color: red">red text')).toBe('red text');
    expect(markdownRenderedText('text</span> after')).toBe('text after');
    expect(markdownRenderedText('an <img src="https://example.com/a.png"> image')).toBe(
      'an  image',
    );
    expect(markdownRenderedText('note <!-- hidden --> here')).toBe('note  here');
  });

  it('is empty for a message with nothing to read', () => {
    expect(markdownRenderedText('')).toBe('');
    expect(markdownRenderedText('---')).toBe('');
  });
});

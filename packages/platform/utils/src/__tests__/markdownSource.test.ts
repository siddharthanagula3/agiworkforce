import { describe, expect, it } from 'vitest';
import { codeRanges, normalizeMathDelimiters, tagsAndDollarsAsText } from '../markdownSource';

describe('tilde code fence math source', () => {
  it.each([
    '~~~latex\n\\[x+y\\]\n~~~',
    '  ~~~writing\nLiteral \\(x+y\\) and $5.\n  ~~~',
    '~~~writing\n\\(unfinished delimiter\\)',
    '~~~~latex\n~~~\n\\[x+y\\]\n~~~~',
    '~~~latex\r\n\\(x+y\\)\r\n~~~\r\n',
  ])('keeps the source unchanged: %s', (source) => {
    expect(normalizeMathDelimiters(source)).toBe(source);
  });

  it('only protects the fenced range and still normalizes following math', () => {
    const code = '~~~latex\n\\[example\\]\n~~~';
    const source = `${code}\n\\(x^2\\)`;

    expect(codeRanges(source)).toEqual([[0, code.length]]);
    expect(normalizeMathDelimiters(source)).toBe(`${code}\n$x^2$`);
  });

  it('leaves inline tildes in prose while normalizing its math', () => {
    expect(normalizeMathDelimiters('Use ~~~ and \\(x^2\\).')).toBe('Use ~~~ and $x^2$.');
  });

  it('protects the complete streaming tail of an unclosed tilde fence', () => {
    const source = '~~~latex\n' + '\\(x\\) '.repeat(30_000);

    expect(codeRanges(source)).toEqual([[0, source.length]]);
    expect(normalizeMathDelimiters(source)).toBe(source);
  });
});

describe('tagsAndDollarsAsText, so a short line reads tags and dollars as words', () => {
  it.each([
    ['How do I center a <div>?', 'How do I center a \\<div>?'],
    ['Why close <script> with </script>?', 'Why close \\<script> with \\</script>?'],
    ['Is a <!-- comment --> useful?', 'Is a \\<!-- comment --> useful?'],
    ['Is 3 < 4 and a<b?', 'Is 3 < 4 and a<b?'],
    ['Compare $HOME and $PATH', 'Compare \\$HOME and \\$PATH'],
    ['Is $5 cheaper than $10?', 'Is \\$5 cheaper than \\$10?'],
  ])('escapes %p', (raw, escaped) => {
    expect(tagsAndDollarsAsText(raw)).toBe(escaped);
  });

  it.each([
    'Why is $x^2$ positive?',
    'Why is $a<b$ true?',
    'Is \\(E = mc^2\\) derived?',
    'Is $$<x>$$ a block?',
    'What does `<div>` and `$HOME` do?',
    'Already \\<b> and \\$5',
    '~~~html\n<div>$x</div>\n~~~',
  ])('leaves code, TeX and escapes in %p alone', (raw) => {
    expect(tagsAndDollarsAsText(raw)).toBe(raw);
  });
});

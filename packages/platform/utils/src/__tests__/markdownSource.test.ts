import { describe, expect, it } from 'vitest';
import { codeRanges, normalizeMathDelimiters } from '../markdownSource';

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

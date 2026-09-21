import { describe, expect, it } from 'vitest';
import { parseMarkdownForPDF } from '../document-export-service';

describe('parseMarkdownForPDF', () => {
  it('gives each block kind its own line type', () => {
    const parsed = parseMarkdownForPDF(
      ['# Title', '## Section', '### Detail', '> Quoted', '- First', '1. Second', 'Plain'].join(
        '\n',
      ),
    );

    expect(parsed.map((line) => line.type)).toEqual([
      'h1',
      'h2',
      'h3',
      'quote',
      'list',
      'list',
      'text',
    ]);
    expect(parsed.map((line) => line.text)).toEqual([
      'Title',
      'Section',
      'Detail',
      'Quoted',
      '• First',
      '1. Second',
      'Plain',
    ]);
  });

  it.each([
    ['a heading', '## **Q3** results', 'h2', 'Q3 results'],
    ['a quote', '> the *only* option', 'quote', 'the only option'],
    ['a list item', '- read `config.toml` first', 'list', '• read config.toml first'],
    ['a numbered item', '1. see [the plan](https://example.invalid/p)', 'list', '1. see the plan'],
    ['a paragraph', 'a **bold** claim', 'text', 'a bold claim'],
  ])(
    'strips the inline markers %s carries, so the export shows words',
    (_case, source, type, text) => {
      const [line] = parseMarkdownForPDF(source);

      expect(line?.type).toBe(type);
      expect(line?.text).toBe(text);
    },
  );

  it('keeps a fenced block verbatim, markers and all, and indents it', () => {
    const parsed = parseMarkdownForPDF(['```ts', 'const a = `**x**`;', '```'].join('\n'));

    expect(parsed).toEqual([{ type: 'code', text: 'const a = `**x**`;', indent: 5 }]);
  });

  it('keeps blank lines so paragraphs do not run together in the export', () => {
    expect(parseMarkdownForPDF('one\n\ntwo')).toEqual([
      { type: 'text', text: 'one' },
      { type: 'text', text: '' },
      { type: 'text', text: 'two' },
    ]);
  });
});

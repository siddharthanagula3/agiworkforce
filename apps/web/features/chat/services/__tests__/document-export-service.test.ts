import { describe, expect, it } from 'vitest';
import { markdownToDocumentBlocks } from '@agiworkforce/unified-chat/markdown-document';

describe('markdownToDocumentBlocks', () => {
  it('gives each block kind its own block type', () => {
    const blocks = markdownToDocumentBlocks(
      [
        '# Title',
        '## Section',
        '### Detail',
        '> Quoted',
        '',
        '- First',
        '',
        '1. Second',
        '',
        'Plain',
      ].join('\n'),
    );

    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'heading',
      'heading',
      'quote',
      'list',
      'list',
      'paragraph',
    ]);
  });

  it('carries inline styling as marks, so the export shows words and keeps their styles', () => {
    const [block] = markdownToDocumentBlocks(
      'a **bold** *only* ~~old~~ `config.toml` [the plan](https://example.invalid/p)',
    );

    expect(block).toEqual({
      kind: 'paragraph',
      inlines: [
        { kind: 'text', text: 'a ', marks: {} },
        { kind: 'text', text: 'bold', marks: { bold: true } },
        { kind: 'text', text: ' ', marks: {} },
        { kind: 'text', text: 'only', marks: { italic: true } },
        { kind: 'text', text: ' ', marks: {} },
        { kind: 'text', text: 'old', marks: { strike: true } },
        { kind: 'text', text: ' ', marks: {} },
        { kind: 'text', text: 'config.toml', marks: { code: true } },
        { kind: 'text', text: ' ', marks: {} },
        { kind: 'text', text: 'the plan', marks: { href: 'https://example.invalid/p' } },
      ],
    });
  });

  it('keeps a fenced block verbatim, markers and all', () => {
    expect(markdownToDocumentBlocks(['```ts', 'const a = `**x**`;', '```'].join('\n'))).toEqual([
      { kind: 'code', language: 'ts', text: 'const a = `**x**`;' },
    ]);
  });

  it('keeps tables, nested lists, task state and math instead of flattening them', () => {
    const blocks = markdownToDocumentBlocks(
      [
        '| Name | Total |',
        '| :--- | ---: |',
        '| North | **12** |',
        '',
        '1. Outer',
        '   - [x] Inner done',
        '',
        '$$',
        'x^2',
        '$$',
      ].join('\n'),
    );

    expect(blocks[0]).toEqual({
      kind: 'table',
      align: ['left', 'right'],
      rows: [
        [[{ kind: 'text', text: 'Name', marks: {} }], [{ kind: 'text', text: 'Total', marks: {} }]],
        [
          [{ kind: 'text', text: 'North', marks: {} }],
          [{ kind: 'text', text: '12', marks: { bold: true } }],
        ],
      ],
    });
    expect(blocks[1]).toMatchObject({
      kind: 'list',
      ordered: true,
      start: 1,
      items: [
        {
          checked: null,
          blocks: [
            { kind: 'paragraph' },
            { kind: 'list', ordered: false, items: [{ checked: true }] },
          ],
        },
      ],
    });
    expect(blocks[2]).toEqual({ kind: 'math', tex: 'x^2' });
  });

  it('keeps paragraphs apart so they do not run together in the export', () => {
    expect(markdownToDocumentBlocks('one\n\ntwo')).toEqual([
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'one', marks: {} }] },
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'two', marks: {} }] },
    ]);
  });
});

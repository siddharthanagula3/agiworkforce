import { describe, expect, it } from 'vitest';
import {
  markdownToDocumentBlocks,
  type DocumentBlock,
  type DocumentInline,
} from './markdownDocument';

function firstParagraph(source: string): readonly DocumentInline[] {
  const block = markdownToDocumentBlocks(source).find(
    (candidate): candidate is Extract<DocumentBlock, { kind: 'paragraph' }> =>
      candidate.kind === 'paragraph',
  );
  return block?.inlines ?? [];
}

describe('reference-style markdown in a document export', () => {
  it('gives a reference link the destination its definition names', () => {
    const inlines = firstParagraph('See [Source][source] now.\n\n[source]: https://example.com/a');

    expect(inlines).toContainEqual({
      kind: 'text',
      text: 'Source',
      marks: { href: 'https://example.com/a' },
    });
  });

  it('resolves collapsed and shortcut references, whatever the label casing', () => {
    expect(firstParagraph('[Docs][] and [Docs]\n\n[docs]: https://example.com/d')).toEqual([
      { kind: 'text', text: 'Docs', marks: { href: 'https://example.com/d' } },
      { kind: 'text', text: ' and ', marks: {} },
      { kind: 'text', text: 'Docs', marks: { href: 'https://example.com/d' } },
    ]);
  });

  it('keeps a reference image as its linked description, like an inline image', () => {
    const inlines = firstParagraph(
      '![Quarterly chart][chart]\n\n[chart]: https://example.com/chart.png',
    );

    expect(inlines).toEqual([
      { kind: 'text', text: 'Quarterly chart', marks: { href: 'https://example.com/chart.png' } },
    ]);
  });

  it('keeps the description of a reference image whose destination is not exportable', () => {
    expect(firstParagraph('![Chart][c]\n\n[c]: data:image/png;base64,AAAA')).toEqual([
      { kind: 'text', text: 'Chart', marks: {} },
    ]);
  });

  it('does not link a reference to an unsafe scheme', () => {
    expect(firstParagraph('[Run][x]\n\n[x]: javascript:alert(1)')).toEqual([
      { kind: 'text', text: 'Run', marks: {} },
    ]);
  });

  it('leaves a bracketed label with no definition as plain text', () => {
    expect(firstParagraph('a [missing][nope] b')).toEqual([
      { kind: 'text', text: 'a [missing][nope] b', marks: {} },
    ]);
  });
});

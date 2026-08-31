import { describe, expect, it } from 'vitest';

import { citationAnchorId, citedSourceNumbers, linkifyCitations } from './citation-links';

describe('linkifyCitations', () => {
  it('turns a marker into a link to its source', () => {
    expect(linkifyCitations('Urban canopy fell by 12% [2].', 3)).toBe(
      `Urban canopy fell by 12% [&#91;2&#93;](#${citationAnchorId(2)}).`,
    );
  });

  it('links every marker in a sentence', () => {
    const out = linkifyCitations('Both studies agree [1] though one dissents [3].', 3);
    expect(out).toContain(`#${citationAnchorId(1)}`);
    expect(out).toContain(`#${citationAnchorId(3)}`);
  });

  it('leaves a marker with no matching source as written', () => {
    // Linking to an anchor that does not exist sends the reader nowhere and
    // reads as a broken control.
    expect(linkifyCitations('See [9] for detail.', 3)).toBe('See [9] for detail.');
    expect(linkifyCitations('See [0] for detail.', 3)).toBe('See [0] for detail.');
  });

  it('leaves array indexing inside a fenced block alone', () => {
    const md = ['Consider:', '', '```py', 'value = rows[1]', '```', '', 'as shown [1].'].join('\n');
    const out = linkifyCitations(md, 2);
    expect(out).toContain('value = rows[1]');
    expect(out).toContain(`as shown [&#91;1&#93;](#${citationAnchorId(1)}).`);
  });

  it('leaves indexing inside an inline code span alone', () => {
    expect(linkifyCitations('Use `items[1]` here [1].', 2)).toBe(
      `Use \`items[1]\` here [&#91;1&#93;](#${citationAnchorId(1)}).`,
    );
  });

  it('does not touch a marker that is already a link or a reference', () => {
    expect(linkifyCitations('See [1](https://example.com).', 2)).toBe(
      'See [1](https://example.com).',
    );
    expect(linkifyCitations('[1]: https://example.com', 2)).toBe('[1]: https://example.com');
    expect(linkifyCitations('A shortcut [1][2] link.', 2)).toBe('A shortcut [1][2] link.');
  });

  it('passes text through when the report has no sources', () => {
    expect(linkifyCitations('Nothing to cite [1].', 0)).toBe('Nothing to cite [1].');
  });
});

describe('citedSourceNumbers', () => {
  it('collects the distinct sources a report cites', () => {
    expect(citedSourceNumbers('Claim one [3]. Claim two [1]. Again [3].')).toEqual([1, 3]);
  });

  it('ignores indexing in code', () => {
    const md = ['```py', 'rows[7]', '```', 'and `cols[8]` and a real one [2].'].join('\n');
    expect(citedSourceNumbers(md)).toEqual([2]);
  });

  it('returns nothing for a report that cites nothing', () => {
    expect(citedSourceNumbers('No references at all.')).toEqual([]);
    expect(citedSourceNumbers('')).toEqual([]);
  });
});

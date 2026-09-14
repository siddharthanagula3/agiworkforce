import { describe, expect, it } from 'vitest';

import {
  anchorAt,
  anchorLocationAt,
  formatAnchor,
  headingAnchors,
  joinPagesWithAnchors,
  parseKnowledgeAnchors,
  rebaseAnchors,
} from './project-knowledge-anchors';

describe('joinPagesWithAnchors', () => {
  it('numbers a page by its position in the document, blanks included', () => {
    const { text, anchors } = joinPagesWithAnchors(['first page', '', 'third page']);

    expect(text).toBe('first page\n\nthird page');
    expect(anchors).toEqual([
      { start: 0, page: 1 },
      { start: 12, page: 3 },
    ]);
    expect(text.slice(12)).toBe('third page');
  });

  it('normalizes line endings before measuring an offset', () => {
    const { text, anchors } = joinPagesWithAnchors(['a\r\nb', 'c']);

    expect(text).toBe('a\nb\n\nc');
    expect(text.slice(anchors[1]!.start)).toBe('c');
  });
});

describe('headingAnchors', () => {
  it('records every markdown heading where it begins', () => {
    const text = '# Overview\nSome prose.\n\n## Pricing\nMore prose.';

    const anchors = headingAnchors(text);

    expect(anchors).toEqual([
      { start: 0, heading: 'Overview', level: 1 },
      { start: 24, heading: 'Pricing', level: 2 },
    ]);
    expect(text.slice(24)).toBe('## Pricing\nMore prose.');
  });

  it('ignores a hash that is not a heading', () => {
    expect(headingAnchors('#nothashheading\nplain line')).toEqual([]);
  });
});

describe('anchorLocationAt', () => {
  it('answers with the page for a paginated file', () => {
    const anchors = [
      { start: 0, page: 1 },
      { start: 40, page: 2 },
    ];

    expect(anchorLocationAt(anchors, 55)).toEqual({ page: 2 });
  });

  it('walks a heading back through its ancestors', () => {
    const anchors = headingAnchors(
      '# Handbook\nintro\n\n## Pricing\nrates\n\n### Refunds\nwithin 14 days',
    );

    expect(anchorLocationAt(anchors, anchors[2]!.start + 5)).toEqual({
      headingPath: ['Handbook', 'Pricing', 'Refunds'],
    });
  });

  it('skips a sibling heading rather than reading it as a parent', () => {
    const anchors = headingAnchors('## Pricing\nrates\n\n## Refunds\nwithin 14 days');

    expect(anchorLocationAt(anchors, anchors[1]!.start + 3)).toEqual({
      headingPath: ['Refunds'],
    });
  });
});

describe('rebaseAnchors', () => {
  it('shifts anchors onto a trimmed text and drops what fell off the end', () => {
    const anchors = [
      { start: 0, page: 1 },
      { start: 10, page: 2 },
      { start: 90, page: 3 },
    ];

    expect(rebaseAnchors(anchors, 4, 50)).toEqual([{ start: 6, page: 2 }]);
  });
});

describe('anchorAt', () => {
  const anchors = [
    { start: 0, page: 1 },
    { start: 40, page: 2 },
    { start: 90, page: 3 },
  ];

  it('returns the last anchor that begins at or before the offset', () => {
    expect(anchorAt(anchors, 0)?.page).toBe(1);
    expect(anchorAt(anchors, 39)?.page).toBe(1);
    expect(anchorAt(anchors, 40)?.page).toBe(2);
    expect(anchorAt(anchors, 1000)?.page).toBe(3);
  });

  it('returns nothing when the file carries no anchors', () => {
    expect(anchorAt([], 10)).toBeNull();
  });
});

describe('formatAnchor', () => {
  it('reads a page as a page and a heading as itself', () => {
    expect(formatAnchor({ start: 0, page: 12 })).toBe('p. 12');
    expect(formatAnchor({ start: 0, heading: 'Pricing' })).toBe('Pricing');
    expect(formatAnchor(null)).toBeNull();
  });
});

describe('parseKnowledgeAnchors', () => {
  it('keeps well-formed entries in ascending order and drops the rest', () => {
    expect(
      parseKnowledgeAnchors([
        { start: 40, page: 2 },
        { start: 0, page: 1 },
        { start: -1, page: 9 },
        { start: 60 },
        'nonsense',
      ]),
    ).toEqual([
      { start: 0, page: 1 },
      { start: 40, page: 2 },
    ]);
  });

  it('returns nothing for a row written before the column existed', () => {
    expect(parseKnowledgeAnchors(null)).toEqual([]);
  });
});

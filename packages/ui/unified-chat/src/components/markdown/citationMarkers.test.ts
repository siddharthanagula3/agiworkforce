import { describe, it, expect } from 'vitest';
import {
  CITATION_GROUP_HREF_PATTERN,
  CITATION_HREF_PATTERN,
  citationGroupHref,
  citationHref,
  citationSpansFromAnchors,
  deliveredCitationSpans,
  findCitationIndexForUrl,
  insertCitationMarkers,
  isCitationOnlyLinkText,
  linkifyCitationMarkers,
  readCitationSpans,
  withoutCitationMarkers,
} from './citationMarkers';

describe('linkifyCitationMarkers', () => {
  it('links an isolated marker to its own href', () => {
    const out = linkifyCitationMarkers('A claim [1].', 3);
    expect(out).toBe(`A claim [&#91;1&#93;](${citationHref(1)}).`);
  });

  it('groups an unbroken run of markers into one link', () => {
    const out = linkifyCitationMarkers('Three sources agree [1][2][3].', 3);
    expect(out).toBe(
      `Three sources agree [&#91;1&#93;&#91;2&#93;&#91;3&#93;](${citationGroupHref([1, 2, 3])}).`,
    );
  });

  it('splits a run around a marker naming a source that was not delivered', () => {
    const out = linkifyCitationMarkers('Mixed [1][9][2].', 3);
    expect(out).toBe(
      `Mixed [&#91;1&#93;](${citationHref(1)})[9][&#91;2&#93;](${citationHref(2)}).`,
    );
  });

  it('leaves a marker past the delivered source count as plain text', () => {
    expect(linkifyCitationMarkers('No source for this [9].', 3)).toBe('No source for this [9].');
    expect(linkifyCitationMarkers('No source for this [4].', 3)).toBe('No source for this [4].');
  });

  it('leaves a zero marker alone; it names no source', () => {
    expect(linkifyCitationMarkers('Not a citation [0].', 3)).toBe('Not a citation [0].');
  });

  it('does not touch a reference-style link that happens to end in digits', () => {
    const out = linkifyCitationMarkers('See the [glossary][1].', 3);
    expect(out).toBe('See the [glossary][1].');
  });

  it('does not touch a footnote definition line', () => {
    const out = linkifyCitationMarkers('Body text.\n[1]: https://example.com', 3);
    expect(out).toBe('Body text.\n[1]: https://example.com');
  });

  it('leaves a marker inside a fenced code block untouched', () => {
    const out = linkifyCitationMarkers('```\nrows[1][2]\n```', 3);
    expect(out).toBe('```\nrows[1][2]\n```');
  });

  it('leaves a marker inside inline code untouched', () => {
    const out = linkifyCitationMarkers('call `rows[1]` here [2].', 3);
    expect(out).toBe(`call \`rows[1]\` here [&#91;2&#93;](${citationHref(2)}).`);
  });

  it('leaves a still-streaming, unclosed marker as plain text', () => {
    const out = linkifyCitationMarkers('Landed just now [4', 5);
    expect(out).toBe('Landed just now [4');
  });
});

describe('citation href patterns', () => {
  it('matches a single citation href and captures its index', () => {
    const match = CITATION_HREF_PATTERN.exec(citationHref(7));
    expect(match?.[1]).toBe('7');
  });

  it('matches a grouped citation href and captures every index', () => {
    const match = CITATION_GROUP_HREF_PATTERN.exec(citationGroupHref([1, 2, 3]));
    expect(match?.[1]).toBe('1,2,3');
  });

  it('does not match a single href against the group pattern', () => {
    expect(CITATION_GROUP_HREF_PATTERN.test(citationHref(1))).toBe(false);
  });
});

describe('findCitationIndexForUrl', () => {
  const sources = [
    { url: 'https://www.nvidia.com/en-us/solutions/autonomous-vehicles/alpamayo/' },
    { url: 'https://blog.google/innovation-and-ai/products/gemini-app/productivity-features/' },
  ];

  it('matches an exact, normalised URL', () => {
    expect(
      findCitationIndexForUrl(
        'https://nvidia.com/en-us/solutions/autonomous-vehicles/alpamayo',
        sources,
      ),
    ).toBe(1);
  });

  it('matches a bare domain link to the one source on that domain', () => {
    expect(findCitationIndexForUrl('https://blog.google', sources)).toBe(2);
  });

  it('matches when the href is a URL-boundary prefix of exactly one source', () => {
    expect(findCitationIndexForUrl('https://blog.google/innovation-and-ai', sources)).toBe(2);
  });

  it('does not match a domain string that is not a URL boundary prefix', () => {
    expect(findCitationIndexForUrl('https://blog.google.evil.com', sources)).toBeUndefined();
  });

  it('leaves the link plain when two sources share the domain', () => {
    const twoOnSameDomain = [
      { url: 'https://blog.google/one-post/' },
      { url: 'https://blog.google/two-post/' },
    ];
    expect(findCitationIndexForUrl('https://blog.google', twoOnSameDomain)).toBeUndefined();
  });

  it('leaves an unrelated domain unmatched', () => {
    expect(findCitationIndexForUrl('https://openai.com', sources)).toBeUndefined();
  });

  it('leaves a full article url unmatched rather than swap in an unrelated page on the same domain', () => {
    expect(
      findCitationIndexForUrl(
        'https://blog.google/products/ads-commerce/google-ads-analytics-ai-updates/',
        sources,
      ),
    ).toBeUndefined();
  });

  it('still resolves a bare domain link with only a trailing slash', () => {
    expect(findCitationIndexForUrl('https://blog.google/', sources)).toBe(2);
  });
});

describe('isCitationOnlyLinkText', () => {
  const BARE_DOMAIN_HREF = 'https://frame.work';

  it('collapses a link whose text is a single citation marker', () => {
    expect(isCitationOnlyLinkText('[1]', citationHref(1))).toBe(true);
  });

  it('collapses a link whose text is a run of citation markers', () => {
    expect(isCitationOnlyLinkText('[1][2]', citationGroupHref([1, 2]))).toBe(true);
  });

  it('collapses a link whose text is the bare domain it points at', () => {
    expect(isCitationOnlyLinkText('frame.work', BARE_DOMAIN_HREF)).toBe(true);
    expect(isCitationOnlyLinkText('www.frame.work', BARE_DOMAIN_HREF)).toBe(true);
  });

  it('collapses a link whose text is the href spelled out', () => {
    expect(isCitationOnlyLinkText('https://frame.work/', BARE_DOMAIN_HREF)).toBe(true);
  });

  it('collapses a link with no visible text at all', () => {
    expect(isCitationOnlyLinkText('  ', BARE_DOMAIN_HREF)).toBe(true);
  });

  it('keeps a price label that happens to link to a cited domain', () => {
    expect(isCitationOnlyLinkText('$1,999', BARE_DOMAIN_HREF)).toBe(false);
  });

  it('keeps prose link text', () => {
    expect(isCitationOnlyLinkText('Framework Laptop 13', BARE_DOMAIN_HREF)).toBe(false);
  });

  it('keeps a label that only contains the domain alongside other words', () => {
    expect(isCitationOnlyLinkText('frame.work store', BARE_DOMAIN_HREF)).toBe(false);
  });
});

describe('insertCitationMarkers', () => {
  const ANSWER = 'Rates held steady. Growth slowed.';

  it('places a marker at the end of each grounded span, right to left', () => {
    expect(
      insertCitationMarkers(
        ANSWER,
        [
          { endIndex: 18, positions: [1] },
          { endIndex: 32, positions: [1, 2] },
        ],
        2,
      ),
    ).toBe('Rates held steady.[1] Growth slowed.[1][2]');
  });

  it('steps past the full stop that closes a segment, but not a dot inside a word', () => {
    expect(
      insertCitationMarkers('Node.js shipped v26.', [{ endIndex: 4, positions: [1] }], 1),
    ).toBe('Node[1].js shipped v26.');
  });

  it('leaves prose the model already numbered alone', () => {
    const cited = 'Rates held steady.[2]';
    expect(insertCitationMarkers(cited, [{ endIndex: 18, positions: [1] }], 2)).toBe(cited);
  });

  it('drops a position past the delivered source count', () => {
    expect(insertCitationMarkers(ANSWER, [{ endIndex: 18, positions: [7] }], 2)).toBe(ANSWER);
  });

  it('never writes a marker inside a fenced code block', () => {
    const withFence = 'Intro.\n```\nrows[1]\n```\n';
    expect(insertCitationMarkers(withFence, [{ endIndex: 15, positions: [1] }], 2)).toBe(withFence);
  });

  it('ignores an offset past the end of the answer', () => {
    expect(insertCitationMarkers(ANSWER, [{ endIndex: 900, positions: [1] }], 2)).toBe(ANSWER);
  });
});

describe('citationSpansFromAnchors', () => {
  const ANSWER =
    'The latest LTS line is Node.js 24. It moves to maintenance on October 20, 2026.\n\n' +
    '| Line | Status |\n| --- | --- |\n| 24 | LTS |';

  it('places each citation at the end of the sentence it arrived in', () => {
    const second = ANSWER.indexOf('It moves');
    const spans = citationSpansFromAnchors(ANSWER, [
      { offset: 0, marker: 1 },
      { offset: second, marker: 2 },
      { offset: second + 3, marker: 1 },
    ]);
    expect(insertCitationMarkers(ANSWER, spans, 2).split('\n')[0]).toBe(
      'The latest LTS line is Node.js 24.[1] It moves to maintenance on October 20, 2026.[1][2]',
    );
  });

  it('leaves table rows without a marker', () => {
    const row = ANSWER.indexOf('| 24 |');
    expect(citationSpansFromAnchors(ANSWER, [{ offset: row, marker: 1 }])).toEqual([]);
  });

  it('reaches the end of the text for a claim whose sentence has not ended', () => {
    expect(citationSpansFromAnchors('Tulips need a cold', [{ offset: 0, marker: 1 }])).toEqual([
      { endIndex: 18, positions: [1] },
    ]);
  });

  it('ignores an anchor at or past the end of the text', () => {
    expect(citationSpansFromAnchors('Short.', [{ offset: 6, marker: 1 }])).toEqual([]);
  });
});

describe('readCitationSpans', () => {
  it('keeps only spans with a numeric end and at least one whole position', () => {
    expect(
      readCitationSpans([
        { endIndex: 18, positions: [1, 0, 2.5, 3] },
        { endIndex: 'x', positions: [1] },
        { endIndex: 9, positions: [] },
        { endIndex: 4 },
        null,
      ]),
    ).toEqual([{ endIndex: 18, positions: [1, 3] }]);
  });

  it('reads anything that is not a list as no spans', () => {
    expect(readCitationSpans({ endIndex: 1, positions: [1] })).toEqual([]);
  });
});

describe('deliveredCitationSpans', () => {
  it("renumbers the provider's positions onto the delivered list and drops pages never delivered", () => {
    expect(
      deliveredCitationSpans(
        [
          { endIndex: 18, positions: [1] },
          { endIndex: 33, positions: [2, 3] },
          { endIndex: 40, positions: [3] },
        ],
        ['https://a.example/one', 'https://www.b.example/two/?utm_source=x', 'https://c.example/'],
        ['https://b.example/two', 'https://a.example/one'],
      ),
    ).toEqual([
      { endIndex: 18, positions: [2] },
      { endIndex: 33, positions: [1] },
    ]);
  });
});

describe('withoutCitationMarkers', () => {
  it('drops marker runs from prose and keeps code, links and footnotes as written', () => {
    expect(
      withoutCitationMarkers(
        [
          'Tulips need a cold winter.[1] They bloom in spring.[1][2]',
          'Read `rows[1]` and [the guide][2] or [docs](https://example.com).',
          '```',
          'items[3]',
          '```',
          '[2]: https://example.com/guide',
        ].join('\n'),
      ),
    ).toBe(
      [
        'Tulips need a cold winter. They bloom in spring.',
        'Read `rows[1]` and [the guide][2] or [docs](https://example.com).',
        '```',
        'items[3]',
        '```',
        '[2]: https://example.com/guide',
      ].join('\n'),
    );
  });
});

describe('long crafted link text and hrefs', () => {
  it('compares link text ending in a long run of slashes in linear time', () => {
    expect(isCitationOnlyLinkText(`${'/'.repeat(100_000)}x`, 'https://frame.work')).toBe(false);
  });

  it('normalises an href whose path holds a long run of slashes in linear time', () => {
    const sources = [{ url: 'https://blog.google/innovation-and-ai/' }];
    expect(
      findCitationIndexForUrl(`https://blog.google/${'/'.repeat(100_000)}x`, sources),
    ).toBeUndefined();
  });

  it('still resolves a bare domain link that ends in several slashes', () => {
    const sources = [{ url: 'https://blog.google/innovation-and-ai/' }];
    expect(findCitationIndexForUrl('https://blog.google///', sources)).toBe(1);
    expect(isCitationOnlyLinkText('https://frame.work///', 'https://frame.work')).toBe(true);
  });
});

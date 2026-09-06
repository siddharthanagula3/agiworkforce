import { describe, it, expect } from 'vitest';
import {
  CITATION_GROUP_HREF_PATTERN,
  CITATION_HREF_PATTERN,
  citationGroupHref,
  citationHref,
  findCitationIndexForUrl,
  isCitationOnlyLinkText,
  linkifyCitationMarkers,
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

  it('splits a run around a marker outside the delivered source count', () => {
    const out = linkifyCitationMarkers('Mixed [1][9][2].', 3);
    expect(out).toBe(
      `Mixed [&#91;1&#93;](${citationHref(1)})[9][&#91;2&#93;](${citationHref(2)}).`,
    );
  });

  it('leaves an out-of-range marker as plain text', () => {
    const out = linkifyCitationMarkers('No source for this [9].', 3);
    expect(out).toBe('No source for this [9].');
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

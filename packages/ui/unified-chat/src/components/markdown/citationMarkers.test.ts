import { describe, it, expect } from 'vitest';
import {
  CITATION_GROUP_HREF_PATTERN,
  CITATION_HREF_PATTERN,
  citationGroupHref,
  citationHref,
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

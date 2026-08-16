import { describe, expect, it } from 'vitest';
import { dedupeResearchSources } from './research-sources';

describe('dedupeResearchSources', () => {
  it('de-dupes by URL and assigns stable sequential citation numbers', () => {
    const result = dedupeResearchSources([
      { url: 'https://a.com/x', title: 'A' },
      { url: 'https://b.com/y', title: 'B' },
      { url: 'https://a.com/x', title: 'A dup' },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.citationIndex)).toEqual([1, 2]);
    expect(result[0]?.url).toBe('https://a.com/x');
    expect(result[1]?.url).toBe('https://b.com/y');
  });

  it('treats www / trailing-slash / hash variants of the same URL as one source', () => {
    const result = dedupeResearchSources([
      { url: 'https://www.example.com/page/', title: 'first' },
      { url: 'https://example.com/page#section', title: 'second' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.citationIndex).toBe(1);
    expect(result[0]?.title).toBe('first');
  });

  it('fills missing metadata from later duplicates without renumbering', () => {
    const result = dedupeResearchSources([
      { url: 'https://a.com', title: '' },
      { url: 'https://a.com', title: 'Real Title', snippet: 'snip', favicon: 'f.png' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Real Title');
    expect(result[0]?.snippet).toBe('snip');
    expect(result[0]?.favicon).toBe('f.png');
  });

  it('drops entries without a usable URL (graceful missing metadata)', () => {
    const result = dedupeResearchSources([
      { url: '', title: 'no url' },
      { url: '   ', title: 'blank url' },
      { url: 'https://valid.com', title: 'ok' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe('https://valid.com');
    expect(result[0]?.citationIndex).toBe(1);
  });

  it('returns an empty array for an empty input', () => {
    expect(dedupeResearchSources([])).toEqual([]);
  });
});

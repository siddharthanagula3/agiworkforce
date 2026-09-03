import { describe, expect, it } from 'vitest';
import { dedupeResearchSources, orderSourcesByCitation } from './research-sources';
import type { ResearchSource } from '../stores/research-panel-store';

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

  it('treats a tracking-param variant of a URL as the same source', () => {
    const result = dedupeResearchSources([
      { url: 'https://example.com/a?utm_source=chatgpt.com', title: 'first' },
      { url: 'https://example.com/a', title: 'second' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.citationIndex).toBe(1);
    expect(result[0]?.title).toBe('first');
  });

  it('keeps a real, non-tracking query param distinct', () => {
    const result = dedupeResearchSources([
      { url: 'https://example.com/a?id=1', title: 'one' },
      { url: 'https://example.com/a?id=2', title: 'two' },
    ]);
    expect(result).toHaveLength(2);
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

describe('orderSourcesByCitation', () => {
  it('numbers the Citations group by annotation order, independent of the pooled index', () => {
    const annotations: ResearchSource[] = [
      { url: 'https://ann.com/one', title: 'Ann One', citationIndex: 1 },
      { url: 'https://ann.com/two', title: 'Ann Two', citationIndex: 2 },
      { url: 'https://ann.com/three', title: 'Ann Three', citationIndex: 3 },
    ];
    const pool: ResearchSource[] = Array.from({ length: 10 }, (_, i) => ({
      url: `https://pool.com/${i + 1}`,
      title: `Pool ${i + 1}`,
      citationIndex: i + 1,
    }));
    const { cited, more } = orderSourcesByCitation(
      'First [1], then [2], and [3].',
      annotations,
      pool,
    );

    expect(cited.map((s) => s.citationIndex)).toEqual([1, 2, 3]);
    expect(cited.map((s) => s.url)).toEqual(annotations.map((a) => a.url));
    expect(more).toHaveLength(10);
    expect(more.some((s) => annotations.some((a) => a.url === s.url))).toBe(false);
  });

  it('does not duplicate a source that differs from its annotation only by a trailing slash', () => {
    const annotations: ResearchSource[] = [
      { url: 'https://example.com/report', title: 'Report', citationIndex: 1 },
    ];
    const pool: ResearchSource[] = [
      { url: 'https://example.com/report/', title: 'Report (pooled)', citationIndex: 1 },
      { url: 'https://other.com', title: 'Other', citationIndex: 2 },
    ];
    const { cited, more } = orderSourcesByCitation('See the report [1].', annotations, pool);

    expect(cited).toHaveLength(1);
    expect(more).toHaveLength(1);
    expect(more[0]?.url).toBe('https://other.com');
    expect(cited.length + more.length).toBe(2);
  });

  it('keeps pool numbering for the Citations group when the provider sends no annotations', () => {
    const pool: ResearchSource[] = [
      { url: 'https://pool.com/1', title: 'Pool 1', citationIndex: 1 },
      { url: 'https://pool.com/2', title: 'Pool 2', citationIndex: 2 },
      { url: 'https://pool.com/3', title: 'Pool 3', citationIndex: 3 },
    ];
    const { cited, more } = orderSourcesByCitation('Per [1] and [2].', pool, pool);

    expect(cited.map((s) => s.citationIndex)).toEqual([1, 2]);
    expect(more.map((s) => s.citationIndex)).toEqual([3]);
  });
});

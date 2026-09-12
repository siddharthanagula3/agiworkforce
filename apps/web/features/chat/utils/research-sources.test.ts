import { describe, expect, it } from 'vitest';
import {
  collectMessageResearchSources,
  dedupeResearchSources,
  orderSourcesByCitation,
} from './research-sources';
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

describe('collectMessageResearchSources', () => {
  /**
   * A native-search turn carries two partly overlapping lists: the pages the
   * provider searched, and the pages the model cited. The citations used to be
   * read only when the search list was empty, so an outlet the model cited but
   * the provider never listed vanished: the Sources control counted one source
   * for a turn that named two, and the [n] marker for the missing outlet opened
   * nothing.
   */
  it('counts an outlet that only the citations name, alongside the searched pages', () => {
    const { searchSources } = collectMessageResearchSources({
      searchResults: [{ url: 'https://reuters.com/a', title: 'Reuters', snippet: '' }],
      citations: [
        { type: 'url_citation', url: 'https://reuters.com/a', title: 'Reuters' },
        { type: 'url_citation', url: 'https://apnews.com/b', title: 'AP News' },
      ],
    });

    expect(searchSources.map((source) => source.url)).toEqual([
      'https://reuters.com/a',
      'https://apnews.com/b',
    ]);
    expect(searchSources.map((source) => source.citationIndex)).toEqual([1, 2]);
  });

  /**
   * The same page reached by both lists is still one source. Counting it twice
   * would trade an undercount for an overcount and put a duplicate row in the
   * Sources panel.
   */
  it('does not double count a page that both lists carry, www and slash variants included', () => {
    const { searchSources } = collectMessageResearchSources({
      searchResults: [{ url: 'https://www.reuters.com/a/', title: 'Reuters', snippet: '' }],
      citations: [{ type: 'url_citation', url: 'https://reuters.com/a', title: 'Reuters' }],
    });

    expect(searchSources).toHaveLength(1);
  });

  /** The marker list stays annotation-ordered, so [1] is the model's first citation. */
  it('numbers the markers by citation order even when the searched list ordered them differently', () => {
    const { citationsByMarker } = collectMessageResearchSources({
      searchResults: [
        { url: 'https://apnews.com/b', title: 'AP News', snippet: '' },
        { url: 'https://reuters.com/a', title: 'Reuters', snippet: '' },
      ],
      citations: [
        { type: 'url_citation', url: 'https://reuters.com/a', title: 'Reuters' },
        { type: 'url_citation', url: 'https://apnews.com/b', title: 'AP News' },
      ],
    });

    expect(citationsByMarker.map((citation) => citation.url)).toEqual([
      'https://reuters.com/a',
      'https://apnews.com/b',
    ]);
  });

  /**
   * A deep-research report numbers its [n] markers off the cumulative source
   * list the loop delivered, and that run emits no per-claim annotations, so
   * the fallback numbering must stay exactly the delivered order.
   */
  it('keeps delivered order as the marker order when the turn carries no citations', () => {
    const { citationsByMarker, searchSources } = collectMessageResearchSources({
      searchResults: {
        query: 'state of the art',
        results: [
          { url: 'https://one.com', title: 'One', snippet: '' },
          { url: 'https://two.com', title: 'Two', snippet: '' },
        ],
        timestamp: new Date(0),
      },
    });

    expect(citationsByMarker.map((citation) => citation.citationIndex)).toEqual([1, 2]);
    expect(searchSources.map((source) => source.url)).toEqual([
      'https://one.com',
      'https://two.com',
    ]);
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

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SOURCE_RANKING_WEIGHTS,
  RECENCY_HORIZON_DAYS,
  rankSources,
  scoreSource,
  type RankableSource,
} from '../source-ranking';

const NOW = Date.parse('2026-09-13T00:00:00.000Z');
const ctx = { now: NOW };

function url(order: number): string {
  return `https://example-${order}.test/article`;
}

describe('scoreSource', () => {
  it('prefers a dated page over an undated one, and the newer of two dated pages', () => {
    const undated = scoreSource({ url: url(1) }, ctx).signals.recency;
    const old = scoreSource({ url: url(2), publishedDate: '2024-09-13' }, ctx).signals.recency;
    const fresh = scoreSource({ url: url(3), publishedDate: '2026-09-01' }, ctx).signals.recency;
    expect(undated).toBe(0);
    expect(fresh).toBeGreaterThan(old);
    expect(old).toBeGreaterThan(0);
  });

  it('gives nothing for a page older than the recency horizon or dated in the future', () => {
    const ancient = new Date(NOW - (RECENCY_HORIZON_DAYS + 10) * 86_400_000).toISOString();
    const future = new Date(NOW + 86_400_000).toISOString();
    expect(scoreSource({ url: url(1), publishedDate: ancient }, ctx).signals.recency).toBe(0);
    expect(scoreSource({ url: url(2), publishedDate: future }, ctx).signals.recency).toBe(0);
  });

  it("recognises a publisher's own page from the name alone, with no domain list", () => {
    const own = scoreSource(
      { url: 'https://www.federalreserve.gov/newsevents/one', publisher: 'Federal Reserve' },
      ctx,
    );
    const republished = scoreSource(
      { url: 'https://news-aggregator.test/story', publisher: 'Federal Reserve' },
      ctx,
    );
    expect(own.signals.publisherPage).toBe(1);
    expect(republished.signals.publisherPage).toBe(0);
  });

  it('matches a publisher the answer named even when the result carried no attribution', () => {
    const scored = scoreSource(
      { url: 'https://reuters.test/story' },
      {
        ...ctx,
        publishersNamedInAnswer: ['Reuters'],
      },
    );
    expect(scored.signals.publisherPage).toBe(1);
  });

  it('rewards structured data, https and repeated appearance across the turn', () => {
    const rich = scoreSource(
      { url: url(1), hasStructuredData: true, timesReturned: 3 },
      ctx,
    ).signals;
    expect(rich.structuredData).toBe(1);
    expect(rich.https).toBe(1);
    expect(rich.citedInTurn).toBe(1);
    expect(scoreSource({ url: 'http://plain.test/x' }, ctx).signals.https).toBe(0);
    expect(scoreSource({ url: url(2), timesReturned: 1 }, ctx).signals.citedInTurn).toBe(0);
  });

  it('scores language by the reported tag when there is one', () => {
    const context = { ...ctx, queryLanguage: 'es' };
    expect(scoreSource({ url: url(1), language: 'es-ES' }, context).signals.language).toBe(1);
    expect(scoreSource({ url: url(2), language: 'en-US' }, context).signals.language).toBe(0);
  });

  it('falls back to writing system agreement, and stays neutral when it cannot tell', () => {
    const context = { ...ctx, queryText: '最新的通货膨胀率是多少' };
    expect(
      scoreSource({ url: url(1), title: '国家统计局发布最新数据' }, context).signals.language,
    ).toBe(1);
    expect(
      scoreSource({ url: url(2), title: 'Latest inflation figures' }, context).signals.language,
    ).toBe(0);
    expect(scoreSource({ url: url(3) }, context).signals.language).toBe(0.5);
  });

  it('demotes an extracted page that is too short or too repetitive to be an account', () => {
    const navigation = Array.from({ length: 400 }, () => 'home about contact login').join(' ');
    const prose = Array.from({ length: 200 }, (_, i) => `sentence${i} about the subject`).join(' ');
    expect(
      scoreSource({ url: url(1), extractedText: 'Accept cookies' }, ctx).signals.boilerplate,
    ).toBe(1);
    expect(scoreSource({ url: url(2), extractedText: navigation }, ctx).signals.boilerplate).toBe(
      1,
    );
    expect(scoreSource({ url: url(3), extractedText: prose }, ctx).signals.boilerplate).toBe(0);
  });

  it('does not call an unfetched page boilerplate', () => {
    expect(scoreSource({ url: url(1) }, ctx).signals.boilerplate).toBe(0);
  });
});

describe('rankSources', () => {
  it('puts the primary, dated, structured page above an undated aggregator copy', () => {
    const sources: RankableSource[] = [
      {
        url: 'https://aggregator.test/reprint',
        title: 'Fed holds rates steady',
        snippet: 'The Federal Reserve held rates.',
      },
      {
        url: 'https://federalreserve.test/press/one',
        title: 'FOMC statement',
        snippet: 'The Committee decided to maintain the target range.',
        publisher: 'Federal Reserve',
        publishedDate: '2026-09-10',
        hasStructuredData: true,
      },
    ];
    const ranked = rankSources(sources, ctx);
    expect(ranked[0]?.source.url).toBe('https://federalreserve.test/press/one');
  });

  it('keeps the backend order when no signal separates two results', () => {
    const sources: RankableSource[] = [
      { url: 'https://a.test/one', title: 'Alpha report', snippet: 'One' },
      { url: 'https://b.test/two', title: 'Beta findings', snippet: 'Two' },
    ];
    const ranked = rankSources(sources, ctx);
    expect(ranked.map((entry) => entry.originalIndex)).toEqual([0, 1]);
  });

  it('demotes a near-duplicate of a result already ranked above it', () => {
    const shared = {
      title: 'Fed holds the target range steady at the September meeting',
      snippet: 'The Federal Open Market Committee decided to maintain the target range today.',
    };
    const sources: RankableSource[] = [
      { url: 'https://first.test/story', ...shared },
      { url: 'https://copy.test/story', ...shared },
      { url: 'https://other.test/story', title: 'Unrelated analysis', snippet: 'Something else.' },
    ];
    const ranked = rankSources(sources, ctx);
    const copy = ranked.find((entry) => entry.source.url === 'https://copy.test/story');
    expect(copy?.signals.duplicate).toBe(1);
    expect(ranked[ranked.length - 1]?.source.url).toBe('https://copy.test/story');
  });

  it('reads every weight from the one table, so a zeroed weight stops mattering', () => {
    const sources: RankableSource[] = [
      { url: 'https://a.test/one', title: 'A' },
      { url: 'https://b.test/two', title: 'B', publishedDate: '2026-09-12' },
    ];
    const withRecency = rankSources(sources, ctx);
    expect(withRecency[0]?.source.url).toBe('https://b.test/two');
    const withoutRecency = rankSources(sources, ctx, {
      ...DEFAULT_SOURCE_RANKING_WEIGHTS,
      recency: 0,
    });
    expect(withoutRecency[0]?.source.url).toBe('https://a.test/one');
  });

  it('returns every source it was given, ranking rather than filtering', () => {
    const sources: RankableSource[] = Array.from({ length: 7 }, (_, i) => ({
      url: url(i),
      title: `Title ${i}`,
    }));
    expect(rankSources(sources, ctx)).toHaveLength(7);
  });
});

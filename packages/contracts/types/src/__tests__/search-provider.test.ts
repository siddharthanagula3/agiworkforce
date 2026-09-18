import { describe, expect, it } from 'vitest';

import {
  SOURCE_DELIVERIES,
  canonicalSourceUrl,
  classifySourceFreshness,
  createSearchSource,
  dedupeSearchSources,
  isSourceDelivery,
  sameSourceUrl,
  searchCitationId,
  sourceContentVersion,
  sourceDeliveryLabel,
  sourceFingerprint,
} from '../search-provider';

const RETRIEVED_AT = '2026-09-18T12:00:00.000Z';

describe('canonicalSourceUrl', () => {
  it('collapses scheme, www and tracking parameters onto one key', () => {
    expect(canonicalSourceUrl('https://www.Example.com/a/?utm_source=x&b=2')).toBe(
      'example.com/a?b=2',
    );
    expect(sameSourceUrl('http://example.com/a', 'https://www.example.com/a/#top')).toBe(true);
  });

  it('keeps a value that is not a url rather than dropping the source', () => {
    expect(canonicalSourceUrl('  Not A URL ')).toBe('not a url');
  });
});

describe('searchCitationId', () => {
  it('gives the same id to the same page returned by two providers', () => {
    const fromOne = searchCitationId({
      url: 'https://example.com/story?utm_campaign=a',
      title: 'Provider one headline',
      snippet: 'one summary',
    });
    const fromTwo = searchCitationId({
      url: 'http://www.example.com/story/',
      title: 'Provider two headline',
      snippet: 'another summary',
    });
    expect(fromOne).toBe(fromTwo);
  });

  it('gives different pages different ids', () => {
    expect(searchCitationId({ url: 'https://example.com/a' })).not.toBe(
      searchCitationId({ url: 'https://example.com/b' }),
    );
  });

  it('falls back to the content fingerprint when there is no url', () => {
    const id = searchCitationId({ url: '', title: 'A note', snippet: 'body' });
    expect(id).toMatch(/^src_[0-9a-f]{16}$/);
    expect(id).not.toBe(searchCitationId({ url: '', title: 'A note', snippet: 'other' }));
  });
});

describe('sourceContentVersion', () => {
  it('tracks the cited text, not the page, so a rewrite is a new version', () => {
    const first = sourceContentVersion({ url: 'https://example.com/a', snippet: 'first draft' });
    const second = sourceContentVersion({ url: 'https://example.com/a', snippet: 'second draft' });
    expect(first).not.toBe(second);
    expect(searchCitationId({ url: 'https://example.com/a' })).toBe(
      searchCitationId({ url: 'https://example.com/a' }),
    );
  });
});

describe('sourceFingerprint', () => {
  it('is stable and 16 hex characters wide', () => {
    expect(sourceFingerprint('abc')).toBe(sourceFingerprint('abc'));
    expect(sourceFingerprint('abc')).toMatch(/^[0-9a-f]{16}$/);
    expect(sourceFingerprint('abc')).not.toBe(sourceFingerprint('abd'));
  });
});

describe('classifySourceFreshness', () => {
  const now = new Date('2026-09-18T00:00:00.000Z');

  it.each([
    ['2026-09-15T00:00:00.000Z', 'fresh', 3],
    ['2026-08-01T00:00:00.000Z', 'recent', 48],
    ['2025-01-01T00:00:00.000Z', 'stale', 625],
  ])('%s is %s', (published, expected, ageDays) => {
    const freshness = classifySourceFreshness(published, now);
    expect(freshness.class).toBe(expected);
    expect(freshness.ageDays).toBe(ageDays);
  });

  it('is unknown, never fresh, when the publisher gives no date', () => {
    expect(classifySourceFreshness(null, now)).toEqual({
      publishedAt: null,
      ageDays: null,
      class: 'unknown',
    });
    expect(classifySourceFreshness('not a date', now).class).toBe('unknown');
  });
});

describe('createSearchSource', () => {
  it('carries identity, provenance and freshness on every source', () => {
    const source = createSearchSource({
      url: 'https://example.com/story',
      title: 'Story',
      snippet: 'summary',
      providerId: 'test-provider',
      delivery: 'indexed',
      retrievedAt: RETRIEVED_AT,
      indexedAt: '2026-09-17T00:00:00.000Z',
      publishedAt: '2026-09-16T00:00:00.000Z',
      now: new Date(RETRIEVED_AT),
    });
    expect(source.id).toMatch(/^src_[0-9a-f]{16}$/);
    expect(source.canonicalUrl).toBe('example.com/story');
    expect(source.contentVersion).toMatch(/^v1_[0-9a-f]{16}$/);
    expect(source.provenance).toMatchObject({
      providerId: 'test-provider',
      retrievedAt: RETRIEVED_AT,
      indexedAt: '2026-09-17T00:00:00.000Z',
      delivery: 'indexed',
    });
    expect(source.provenance.freshness.class).toBe('fresh');
  });

  it('defaults an unstated index time to null rather than to now', () => {
    const source = createSearchSource({
      url: 'https://example.com/a',
      providerId: 'p',
      delivery: 'external',
      retrievedAt: RETRIEVED_AT,
    });
    expect(source.provenance.indexedAt).toBeNull();
  });
});

describe('dedupeSearchSources', () => {
  const base = {
    url: 'https://example.com/story',
    title: 'Story',
    snippet: 'summary',
    retrievedAt: RETRIEVED_AT,
  };

  it('collapses the same page from two providers into one citation', () => {
    const deduped = dedupeSearchSources([
      createSearchSource({ ...base, providerId: 'one', delivery: 'indexed' }),
      createSearchSource({
        ...base,
        url: 'http://www.example.com/story/?utm_source=z',
        providerId: 'two',
        delivery: 'indexed',
      }),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.provenance.providerId).toBe('one');
  });

  it('never upgrades a cached copy to live because another provider claimed live', () => {
    const deduped = dedupeSearchSources([
      createSearchSource({ ...base, providerId: 'one', delivery: 'cached' }),
      createSearchSource({ ...base, providerId: 'two', delivery: 'live' }),
    ]);
    expect(deduped[0]!.provenance.delivery).toBe('cached');
  });

  it('takes the known publication date when the first copy had none', () => {
    const deduped = dedupeSearchSources([
      createSearchSource({ ...base, providerId: 'one', delivery: 'indexed' }),
      createSearchSource({
        ...base,
        providerId: 'two',
        delivery: 'indexed',
        publishedAt: '2026-09-16T00:00:00.000Z',
      }),
    ]);
    expect(deduped[0]!.provenance.freshness.publishedAt).toBe('2026-09-16T00:00:00.000Z');
  });
});

describe('delivery vocabulary', () => {
  it('names all four ways content reaches a reader', () => {
    expect([...SOURCE_DELIVERIES]).toEqual(['live', 'cached', 'indexed', 'external']);
  });

  it('accepts only those four', () => {
    expect(isSourceDelivery('cached')).toBe(true);
    expect(isSourceDelivery('fresh')).toBe(false);
  });

  it('labels a cached result as cached, never as live', () => {
    expect(sourceDeliveryLabel('cached')).toBe('from a cached copy');
    expect(sourceDeliveryLabel('cached')).not.toBe(sourceDeliveryLabel('live'));
  });
});

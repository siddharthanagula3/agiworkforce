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

describe('every source shape a result can take', () => {
  const BASE = {
    url: 'https://example.com/a',
    title: 'A',
    snippet: 'S',
    retrievedAt: RETRIEVED_AT,
  };

  it('carries the same identity and timestamps whichever way it was delivered', () => {
    const ids = new Set<string>();
    for (const delivery of SOURCE_DELIVERIES) {
      const source = createSearchSource({ ...BASE, providerId: `p-${delivery}`, delivery });
      ids.add(source.id);
      expect(source.provenance.delivery, delivery).toBe(delivery);
      expect(source.provenance.retrievedAt, delivery).toBe(RETRIEVED_AT);
      expect(source.provenance.providerId, delivery).toBe(`p-${delivery}`);
      expect(source.canonicalUrl, delivery).toBe(canonicalSourceUrl(BASE.url));
      expect(source.contentVersion, delivery).toBe(sourceContentVersion(BASE));
      expect(Object.keys(source.provenance).sort(), delivery).toEqual([
        'delivery',
        'freshness',
        'indexedAt',
        'providerId',
        'retrievedAt',
      ]);
    }
    expect(ids.size, 'the same page changed identity with its delivery').toBe(1);
  });

  it('gives every delivery a sentence that does not claim more than it did', () => {
    for (const delivery of SOURCE_DELIVERIES) {
      const label = sourceDeliveryLabel(delivery);
      expect(label.length, delivery).toBeGreaterThan(0);
      if (delivery !== 'live') expect(label, delivery).not.toContain('live');
    }
    expect(new Set(SOURCE_DELIVERIES.map(sourceDeliveryLabel)).size).toBe(SOURCE_DELIVERIES.length);
    expect(SOURCE_DELIVERIES.every(isSourceDelivery)).toBe(true);
  });

  it('classes freshness for every age, and never calls an undated page fresh', () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    const cases: ReadonlyArray<readonly [number | null, string]> = [
      [0, 'fresh'],
      [7, 'fresh'],
      [8, 'recent'],
      [90, 'recent'],
      [91, 'stale'],
      [4000, 'stale'],
      [null, 'unknown'],
    ];
    for (const [ageDays, expected] of cases) {
      const publishedAt =
        ageDays === null ? null : new Date(now.getTime() - ageDays * 86_400_000).toISOString();
      const freshness = classifySourceFreshness(publishedAt, now);
      expect(freshness.class, `${ageDays} days old`).toBe(expected);
      expect(freshness.ageDays, `${ageDays} days old`).toBe(ageDays);
    }
    for (const bad of ['', 'not a date', 'yesterday']) {
      expect(classifySourceFreshness(bad, now).class, bad).toBe('unknown');
    }
  });

  it('tracks a source version that moves with the text and not with the delivery', () => {
    const first = createSearchSource({ ...BASE, providerId: 'p', delivery: 'indexed' });
    const sameTextLater = createSearchSource({
      ...BASE,
      providerId: 'q',
      delivery: 'live',
      retrievedAt: '2026-09-19T12:00:00.000Z',
    });
    const rewritten = createSearchSource({
      ...BASE,
      snippet: 'S rewritten',
      providerId: 'p',
      delivery: 'indexed',
    });
    expect(sameTextLater.contentVersion).toBe(first.contentVersion);
    expect(rewritten.contentVersion).not.toBe(first.contentVersion);
    expect(rewritten.id).toBe(first.id);
  });

  it('gives a citation id to a source with no usable url rather than dropping it', () => {
    for (const url of ['', '   ', 'not a url']) {
      const source = createSearchSource({ ...BASE, url, providerId: 'p', delivery: 'external' });
      expect(source.id, url).toMatch(/^src_[0-9a-f]{16}$/);
      expect(source.id, url).toBe(searchCitationId({ ...BASE, url }));
    }
    expect(sourceFingerprint('a')).not.toBe(sourceFingerprint('b'));
  });

  it('collapses one page delivered every way into one citation, at the weakest claim', () => {
    const sources = SOURCE_DELIVERIES.map((delivery) =>
      createSearchSource({ ...BASE, providerId: `p-${delivery}`, delivery }),
    );
    const deduped = dedupeSearchSources(sources);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.provenance.delivery).toBe('external');
  });
});

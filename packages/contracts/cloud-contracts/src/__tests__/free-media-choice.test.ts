import { describe, expect, it } from 'vitest';

import { chooseLimitedFreeMedia, limitedFreeMedia, type FreeQuotaCatalogue } from '../free-quota';

const RESETS_AT = '2026-10-05T00:00:00.000Z';

function catalogue(patch: Partial<FreeQuotaCatalogue> = {}): FreeQuotaCatalogue {
  const image = {
    displayName: 'Fixture Image',
    providerModelId: 'fixture-image',
    category: 'image' as const,
    limit: 100,
    unit: 'images' as const,
    consumedApproximate: 0,
    expiresOn: '2026-10-21',
    status: 'ready' as const,
  };
  return {
    issuer: 'Fixture Cloud',
    observedOn: '2026-09-19',
    evidenceUrl: 'https://provider.example/free-quota',
    reportedEligible: 2,
    reportedUnavailable: 0,
    models: [
      { ...image, key: 'image-listed-first' },
      { ...image, key: 'image-ranked-first' },
    ],
    mediaUseOrder: ['image-ranked-first', 'image-listed-first'],
    limitedOffer: [{ category: 'image', dailyCap: 5, remainingToday: 5, resetsAt: RESETS_AT }],
    ...patch,
  };
}

describe('the shared limited free media choice', () => {
  it('picks the ready model the server ranked first, the one every client sends to', () => {
    expect(chooseLimitedFreeMedia(catalogue(), 'image')).toBe('image-ranked-first');
  });

  it('offers nothing without a limited offer for that kind', () => {
    expect(chooseLimitedFreeMedia(catalogue({ limitedOffer: [] }), 'image')).toBeNull();
    expect(chooseLimitedFreeMedia(catalogue(), 'video')).toBeNull();
    expect(chooseLimitedFreeMedia(null, 'image')).toBeNull();
  });

  it('reports the last served day as the day before the offer ends', () => {
    expect(limitedFreeMedia(catalogue(), 'image')).toEqual({
      lastDay: '2026-10-20',
      dailyCap: 5,
      remainingToday: 5,
      resetsAt: RESETS_AT,
    });
  });
});

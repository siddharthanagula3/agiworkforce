import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FreeQuotaCatalogue } from '@agiworkforce/cloud-contracts';
import { chooseLimitedFreeMedia, resolveLimitedFreeMedia } from './free-media-choice';

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
    reportedEligible: 3,
    reportedUnavailable: 0,
    models: [
      { ...image, key: 'image-listed-first' },
      { ...image, key: 'image-expiring-first' },
      { ...image, key: 'image-spent', status: 'exhausted' },
    ],
    mediaUseOrder: ['image-expiring-first', 'image-listed-first'],
    limitedOffer: [{ category: 'image', dailyCap: 5, remainingToday: 5, resetsAt: RESETS_AT }],
    ...patch,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the free offering a typed image or video request is sent to', () => {
  it('is the ready offering the server ranked first for that kind', () => {
    expect(chooseLimitedFreeMedia(catalogue(), 'image')).toBe('image-expiring-first');
  });

  it('is none for a kind the offer does not cover, or when nothing of it is ready', () => {
    expect(chooseLimitedFreeMedia(catalogue({ limitedOffer: undefined }), 'image')).toBeNull();
    expect(chooseLimitedFreeMedia(catalogue(), 'video')).toBeNull();
    expect(chooseLimitedFreeMedia(null, 'image')).toBeNull();
    expect(
      chooseLimitedFreeMedia(
        catalogue({
          models: catalogue().models.map((entry) => ({ ...entry, status: 'expired' })),
        }),
        'image',
      ),
    ).toBeNull();
  });

  it('reads the catalogue and distinguishes confirmed absence from unreadable availability', async () => {
    const fetchMock = vi.fn(async () => Response.json(catalogue()));
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveLimitedFreeMedia('image')).toEqual({
      status: 'offered',
      modelId: 'image-expiring-first',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/models/free-quota',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(await resolveLimitedFreeMedia('video')).toEqual({ status: 'not_offered' });

    for (const status of [401, 403, 404]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ error: 'not offered' }, { status })),
      );
      expect(await resolveLimitedFreeMedia('image'), String(status)).toEqual({
        status: 'unknown',
      });
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(null)),
    );
    expect(await resolveLimitedFreeMedia('image')).toEqual({ status: 'unknown' });
  });

  it('answers unknown, never not offered, when the catalogue could not be read', async () => {
    for (const status of [429, 500, 503]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ error: 'failed' }, { status })),
      );
      expect(await resolveLimitedFreeMedia('image'), String(status)).toEqual({
        status: 'unknown',
      });
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );
    expect(await resolveLimitedFreeMedia('image')).toEqual({ status: 'unknown' });
  });
  it('keeps unavailable provider inventory and missing offer terms unknown', async () => {
    for (const value of [
      catalogue({ models: catalogue().models.map((model) => ({ ...model, status: 'unavailable' })) }),
      catalogue({ limitedOffer: undefined }),
      {},
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json(value)));
      expect(await resolveLimitedFreeMedia('image')).toEqual({ status: 'unknown' });
    }
  });

  it('uses explicit category availability before selecting a model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(catalogue({
      mediaAvailability: { image: 'unknown', video: 'not_offered' },
    }))));
    expect(await resolveLimitedFreeMedia('image')).toEqual({ status: 'unknown' });
    expect(await resolveLimitedFreeMedia('video')).toEqual({ status: 'not_offered' });
  });

  it('keeps a spent daily allocation offered for the daily-limit recovery flow', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(catalogue({
      limitedOffer: [{ category: 'image', dailyCap: 10, remainingToday: 0, resetsAt: RESETS_AT }],
    }))));
    expect(await resolveLimitedFreeMedia('image')).toEqual({ status: 'offered', modelId: 'image-expiring-first' });
  });

});

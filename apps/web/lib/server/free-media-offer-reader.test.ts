// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FreeQuotaCatalogue, FreeQuotaModel } from '@agiworkforce/cloud-contracts';
import { isFreeMediaCategory } from '@/features/models/lib/free-media-offer';
import type { LimitedMediaOffer } from '@/lib/server/free-pools';
type FreePoolsModule = typeof import('@/lib/server/free-pools');
type CatalogueCacheModule = typeof import('@/lib/server/free-quota-catalogue-cache');
type KeyValueModule = typeof import('@/lib/server/key-value');
type LoggerModule = typeof import('@/lib/logger');

const mocks = vi.hoisted(() => ({
  limitedOffer: undefined as LimitedMediaOffer | undefined,
  readCatalogue: vi.fn(),
  storeConfigured: true,
  logError: vi.fn(),
}));

vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<FreePoolsModule>();
  return {
    ...actual,
    loadFreePools: () => ({ ...actual.loadFreePools(), limitedMediaOffer: mocks.limitedOffer }),
  };
});
vi.mock('@/lib/server/free-quota-catalogue-cache', async (importOriginal) => {
  const actual = await importOriginal<CatalogueCacheModule>();
  return {
    ...actual,
    readSharedFreeQuotaCatalogue: (
      ...args: Parameters<typeof actual.readSharedFreeQuotaCatalogue>
    ) =>
      mocks.storeConfigured
        ? mocks.readCatalogue(...args)
        : actual.readSharedFreeQuotaCatalogue(...args),
  };
});
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<KeyValueModule>()),
  getKeyValueStore: () => null,
}));
vi.mock('@/lib/logger', async (importOriginal) => {
  const actual = await importOriginal<LoggerModule>();
  return {
    ...actual,
    logger: Object.assign(Object.create(actual.logger) as LoggerModule['logger'], {
      error: mocks.logError,
    }),
  };
});

const { FREE_MEDIA_OFFER_RENDER_BUDGET_MS, readFreeMediaOffer, readFreeMediaOfferForRender } =
  await import('./free-media-offer-reader');
const { readSharedFreeQuotaCatalogue } = await import('./free-quota-catalogue-cache');
const { sharedFreeQuotaContext } = await import('./free-quota-catalogue');

const OFFER: LimitedMediaOffer = { dailyCapPerUser: { image: 5, video: 1 } };

function model(
  category: FreeQuotaModel['category'],
  status: FreeQuotaModel['status'],
  expiresOn: string | null,
): FreeQuotaModel {
  return {
    key: `fixture/${category}-${status}`,
    displayName: `Fixture ${category}`,
    providerModelId: null,
    category,
    limit: null,
    unit: null,
    consumedApproximate: null,
    expiresOn,
    status,
  };
}

function catalogue(models: FreeQuotaModel[]): FreeQuotaCatalogue {
  return {
    issuer: 'fixture-issuer',
    observedOn: '2026-10-04',
    evidenceUrl: 'https://provider.example/benefits',
    reportedEligible: models.length,
    reportedUnavailable: 0,
    models,
  };
}

beforeEach(() => {
  mocks.limitedOffer = OFFER;
  mocks.storeConfigured = true;
  mocks.readCatalogue.mockReset();
  mocks.logError.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('readFreeMediaOffer', () => {
  it('reports each kind that has a ready offering, with the last day it is served', async () => {
    mocks.readCatalogue.mockResolvedValue(
      catalogue([model('image', 'ready', '2026-10-21'), model('video', 'ready', null)]),
    );

    expect(await readFreeMediaOffer()).toEqual({
      image: { lastDay: '2026-10-20' },
      video: { lastDay: null },
    });
  });

  it('reports only the kind that is ready', async () => {
    mocks.readCatalogue.mockResolvedValue(
      catalogue([model('image', 'exhausted', '2026-10-21'), model('video', 'ready', null)]),
    );

    expect(await readFreeMediaOffer()).toEqual({ image: null, video: { lastDay: null } });
  });

  it('reports nothing and reads no catalogue while the offer is not configured', async () => {
    mocks.limitedOffer = undefined;

    expect(await readFreeMediaOffer()).toEqual({ image: null, video: null });
    expect(mocks.readCatalogue).not.toHaveBeenCalled();
  });

  it('lets a failed catalogue read reach its caller, so the endpoint answers with an error', async () => {
    mocks.readCatalogue.mockRejectedValue(new Error('store unreachable'));

    await expect(readFreeMediaOffer()).rejects.toThrow('store unreachable');
  });
});

describe('readFreeMediaOfferForRender', () => {
  it('returns the same offer the endpoint reader returns', async () => {
    mocks.readCatalogue.mockResolvedValue(
      catalogue([model('image', 'ready', '2026-10-21'), model('video', 'ready', '2026-10-21')]),
    );

    expect(await readFreeMediaOfferForRender()).toEqual(await readFreeMediaOffer());
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('returns null and logs once when the catalogue store is unreachable', async () => {
    const failure = new Error('store unreachable');
    mocks.readCatalogue.mockRejectedValue(failure);

    expect(await readFreeMediaOfferForRender()).toBeNull();
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith(
      { error: failure },
      expect.stringContaining('[free-quota]'),
    );
  });

  it('stops waiting at the render budget when the catalogue read never answers', async () => {
    vi.useFakeTimers();
    mocks.readCatalogue.mockReturnValue(new Promise<never>(() => undefined));
    const settled = vi.fn();
    const visit = readFreeMediaOfferForRender().then((offer) => {
      settled(offer);
      return offer;
    });

    await vi.advanceTimersByTimeAsync(FREE_MEDIA_OFFER_RENDER_BUDGET_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toHaveBeenCalledWith(null);
    expect(await visit).toBeNull();
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      expect.stringContaining('[free-quota]'),
    );
  });

  it('returns a catalogue that answers inside the render budget', async () => {
    vi.useFakeTimers();
    const ready = catalogue([model('image', 'ready', null), model('video', 'ready', null)]);
    mocks.readCatalogue.mockReturnValue(
      new Promise((resolve) => {
        setTimeout(() => resolve(ready), FREE_MEDIA_OFFER_RENDER_BUDGET_MS - 1);
      }),
    );
    const visit = readFreeMediaOfferForRender();

    await vi.advanceTimersByTimeAsync(FREE_MEDIA_OFFER_RENDER_BUDGET_MS);

    expect(await visit).toEqual({ image: { lastDay: null }, video: { lastDay: null } });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('leaves the endpoint reader waiting on a slow catalogue instead of answering empty', async () => {
    vi.useFakeTimers();
    const ready = catalogue([model('image', 'ready', null)]);
    mocks.readCatalogue.mockReturnValue(
      new Promise((resolve) => {
        setTimeout(() => resolve(ready), FREE_MEDIA_OFFER_RENDER_BUDGET_MS * 4);
      }),
    );
    const answer = readFreeMediaOffer();

    await vi.advanceTimersByTimeAsync(FREE_MEDIA_OFFER_RENDER_BUDGET_MS * 4);

    expect(await answer).toEqual({ image: { lastDay: null }, video: null });
  });

  it('reports no offer, without throwing, when no shared store is configured and no cache exists', async () => {
    mocks.storeConfigured = false;
    const decided = await readSharedFreeQuotaCatalogue(sharedFreeQuotaContext());

    expect(decided?.models.some((entry) => isFreeMediaCategory(entry.category))).toBe(true);
    expect(decided?.models.filter((entry) => entry.status === 'ready')).toEqual([]);
    expect(await readFreeMediaOfferForRender()).toEqual({ image: null, video: null });
    expect(mocks.readCatalogue).not.toHaveBeenCalled();
    expect(mocks.logError).not.toHaveBeenCalled();
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FreeQuotaCatalogue, FreeQuotaModel } from '@agiworkforce/cloud-contracts';
import { BYOK_PROVIDER_IDS } from '@/app/byok/byok-providers';
import { FREE_MEDIA_LIMITED_LABEL } from '@/features/models/lib/free-media-offer';
import { approximateCount, MARKETING } from '@/lib/marketing-constants';
import type { LimitedMediaOffer } from '@/lib/server/free-pools';
type FreePoolsModule = typeof import('@/lib/server/free-pools');
type CatalogueCacheModule = typeof import('@/lib/server/free-quota-catalogue-cache');
type LoggerModule = typeof import('@/lib/logger');

const mocks = vi.hoisted(() => ({
  limitedOffer: undefined as LimitedMediaOffer | undefined,
  readCatalogue: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/server/free-pools', async (importOriginal) => {
  const actual = await importOriginal<FreePoolsModule>();
  return {
    ...actual,
    loadFreePools: () => ({ ...actual.loadFreePools(), limitedMediaOffer: mocks.limitedOffer }),
  };
});
vi.mock('@/lib/server/free-quota-catalogue-cache', async (importOriginal) => ({
  ...(await importOriginal<CatalogueCacheModule>()),
  readSharedFreeQuotaCatalogue: mocks.readCatalogue,
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

const { default: Home } = await import('./page');

const OFFER: LimitedMediaOffer = { dailyCapPerUser: { image: 5, video: 1 } };
const PILL_ARROW = '→';
const STANDING_PILL = `New${approximateCount(MARKETING.models.count)} models across ${approximateCount(BYOK_PROVIDER_IDS.length)} providers${PILL_ARROW}`;

function ready(category: FreeQuotaModel['category']): FreeQuotaModel {
  return {
    key: `fixture/${category}`,
    displayName: `Fixture ${category}`,
    providerModelId: null,
    category,
    limit: null,
    unit: null,
    consumedApproximate: null,
    expiresOn: '2026-10-21',
    status: 'ready',
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

async function serverRender(): Promise<HTMLElement> {
  const page = document.createElement('div');
  page.innerHTML = renderToStaticMarkup(await Home());
  document.body.replaceChildren(page);
  return page;
}

function pill(page: HTMLElement): HTMLElement {
  const links = page.querySelectorAll<HTMLElement>('a.agi-fl-announce');
  if (links.length !== 1) throw new Error(`The hero renders ${links.length} announcement pills.`);
  return links[0]!;
}

beforeEach(() => {
  mocks.limitedOffer = OFFER;
  mocks.readCatalogue.mockReset();
  mocks.logError.mockReset();
});

describe('root page', () => {
  it('renders the marketing landing for the signed-out request', async () => {
    mocks.readCatalogue.mockResolvedValue(catalogue([]));

    const page = await serverRender();

    expect(page.querySelectorAll('main#main-content')).toHaveLength(1);
    expect(page.querySelector('h1')).toHaveTextContent('AGI');
  });

  it('keeps the standing pill and logs when the offer cannot be read', async () => {
    mocks.readCatalogue.mockRejectedValue(new Error('store unreachable'));

    const page = await serverRender();

    expect(pill(page).textContent).toBe(STANDING_PILL);
    expect(pill(page)).toHaveAttribute('href', '/providers');
    expect(mocks.logError).toHaveBeenCalledTimes(1);
  });

  it('keeps the standing pill while nothing is ready', async () => {
    mocks.readCatalogue.mockResolvedValue(catalogue([]));

    const page = await serverRender();

    expect(pill(page).textContent).toBe(STANDING_PILL);
    expect(pill(page)).toHaveAttribute('href', '/providers');
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('announces the limited free offer and links to its terms while both kinds are ready', async () => {
    mocks.readCatalogue.mockResolvedValue(catalogue([ready('image'), ready('video')]));

    const page = await serverRender();

    expect(pill(page).textContent).toBe(
      `${FREE_MEDIA_LIMITED_LABEL}Free image and video${PILL_ARROW}`,
    );
    expect(pill(page)).toHaveAttribute('href', '/pricing');
  });

  it('announces only the kind that is ready', async () => {
    mocks.readCatalogue.mockResolvedValue(catalogue([ready('video')]));

    const page = await serverRender();

    expect(pill(page).textContent).toBe(
      `${FREE_MEDIA_LIMITED_LABEL}Free video generation${PILL_ARROW}`,
    );
    expect(pill(page)).toHaveAttribute('href', '/pricing');
  });
});

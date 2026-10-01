import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEATURE_RATE_CARD,
  RATE_CARD_PROVIDER_COGS_ENV,
  chargeMicrousdForProviderCost,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/web-search/search-budget');

vi.mock('server-only', () => ({}));

const settleSearchCall = vi.hoisted(() => vi.fn());
vi.mock('@/lib/web-search/search-budget', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  settleSearchCall,
}));

import { INCLUDED_SEARCH_ADMISSION } from '@/lib/web-search/search-budget';

import {
  PERPLEXITY_SEARCH_FEATURE,
  PERPLEXITY_SEARCH_PROVIDER_ID,
  perplexitySearchChargeMicrousd,
  perplexitySearchMicrousdPerCall,
  settlePerplexitySearchCall,
} from './perplexity-search-cost';

const OVERRIDE_ENV = RATE_CARD_PROVIDER_COGS_ENV.web_search_perplexity;
const PUBLISHED_MICROUSD_PER_CALL = FEATURE_RATE_CARD.web_search_perplexity
  .providerCogsMicrousd as number;
const db = {} as never;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('perplexitySearchMicrousdPerCall', () => {
  it('prices a call from the published rate when nothing is configured', () => {
    vi.stubEnv(OVERRIDE_ENV, '');
    expect(PUBLISHED_MICROUSD_PER_CALL).toBeGreaterThan(0);
    expect(perplexitySearchMicrousdPerCall()).toBe(PUBLISHED_MICROUSD_PER_CALL);
  });

  it('honours a configured unit price', () => {
    vi.stubEnv(OVERRIDE_ENV, '20000');
    expect(perplexitySearchMicrousdPerCall()).toBe(20_000);
  });

  it('falls back to the published rate on an unusable override', () => {
    vi.stubEnv(OVERRIDE_ENV, 'not-a-number');
    expect(perplexitySearchMicrousdPerCall()).toBe(PUBLISHED_MICROUSD_PER_CALL);
  });
});

describe('perplexitySearchChargeMicrousd', () => {
  it('charges the provider cost of one call, with no separate customer price', () => {
    vi.stubEnv(OVERRIDE_ENV, '');
    expect(perplexitySearchChargeMicrousd()).toBe(
      chargeMicrousdForProviderCost(PUBLISHED_MICROUSD_PER_CALL),
    );
  });

  it('rounds a provider cost up to the next hundredth of a credit', () => {
    vi.stubEnv(OVERRIDE_ENV, '5001');
    expect(perplexitySearchChargeMicrousd()).toBe(5_050);
  });
});

describe('settlePerplexitySearchCall', () => {
  beforeEach(() => {
    settleSearchCall.mockReset();
    settleSearchCall.mockResolvedValue(undefined);
    vi.stubEnv(OVERRIDE_ENV, '');
  });

  it('settles an answered call at its provider cost through the search owner', async () => {
    await settlePerplexitySearchCall({
      userId: 'user_1',
      organizationId: 'org_1',
      admission: INCLUDED_SEARCH_ADMISSION,
      billableCalls: 1,
      answered: true,
      turnRef: 'turn-1',
      callOrdinal: 2,
      surface: 'web',
      db,
    });

    expect(settleSearchCall).toHaveBeenCalledTimes(1);
    expect(settleSearchCall).toHaveBeenCalledWith({
      userId: 'user_1',
      organizationId: 'org_1',
      admission: INCLUDED_SEARCH_ADMISSION,
      feature: PERPLEXITY_SEARCH_FEATURE,
      provider: PERPLEXITY_SEARCH_PROVIDER_ID,
      tool: 'perplexity_search',
      calls: 1,
      providerCostMicrousd: PUBLISHED_MICROUSD_PER_CALL,
      charged: true,
      delivered: true,
      costRef: 'perplexity_search:turn-1:2',
      taskRef: 'turn-1',
      surface: 'web',
      db,
    });
  });

  it('never charges a call that returned nothing, but still passes on what the provider billed', async () => {
    await settlePerplexitySearchCall({
      userId: 'user_1',
      admission: INCLUDED_SEARCH_ADMISSION,
      billableCalls: 1,
      answered: false,
      turnRef: 'turn-2',
      callOrdinal: 1,
      db,
    });

    expect(settleSearchCall).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: null,
        calls: 1,
        providerCostMicrousd: PUBLISHED_MICROUSD_PER_CALL,
        charged: false,
        delivered: false,
        surface: null,
      }),
    );
  });

  it('counts no provider cost for calls that never happened', async () => {
    for (const billableCalls of [0, -1, Number.NaN]) {
      settleSearchCall.mockClear();
      await settlePerplexitySearchCall({
        userId: 'user_1',
        admission: INCLUDED_SEARCH_ADMISSION,
        billableCalls,
        answered: true,
        turnRef: 'turn-3',
        callOrdinal: 1,
        db,
      });
      expect(settleSearchCall).toHaveBeenCalledWith(
        expect.objectContaining({ calls: 0, providerCostMicrousd: 0 }),
      );
    }
  });
});

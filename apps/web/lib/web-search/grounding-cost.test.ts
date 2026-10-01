import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEATURE_RATE_CARD,
  MICROUSD_PER_USD,
  RATE_CARD_PROVIDER_COGS_ENV,
  chargeMicrousdForProviderCost,
  requireProviderDefaultModel,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/web-search/search-budget');

vi.mock('server-only', () => ({}));

const settleSearchCall = vi.hoisted(() => vi.fn());
vi.mock('@/lib/web-search/search-budget', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  settleSearchCall,
}));

import { INCLUDED_SEARCH_ADMISSION } from '@/lib/web-search/search-budget';
import { resolveGoogleGroundingPricingTier } from '@/lib/web-search/web-search-pricing';

import {
  GOOGLE_GROUNDING_FEATURE,
  googleGroundingChargeMicrousd,
  googleGroundingMicrousdPerCall,
  settleGoogleGroundingSpend,
} from './grounding-cost';

const GOOGLE_MODEL = requireProviderDefaultModel('google');
const UNREGISTERED_MODEL = 'not-a-registered-model';
const OVERRIDE_ENV = RATE_CARD_PROVIDER_COGS_ENV.web_search_grounding;
const PUBLISHED_MICROUSD_PER_CALL = FEATURE_RATE_CARD.web_search_grounding
  .providerCogsMicrousd as number;
const PREVIOUS_TIER_MICROUSD_PER_CALL = Math.round(
  (resolveGoogleGroundingPricingTier(UNREGISTERED_MODEL).usdPerThousandBeyondPool / 1_000) *
    MICROUSD_PER_USD,
);
const db = {} as never;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('googleGroundingMicrousdPerCall', () => {
  it('prices a current model from the published rate when nothing is configured', () => {
    vi.stubEnv(OVERRIDE_ENV, '');
    expect(PUBLISHED_MICROUSD_PER_CALL).toBeGreaterThan(0);
    expect(googleGroundingMicrousdPerCall(GOOGLE_MODEL)).toBe(PUBLISHED_MICROUSD_PER_CALL);
  });

  it('prices an unrecognized model from the older, lower-volume tier', () => {
    vi.stubEnv(OVERRIDE_ENV, '');
    expect(PREVIOUS_TIER_MICROUSD_PER_CALL).toBeGreaterThan(PUBLISHED_MICROUSD_PER_CALL);
    expect(googleGroundingMicrousdPerCall(UNREGISTERED_MODEL)).toBe(
      PREVIOUS_TIER_MICROUSD_PER_CALL,
    );
  });

  it('applies a configured unit price to every tier', () => {
    vi.stubEnv(OVERRIDE_ENV, '20000');
    expect(googleGroundingMicrousdPerCall(GOOGLE_MODEL)).toBe(20_000);
    expect(googleGroundingMicrousdPerCall(UNREGISTERED_MODEL)).toBe(20_000);
  });

  it('falls back to the published rate on an unusable override', () => {
    vi.stubEnv(OVERRIDE_ENV, 'not-a-number');
    expect(googleGroundingMicrousdPerCall(GOOGLE_MODEL)).toBe(PUBLISHED_MICROUSD_PER_CALL);
  });
});

describe('googleGroundingChargeMicrousd', () => {
  it('charges the provider cost of the calls beyond the pool, rounded once over the batch', () => {
    vi.stubEnv(OVERRIDE_ENV, '');
    expect(googleGroundingChargeMicrousd(GOOGLE_MODEL, 5)).toBe(
      chargeMicrousdForProviderCost(5 * PUBLISHED_MICROUSD_PER_CALL),
    );
  });

  it('rounds a provider cost up to the next hundredth of a credit', () => {
    vi.stubEnv(OVERRIDE_ENV, '5001');
    expect(googleGroundingChargeMicrousd(GOOGLE_MODEL, 1)).toBe(5_050);
  });

  it('charges nothing for calls that never landed beyond the pool', () => {
    expect(googleGroundingChargeMicrousd(GOOGLE_MODEL, 0)).toBe(0);
    expect(googleGroundingChargeMicrousd(GOOGLE_MODEL, -1)).toBe(0);
    expect(googleGroundingChargeMicrousd(GOOGLE_MODEL, Number.NaN)).toBe(0);
  });
});

describe('settleGoogleGroundingSpend', () => {
  beforeEach(() => {
    settleSearchCall.mockReset();
    settleSearchCall.mockResolvedValue(undefined);
    vi.stubEnv(OVERRIDE_ENV, '');
  });

  it('settles the billable grounded calls at provider cost through the search owner', async () => {
    await settleGoogleGroundingSpend({
      userId: 'user_1',
      organizationId: 'org_1',
      admission: INCLUDED_SEARCH_ADMISSION,
      providerId: 'google',
      model: GOOGLE_MODEL,
      turnRef: 'turn-1',
      settlementRef: 0,
      billableCalls: 2,
      delivered: true,
      surface: 'web',
      db,
    });

    expect(settleSearchCall).toHaveBeenCalledTimes(1);
    expect(settleSearchCall).toHaveBeenCalledWith({
      userId: 'user_1',
      organizationId: 'org_1',
      admission: INCLUDED_SEARCH_ADMISSION,
      feature: GOOGLE_GROUNDING_FEATURE,
      provider: 'google',
      model: GOOGLE_MODEL,
      tool: 'google_search_grounding',
      calls: 2,
      providerCostMicrousd: 2 * PUBLISHED_MICROUSD_PER_CALL,
      charged: true,
      delivered: true,
      costRef: 'google_grounding:turn-1:0',
      taskRef: 'turn-1',
      surface: 'web',
      db,
    });
  });

  it('keeps the charge for grounding the model ran even when the turn was not delivered', async () => {
    await settleGoogleGroundingSpend({
      userId: 'user_1',
      admission: INCLUDED_SEARCH_ADMISSION,
      providerId: 'google',
      model: GOOGLE_MODEL,
      turnRef: 'turn-2',
      settlementRef: 1,
      billableCalls: 1,
      delivered: false,
      db,
    });

    expect(settleSearchCall).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: null,
        charged: true,
        delivered: false,
        costRef: 'google_grounding:turn-2:1',
        surface: null,
      }),
    );
  });

  it('counts no provider cost when every grounded call stayed inside the pool', async () => {
    await settleGoogleGroundingSpend({
      userId: 'user_1',
      admission: INCLUDED_SEARCH_ADMISSION,
      providerId: 'google',
      model: GOOGLE_MODEL,
      turnRef: 'turn-3',
      settlementRef: 0,
      billableCalls: 0,
      delivered: true,
      db,
    });

    expect(settleSearchCall).toHaveBeenCalledWith(
      expect.objectContaining({ calls: 0, providerCostMicrousd: 0 }),
    );
  });
});

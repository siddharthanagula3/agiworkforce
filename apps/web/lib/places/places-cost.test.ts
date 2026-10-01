import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEATURE_RATE_CARD,
  PLACES_SEARCH_TOOL_NAME,
  RATE_CARD_PROVIDER_COGS_ENV,
  chargeMicrousdForProviderCost,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/web-search/search-budget');

vi.mock('server-only', () => ({}));

const reserveSearchCharge = vi.hoisted(() => vi.fn());
const settleSearchCall = vi.hoisted(() => vi.fn());
vi.mock('@/lib/web-search/search-budget', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  reserveSearchCharge,
  settleSearchCall,
}));

import type { FreeTrialToolSpend } from '@/lib/services/free-trial-service';
import { ManagedUsageRequestError } from '@/lib/services/managed-usage-request-service';
import { INCLUDED_SEARCH_ADMISSION } from '@/lib/web-search/search-budget';

import { PLACES_SEARCH_FEATURE, placesSearchMicrousdPerCall } from './places-config';
import {
  reservePlacesSearchCharge,
  settlePlacesSearchCall,
  type PlacesSearchBilling,
} from './places-cost';

const OVERRIDE_ENV = RATE_CARD_PROVIDER_COGS_ENV.places_text_search;
const PUBLISHED_MICROUSD_PER_CALL = FEATURE_RATE_CARD.places_text_search
  .providerCogsMicrousd as number;
const db = {} as never;

function billing(overrides: Partial<PlacesSearchBilling> = {}): PlacesSearchBilling {
  return {
    userId: 'user_1',
    organizationId: 'org_1',
    planTier: 'pro',
    requestId: 'req-1',
    turnRef: 'turn-1',
    surface: 'web',
    db,
    ...overrides,
  };
}

function freeSpend(canHold: boolean): FreeTrialToolSpend {
  return {
    hold: vi.fn(() => canHold),
    settle: vi.fn(),
    exhausted: vi.fn(() => !canHold),
  };
}

beforeEach(() => {
  vi.stubEnv(OVERRIDE_ENV, '');
  reserveSearchCharge.mockReset();
  reserveSearchCharge.mockResolvedValue({
    outcome: 'admitted',
    admission: INCLUDED_SEARCH_ADMISSION,
  });
  settleSearchCall.mockReset();
  settleSearchCall.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('placesSearchMicrousdPerCall', () => {
  it('prices a call from the published rate when nothing is configured', () => {
    expect(PUBLISHED_MICROUSD_PER_CALL).toBeGreaterThan(0);
    expect(placesSearchMicrousdPerCall()).toBe(PUBLISHED_MICROUSD_PER_CALL);
  });

  it('honours a configured unit price', () => {
    vi.stubEnv(OVERRIDE_ENV, '20000');
    expect(placesSearchMicrousdPerCall()).toBe(20_000);
  });

  it('falls back to the published rate on an unusable override', () => {
    vi.stubEnv(OVERRIDE_ENV, 'not-a-number');
    expect(placesSearchMicrousdPerCall()).toBe(PUBLISHED_MICROUSD_PER_CALL);
  });
});

describe('reservePlacesSearchCharge', () => {
  it('reserves a paid call at its provider cost before the search runs', async () => {
    await expect(
      reservePlacesSearchCharge(billing(), { providerId: 'google_places', toolCallId: 'call-1' }),
    ).resolves.toEqual({ outcome: 'admitted', admission: INCLUDED_SEARCH_ADMISSION });

    expect(reserveSearchCharge).toHaveBeenCalledWith({
      userId: 'user_1',
      organizationId: 'org_1',
      planTier: 'pro',
      requestId: 'req-1',
      callRef: 'call-1',
      feature: PLACES_SEARCH_FEATURE,
      provider: 'google_places',
      chargeMicrousd: chargeMicrousdForProviderCost(PUBLISHED_MICROUSD_PER_CALL),
      scope: 'places',
      db,
    });
  });

  it('holds a Free call on the turn Free spend instead of the paid ledger', async () => {
    const spend = freeSpend(true);

    await expect(
      reservePlacesSearchCharge(billing({ planTier: 'free', freeTrial: spend }), {
        providerId: 'google_places',
        toolCallId: 'call-2',
      }),
    ).resolves.toEqual({ outcome: 'admitted', admission: INCLUDED_SEARCH_ADMISSION });

    expect(spend.hold).toHaveBeenCalledWith(PUBLISHED_MICROUSD_PER_CALL);
    expect(reserveSearchCharge).not.toHaveBeenCalled();
  });

  it('refuses a Free call the Free windows cannot cover', async () => {
    const outcome = await reservePlacesSearchCharge(
      billing({ planTier: 'free', freeTrial: freeSpend(false) }),
      { providerId: 'google_places', toolCallId: 'call-3' },
    );

    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome !== 'refused') return;
    expect(outcome.error).toBeInstanceOf(ManagedUsageRequestError);
    expect(outcome.error.status).toBe(429);
    expect(outcome.error.code).toBe('free_trial_token_budget_reached');
    expect(reserveSearchCharge).not.toHaveBeenCalled();
  });
});

describe('settlePlacesSearchCall', () => {
  it('settles an answered call at provider cost through the search owner', async () => {
    await settlePlacesSearchCall(billing(), {
      admission: INCLUDED_SEARCH_ADMISSION,
      providerId: 'google_places',
      toolCallId: 'call-1',
      billableCalls: 1,
      answered: true,
    });

    expect(settleSearchCall).toHaveBeenCalledWith({
      userId: 'user_1',
      organizationId: 'org_1',
      admission: INCLUDED_SEARCH_ADMISSION,
      feature: PLACES_SEARCH_FEATURE,
      provider: 'google_places',
      tool: PLACES_SEARCH_TOOL_NAME,
      calls: 1,
      providerCostMicrousd: PUBLISHED_MICROUSD_PER_CALL,
      charged: true,
      delivered: true,
      costRef: 'places_search:call-1',
      taskRef: 'turn-1',
      surface: 'web',
      db,
    });
  });

  it('never charges an unanswered call and counts nothing for a call that never happened', async () => {
    await settlePlacesSearchCall(billing({ organizationId: undefined, surface: undefined }), {
      admission: INCLUDED_SEARCH_ADMISSION,
      providerId: 'google_places',
      toolCallId: 'call-2',
      billableCalls: 0,
      answered: false,
    });

    expect(settleSearchCall).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: null,
        calls: 0,
        providerCostMicrousd: 0,
        charged: false,
        delivered: false,
        surface: null,
      }),
    );
  });

  it('releases the Free hold and records what the call actually spent', async () => {
    const spend = freeSpend(true);

    await settlePlacesSearchCall(billing({ planTier: 'free', freeTrial: spend }), {
      admission: INCLUDED_SEARCH_ADMISSION,
      providerId: 'google_places',
      toolCallId: 'call-3',
      billableCalls: 1,
      answered: true,
    });

    expect(spend.settle).toHaveBeenCalledWith(
      PUBLISHED_MICROUSD_PER_CALL,
      PUBLISHED_MICROUSD_PER_CALL,
    );
    expect(settleSearchCall).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recordSettledProviderCost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cogs-ledger-service')>();
  return { ...actual, recordSettledProviderCost };
});

import { resolveCogsCapability, resolveCogsUnits } from '@/lib/services/cogs-ledger-service';

import { PLACES_UNIT_PRICE_ENV, placesSearchCostCents } from './places-config';
import { recordPlacesSearchCost } from './places-cost';

/** 35,000 microUSD per call, rounded once over the whole batch rather than per call. */
const PUBLISHED_CENTS_PER_CALL = 4;
const PUBLISHED_CENTS_PER_FIVE_CALLS = 18;

describe('placesSearchCostCents', () => {
  const previous = process.env[PLACES_UNIT_PRICE_ENV];

  afterEach(() => {
    if (previous === undefined) delete process.env[PLACES_UNIT_PRICE_ENV];
    else process.env[PLACES_UNIT_PRICE_ENV] = previous;
  });

  it('prices a call from the published rate when nothing is configured', () => {
    delete process.env[PLACES_UNIT_PRICE_ENV];
    expect(placesSearchCostCents(1)).toBe(PUBLISHED_CENTS_PER_CALL);
    expect(placesSearchCostCents(5)).toBe(PUBLISHED_CENTS_PER_FIVE_CALLS);
  });

  it('honours a configured unit price', () => {
    process.env[PLACES_UNIT_PRICE_ENV] = '20000';
    expect(placesSearchCostCents(1)).toBe(2);
  });

  it('falls back to the published rate on an unusable override', () => {
    process.env[PLACES_UNIT_PRICE_ENV] = 'not-a-number';
    expect(placesSearchCostCents(1)).toBe(PUBLISHED_CENTS_PER_CALL);
  });

  it('prices nothing for a call that never happened', () => {
    expect(placesSearchCostCents(0)).toBe(0);
    expect(placesSearchCostCents(-1)).toBe(0);
  });
});

describe('recordPlacesSearchCost', () => {
  beforeEach(() => {
    recordSettledProviderCost.mockReset();
    recordSettledProviderCost.mockResolvedValue(undefined);
  });

  it('records the call as a per-request tool cost in the ledger', async () => {
    await recordPlacesSearchCost({
      userId: 'user_1',
      organizationId: 'org_1',
      providerId: 'google_places',
      toolCallId: 'call-1',
      calls: 1,
      delivered: true,
    });

    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    const event = recordSettledProviderCost.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event['provider']).toBe('google_places');
    expect(event['sourceRef']).toBe('places_search:call-1');
    expect(event['taskOutcome']).toBe('delivered');
    expect(event['actualCostCents']).toBe(PUBLISHED_CENTS_PER_CALL);

    const usage = event['usage'] as Record<string, unknown>;
    expect(resolveCogsCapability(usage)).toBe('tool');
    expect(resolveCogsUnits('tool', usage)).toEqual({ unitBasis: 'request', units: 1 });
  });

  it('records an undelivered outcome without throwing', async () => {
    await recordPlacesSearchCost({
      userId: 'user_1',
      providerId: 'google_places',
      toolCallId: 'call-2',
      calls: 2,
      delivered: false,
    });

    const event = recordSettledProviderCost.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event['taskOutcome']).toBe('undelivered');
    expect(resolveCogsUnits('tool', event['usage'] as Record<string, unknown>).units).toBe(2);
  });

  it('writes nothing when no call was made', async () => {
    await recordPlacesSearchCost({
      userId: 'user_1',
      providerId: 'google_places',
      toolCallId: 'call-3',
      calls: 0,
      delivered: true,
    });

    expect(recordSettledProviderCost).not.toHaveBeenCalled();
  });

  it('swallows a ledger failure rather than failing the tool call', async () => {
    recordSettledProviderCost.mockRejectedValueOnce(new Error('ledger down'));

    await expect(
      recordPlacesSearchCost({
        userId: 'user_1',
        providerId: 'google_places',
        toolCallId: 'call-4',
        calls: 1,
        delivered: true,
      }),
    ).resolves.toBeUndefined();
  });
});

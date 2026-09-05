import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recordSettledProviderCost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cogs-ledger-service')>();
  return { ...actual, recordSettledProviderCost };
});

import { resolveCogsCapability, resolveCogsUnits } from '@/lib/services/cogs-ledger-service';

import {
  GOOGLE_GROUNDING_UNIT_PRICE_ENV,
  googleGroundingCostCents,
  recordGoogleGroundingCost,
} from './grounding-cost';

/** 14,000 microUSD per call, rounded once over the whole batch rather than per call. */
const PUBLISHED_CENTS_PER_CALL = 1;
const PUBLISHED_CENTS_PER_FIVE_CALLS = 7;

describe('googleGroundingCostCents', () => {
  const previous = process.env[GOOGLE_GROUNDING_UNIT_PRICE_ENV];

  afterEach(() => {
    if (previous === undefined) delete process.env[GOOGLE_GROUNDING_UNIT_PRICE_ENV];
    else process.env[GOOGLE_GROUNDING_UNIT_PRICE_ENV] = previous;
  });

  it('prices a call from the published rate when nothing is configured', () => {
    delete process.env[GOOGLE_GROUNDING_UNIT_PRICE_ENV];
    expect(googleGroundingCostCents(1)).toBe(PUBLISHED_CENTS_PER_CALL);
    expect(googleGroundingCostCents(5)).toBe(PUBLISHED_CENTS_PER_FIVE_CALLS);
  });

  it('honours a configured unit price', () => {
    process.env[GOOGLE_GROUNDING_UNIT_PRICE_ENV] = '20000';
    expect(googleGroundingCostCents(1)).toBe(2);
  });

  it('falls back to the published rate on an unusable override', () => {
    process.env[GOOGLE_GROUNDING_UNIT_PRICE_ENV] = 'not-a-number';
    expect(googleGroundingCostCents(1)).toBe(PUBLISHED_CENTS_PER_CALL);
  });

  it('prices nothing for calls that never landed beyond the pool', () => {
    expect(googleGroundingCostCents(0)).toBe(0);
    expect(googleGroundingCostCents(-1)).toBe(0);
  });
});

describe('recordGoogleGroundingCost', () => {
  beforeEach(() => {
    recordSettledProviderCost.mockReset();
    recordSettledProviderCost.mockResolvedValue(undefined);
  });

  it('records only the billable calls as a per-request tool cost in the ledger', async () => {
    await recordGoogleGroundingCost({
      userId: 'user_1',
      organizationId: 'org_1',
      providerId: 'google',
      turnRef: 'turn-1',
      billableCalls: 1,
      delivered: true,
    });

    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    const event = recordSettledProviderCost.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event['provider']).toBe('google');
    expect(event['sourceRef']).toBe('google_grounding:turn-1');
    expect(event['taskOutcome']).toBe('delivered');
    expect(event['actualCostCents']).toBe(PUBLISHED_CENTS_PER_CALL);

    const usage = event['usage'] as Record<string, unknown>;
    expect(resolveCogsCapability(usage)).toBe('tool');
    expect(resolveCogsUnits('tool', usage)).toEqual({ unitBasis: 'request', units: 1 });
  });

  it('records an undelivered outcome without throwing', async () => {
    await recordGoogleGroundingCost({
      userId: 'user_1',
      providerId: 'google',
      turnRef: 'turn-2',
      billableCalls: 2,
      delivered: false,
    });

    const event = recordSettledProviderCost.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event['taskOutcome']).toBe('undelivered');
    expect(resolveCogsUnits('tool', event['usage'] as Record<string, unknown>).units).toBe(2);
  });

  it('writes nothing when every grounded call stayed inside the pool', async () => {
    await recordGoogleGroundingCost({
      userId: 'user_1',
      providerId: 'google',
      turnRef: 'turn-3',
      billableCalls: 0,
      delivered: true,
    });

    expect(recordSettledProviderCost).not.toHaveBeenCalled();
  });

  it('swallows a ledger failure rather than failing the turn', async () => {
    recordSettledProviderCost.mockRejectedValueOnce(new Error('ledger down'));

    await expect(
      recordGoogleGroundingCost({
        userId: 'user_1',
        providerId: 'google',
        turnRef: 'turn-4',
        billableCalls: 1,
        delivered: true,
      }),
    ).resolves.toBeUndefined();
  });
});

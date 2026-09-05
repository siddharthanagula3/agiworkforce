import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recordSettledProviderCost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/cogs-ledger-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cogs-ledger-service')>();
  return { ...actual, recordSettledProviderCost };
});

import { resolveCogsCapability, resolveCogsUnits } from '@/lib/services/cogs-ledger-service';

import {
  PERPLEXITY_SEARCH_UNIT_PRICE_ENV,
  perplexitySearchCostCents,
  recordPerplexitySearchCost,
} from './perplexity-search-cost';

/** 5,000 microUSD per call, rounded once over the whole batch rather than per call. */
const PUBLISHED_CENTS_PER_CALL = 1;
const PUBLISHED_CENTS_PER_TWO_HUNDRED_CALLS = 100;

describe('perplexitySearchCostCents', () => {
  const previous = process.env[PERPLEXITY_SEARCH_UNIT_PRICE_ENV];

  afterEach(() => {
    if (previous === undefined) delete process.env[PERPLEXITY_SEARCH_UNIT_PRICE_ENV];
    else process.env[PERPLEXITY_SEARCH_UNIT_PRICE_ENV] = previous;
  });

  it('prices a call from the published rate when nothing is configured', () => {
    delete process.env[PERPLEXITY_SEARCH_UNIT_PRICE_ENV];
    expect(perplexitySearchCostCents(1)).toBe(PUBLISHED_CENTS_PER_CALL);
    expect(perplexitySearchCostCents(200)).toBe(PUBLISHED_CENTS_PER_TWO_HUNDRED_CALLS);
  });

  it('honours a configured unit price', () => {
    process.env[PERPLEXITY_SEARCH_UNIT_PRICE_ENV] = '20000';
    expect(perplexitySearchCostCents(1)).toBe(2);
  });

  it('falls back to the published rate on an unusable override', () => {
    process.env[PERPLEXITY_SEARCH_UNIT_PRICE_ENV] = 'not-a-number';
    expect(perplexitySearchCostCents(1)).toBe(PUBLISHED_CENTS_PER_CALL);
  });

  it('prices nothing for calls that never happened', () => {
    expect(perplexitySearchCostCents(0)).toBe(0);
    expect(perplexitySearchCostCents(-1)).toBe(0);
  });
});

describe('recordPerplexitySearchCost', () => {
  beforeEach(() => {
    recordSettledProviderCost.mockReset();
    recordSettledProviderCost.mockResolvedValue(undefined);
  });

  it('records successful calls as a per-request tool cost in the ledger', async () => {
    await recordPerplexitySearchCost({
      userId: 'user_1',
      organizationId: 'org_1',
      turnRef: 'turn-1',
      calls: 1,
    });

    expect(recordSettledProviderCost).toHaveBeenCalledTimes(1);
    const event = recordSettledProviderCost.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(event['provider']).toBe('perplexity');
    expect(event['sourceRef']).toBe('perplexity_search:turn-1');
    expect(event['taskOutcome']).toBe('delivered');
    expect(event['actualCostCents']).toBe(PUBLISHED_CENTS_PER_CALL);

    const usage = event['usage'] as Record<string, unknown>;
    expect(resolveCogsCapability(usage)).toBe('tool');
    expect(resolveCogsUnits('tool', usage)).toEqual({ unitBasis: 'request', units: 1 });
  });

  it('writes nothing when no call was made', async () => {
    await recordPerplexitySearchCost({
      userId: 'user_1',
      turnRef: 'turn-2',
      calls: 0,
    });

    expect(recordSettledProviderCost).not.toHaveBeenCalled();
  });

  it('swallows a ledger failure rather than failing the search', async () => {
    recordSettledProviderCost.mockRejectedValueOnce(new Error('ledger down'));

    await expect(
      recordPerplexitySearchCost({
        userId: 'user_1',
        turnRef: 'turn-3',
        calls: 1,
      }),
    ).resolves.toBeUndefined();
  });
});

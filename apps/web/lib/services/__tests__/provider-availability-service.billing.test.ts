import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const routeHealthMocks = vi.hoisted(() => ({
  getCredentialCooldownSnapshot: vi.fn(
    async (): Promise<Readonly<Record<string, RouteHealthSnapshot>>> => ({}),
  ),
}));
vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  getCredentialCooldownSnapshot: routeHealthMocks.getCredentialCooldownSnapshot,
}));

import { healthyRouteHealthSnapshot, type RouteHealthSnapshot } from '@agiworkforce/routing';
import {
  getProviderAvailability,
  getProviderAvailabilityMap,
  markProviderDegraded,
} from '@/lib/services/provider-availability-service';

/**
 * An unfunded upstream account was classified correctly and described correctly
 * and then forgotten: nothing recorded it, so the catalogue kept presenting the
 * provider as ready and every turn paid a round trip to rediscover it. These
 * pin the recording, which is what the catalogue reads.
 */
describe('provider availability · billing exhausted', () => {
  let now = 0;

  beforeEach(() => {
    now += 60 * 60 * 1000;
  });

  it('records an unfunded provider as degraded', async () => {
    markProviderDegraded('anthropic-billing-a', 'billing_exhausted', now);

    const signal = await getProviderAvailability('anthropic-billing-a', now + 1_000);
    expect(signal?.state).toBe('degraded');
  });

  it('says temporarily unavailable, never anything about our balance', async () => {
    markProviderDegraded('anthropic-billing-b', 'billing_exhausted', now);

    const signal = await getProviderAvailability('anthropic-billing-b', now + 1_000);
    expect(signal?.reason).toBe('This provider is temporarily unavailable.');
    expect(signal?.reason.toLowerCase()).not.toContain('credit');
    expect(signal?.reason.toLowerCase()).not.toContain('balance');
    expect(signal?.reason.toLowerCase()).not.toContain('billing');
  });

  it('recovers on its own rather than needing a deploy', async () => {
    markProviderDegraded('anthropic-billing-c', 'billing_exhausted', now);

    expect(await getProviderAvailability('anthropic-billing-c', now + 1_000)).not.toBeNull();
    expect(await getProviderAvailability('anthropic-billing-c', now + 6 * 60 * 1000)).toBeNull();
  });

  it('leaves every other provider alone', async () => {
    markProviderDegraded('anthropic-billing-d', 'billing_exhausted', now);

    expect(await getProviderAvailability('openai', now + 1_000)).toBeNull();
  });
});

/**
 * The mark above lasts five minutes; the dispatcher refuses every route on an
 * unfunded credential for its own, longer cooldown window. Between the two the
 * picker offered a model whose next turn was refused before any provider call.
 * The map reads the dispatcher's fact so both surfaces answer the same way.
 */
describe('provider availability · the credential the dispatcher recorded as unfunded', () => {
  const now = 10 * 60 * 60 * 1000;

  it('withholds the provider for as long as the dispatcher would', async () => {
    routeHealthMocks.getCredentialCooldownSnapshot.mockResolvedValueOnce({
      'anthropic-unfunded-a': { ...healthyRouteHealthSnapshot(), unfunded: true },
      openai: healthyRouteHealthSnapshot(),
    });

    const map = await getProviderAvailabilityMap(['anthropic-unfunded-a', 'openai'], now);

    expect(map['anthropic-unfunded-a']).toMatchObject({
      state: 'degraded',
      reason: 'This provider is temporarily unavailable.',
    });
    expect(Date.parse(map['anthropic-unfunded-a']?.until ?? '')).toBeGreaterThan(now);
    expect(map['openai']).toBeUndefined();
    expect(routeHealthMocks.getCredentialCooldownSnapshot).toHaveBeenCalledWith(
      ['anthropic-unfunded-a', 'openai'],
      now,
    );
  });

  it('offers the provider again once the dispatcher would try it again', async () => {
    routeHealthMocks.getCredentialCooldownSnapshot.mockResolvedValueOnce({
      'anthropic-unfunded-b': healthyRouteHealthSnapshot(),
    });

    expect(await getProviderAvailabilityMap(['anthropic-unfunded-b'], now)).toEqual({});
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: () => null }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import {
  getProviderAvailability,
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

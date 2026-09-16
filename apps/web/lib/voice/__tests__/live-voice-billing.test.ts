import { describe, expect, it } from 'vitest';

import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';

import {
  describeLiveSessionFailure,
  LIVE_SESSION_CENTS_PER_MINUTE,
  liveSessionCostCents,
  liveSessionProviderCostCents,
} from '../live-voice-billing';

const LIVE_SLOT = 'voice_live';
const SECONDS_PER_MINUTE = 60;
const CENTS_PER_USD = 100;

const liveModelId = getRoutingSlotModel(LIVE_SLOT);

describe('live voice session pricing', () => {
  it('charges the user the product per-minute rate, billed per second', () => {
    expect(liveSessionCostCents(SECONDS_PER_MINUTE)).toBe(LIVE_SESSION_CENTS_PER_MINUTE);
    expect(liveSessionCostCents(90)).toBe(Math.ceil(1.5 * LIVE_SESSION_CENTS_PER_MINUTE));
    expect(liveSessionCostCents(0)).toBe(0);
  });

  it('prices the provider side from the session rate the catalog declares', () => {
    const usdPerMinute = getModelMetadataById(liveModelId)?.sessionPerMinuteCost;
    expect(usdPerMinute).toBeGreaterThan(0);

    expect(liveSessionProviderCostCents(600, liveModelId)).toBe(
      Math.ceil((600 / SECONDS_PER_MINUTE) * (usdPerMinute as number) * CENTS_PER_USD),
    );
    expect(liveSessionProviderCostCents(1, liveModelId)).toBe(1);
  });

  it('reports no provider cost when the model declares no session rate', () => {
    expect(liveSessionProviderCostCents(600, null)).toBeNull();
    expect(liveSessionProviderCostCents(0, liveModelId)).toBeNull();
  });

  it('reads the customer charge and the provider rate from different sources', () => {
    const usdPerMinute = getModelMetadataById(liveModelId)?.sessionPerMinuteCost as number;

    expect(liveSessionCostCents(SECONDS_PER_MINUTE)).toBe(LIVE_SESSION_CENTS_PER_MINUTE);
    expect(liveSessionProviderCostCents(SECONDS_PER_MINUTE, liveModelId)).toBe(
      Math.ceil(usdPerMinute * CENTS_PER_USD),
    );

    // The two rates are equal today. Only these assertions keep them from being
    // re-coupled: the customer charge survives a model that publishes no
    // session rate, and the provider cost does not fall back to the constant.
    expect(liveSessionCostCents(SECONDS_PER_MINUTE)).toBe(LIVE_SESSION_CENTS_PER_MINUTE);
    expect(liveSessionProviderCostCents(SECONDS_PER_MINUTE, null)).toBeNull();
  });
});

describe('live voice session failures', () => {
  it('reports a provider account out of credit as unavailable rather than busy', () => {
    for (const code of ['credit_balance_exhausted', 'insufficient_quota']) {
      expect(describeLiveSessionFailure(429, code)).toEqual({
        status: 503,
        code: 'live_voice_unavailable',
        message: 'Live voice is unavailable right now.',
      });
    }
  });

  it('keeps a plain rate limit on the busy message', () => {
    expect(describeLiveSessionFailure(429, 'rate_limit_exceeded')).toMatchObject({
      status: 429,
      code: 'live_voice_busy',
    });
  });
});

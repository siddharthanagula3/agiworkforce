import { describe, expect, it } from 'vitest';

import {
  chargeMicrousdForProviderCost,
  getModelMetadataById,
  getRoutingSlotModel,
  MICROUSD_PER_USD,
} from '@agiworkforce/types';

import {
  describeLiveSessionFailure,
  LIVE_SESSION_BLOCK_MINUTES,
  LIVE_SESSION_CEILING_SECONDS,
  liveSessionChargeMicrousd,
  liveSessionProviderCostMicrousd,
} from '../live-voice-billing';

const LIVE_SLOT = 'voice_live';
const SECONDS_PER_MINUTE = 60;

const liveModelId = getRoutingSlotModel(LIVE_SLOT);
const usdPerMinute = getModelMetadataById(liveModelId)?.sessionPerMinuteCost as number;

function providerMicrousd(seconds: number): number {
  return Math.ceil((seconds / SECONDS_PER_MINUTE) * usdPerMinute * MICROUSD_PER_USD);
}

describe('live voice session pricing', () => {
  it('prices the provider side from the session rate the catalog declares', () => {
    expect(usdPerMinute).toBeGreaterThan(0);
    expect(liveSessionProviderCostMicrousd(600, liveModelId)).toBe(providerMicrousd(600));
    expect(liveSessionProviderCostMicrousd(1, liveModelId)).toBe(providerMicrousd(1));
    expect(liveSessionProviderCostMicrousd(0, liveModelId)).toBe(0);
  });

  it('charges the user that provider cost, billed per second and rounded up to a hundredth of a credit', () => {
    expect(liveSessionChargeMicrousd(SECONDS_PER_MINUTE, liveModelId)).toBe(
      chargeMicrousdForProviderCost(providerMicrousd(SECONDS_PER_MINUTE)),
    );
    expect(liveSessionChargeMicrousd(90, liveModelId)).toBe(
      chargeMicrousdForProviderCost(providerMicrousd(90)),
    );
    expect(liveSessionChargeMicrousd(0, liveModelId)).toBe(0);
    expect(liveSessionChargeMicrousd(1, liveModelId)).toBeGreaterThanOrEqual(
      liveSessionProviderCostMicrousd(1, liveModelId) as number,
    );
  });

  it('prices nothing for a model that declares no session rate', () => {
    expect(liveSessionProviderCostMicrousd(600, null)).toBeNull();
    expect(liveSessionChargeMicrousd(600, null)).toBeNull();
    expect(liveSessionChargeMicrousd(600, 'not-a-registered-model')).toBeNull();
  });

  it('sizes a full block at the ceiling', () => {
    expect(LIVE_SESSION_CEILING_SECONDS).toBe(LIVE_SESSION_BLOCK_MINUTES * SECONDS_PER_MINUTE);
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

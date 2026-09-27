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
  LIVE_SESSION_MIN_BLOCK_SECONDS,
  liveSessionChargeMicrousd,
  liveSessionMinutes,
  liveSessionProviderCostMicrousd,
  liveSessionSecondsCoveredBy,
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

  it('sizes a full block at the ceiling and never below a minute', () => {
    expect(LIVE_SESSION_CEILING_SECONDS).toBe(LIVE_SESSION_BLOCK_MINUTES * SECONDS_PER_MINUTE);
    expect(LIVE_SESSION_MIN_BLOCK_SECONDS).toBe(SECONDS_PER_MINUTE);
  });

  it('counts the minute allowance in whole minutes, rounded up', () => {
    expect(liveSessionMinutes(0)).toBe(0);
    expect(liveSessionMinutes(-30)).toBe(0);
    expect(liveSessionMinutes(1)).toBe(1);
    expect(liveSessionMinutes(60)).toBe(1);
    expect(liveSessionMinutes(61)).toBe(2);
  });
});

describe('liveSessionSecondsCoveredBy', () => {
  const charge = (seconds: number) => liveSessionChargeMicrousd(seconds, liveModelId) as number;

  it('covers every second an amount pays for and not one more', () => {
    for (const amount of [
      charge(1),
      charge(1) + 1,
      charge(59),
      charge(SECONDS_PER_MINUTE),
      charge(SECONDS_PER_MINUTE) - 1,
      charge(LIVE_SESSION_CEILING_SECONDS),
      123_457,
    ]) {
      const seconds = liveSessionSecondsCoveredBy(amount, liveModelId);
      expect(seconds).toBeGreaterThan(0);
      expect(charge(seconds)).toBeLessThanOrEqual(amount);
      expect(charge(seconds + 1)).toBeGreaterThan(amount);
    }
  });

  it('covers the whole ceiling with the charge for the whole ceiling', () => {
    expect(liveSessionSecondsCoveredBy(charge(LIVE_SESSION_CEILING_SECONDS), liveModelId)).toBe(
      LIVE_SESSION_CEILING_SECONDS,
    );
  });

  it('covers nothing for an amount below one second, a non-positive amount, or an unpriced model', () => {
    expect(liveSessionSecondsCoveredBy(charge(1) - 1, liveModelId)).toBe(0);
    expect(liveSessionSecondsCoveredBy(0, liveModelId)).toBe(0);
    expect(liveSessionSecondsCoveredBy(-5_000, liveModelId)).toBe(0);
    expect(liveSessionSecondsCoveredBy(Number.POSITIVE_INFINITY, liveModelId)).toBe(0);
    expect(liveSessionSecondsCoveredBy(1_000_000, null)).toBe(0);
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

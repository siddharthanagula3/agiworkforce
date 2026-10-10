import { describe, expect, it } from 'vitest';

import {
  chargeMicrousdForProviderCost,
  getModelMetadataById,
  getRoutingSlotModel,
  MICROUSD_PER_USD,
} from '@agiworkforce/types';

import {
  describeLiveSessionFailure,
  LIVE_VOICE_BLOCK_SECONDS,
  LIVE_VOICE_LEASE_SECONDS,
  liveSessionChargeMicrousd,
  liveSessionProviderCostMicrousd,
  liveVoiceBackendAllowanceMicrousd,
  liveVoiceBlockChargeMicrousd,
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

  it('reserves voice a minute at a time and treats a silent session as gone after ten', () => {
    expect(LIVE_VOICE_BLOCK_SECONDS).toBe(SECONDS_PER_MINUTE);
    expect(LIVE_VOICE_LEASE_SECONDS).toBe(10 * SECONDS_PER_MINUTE);
  });
});

describe('the price of one voice block', () => {
  const paidBackend = getRoutingSlotModel('voice_live_backend');
  const freeBackend = getRoutingSlotModel('voice_live_backend_free');

  it('is the live model minute plus a backend allowance at the backend model rates', () => {
    const backend = getModelMetadataById(paidBackend)!;
    const allowance = liveVoiceBackendAllowanceMicrousd(LIVE_VOICE_BLOCK_SECONDS, paidBackend);
    expect(allowance).toBe(
      Math.ceil(
        ((6_000 * backend.inputCost + 300 * backend.outputCost) / 1_000_000) * MICROUSD_PER_USD,
      ),
    );
    expect(liveVoiceBlockChargeMicrousd(liveModelId, paidBackend)).toBe(
      chargeMicrousdForProviderCost(providerMicrousd(SECONDS_PER_MINUTE) + allowance),
    );
  });

  it('costs less on the cheaper free backend, and cannot be priced without a session rate', () => {
    expect(liveVoiceBlockChargeMicrousd(liveModelId, freeBackend)).toBeLessThan(
      liveVoiceBlockChargeMicrousd(liveModelId, paidBackend)!,
    );
    expect(liveVoiceBlockChargeMicrousd(null, paidBackend)).toBeNull();
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

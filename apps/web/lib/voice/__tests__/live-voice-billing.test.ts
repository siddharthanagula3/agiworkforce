import { describe, expect, it } from 'vitest';

import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';

import {
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

  it('keeps the provider rate and the customer charge independently sourced', () => {
    const providerCents = liveSessionProviderCostCents(600, liveModelId);
    const customerCents = liveSessionCostCents(600);

    expect(providerCents).not.toBeNull();
    expect(customerCents).toBe(10 * LIVE_SESSION_CENTS_PER_MINUTE);
    expect(providerCents).toBeLessThanOrEqual(customerCents);
  });
});

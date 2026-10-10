import { describe, expect, it } from 'vitest';

import { estimateVoiceMinutes, parseAccountUsageLimitsResponse } from '../account-usage-wire';

describe('estimateVoiceMinutes', () => {
  it('counts whole minutes the tightest remaining window buys', () => {
    expect(estimateVoiceMinutes([20, 300, 1_600], 13)).toBe(1);
    expect(estimateVoiceMinutes([300, 39, 1_600], 13)).toBe(3);
  });

  it('reports no minutes for a spent window and no estimate without a price', () => {
    expect(estimateVoiceMinutes([0, 300], 13)).toBe(0);
    expect(estimateVoiceMinutes([300], null)).toBeNull();
    expect(estimateVoiceMinutes([300], 0)).toBeNull();
    expect(estimateVoiceMinutes([], 13)).toBeNull();
  });
});

describe('parseAccountUsageLimitsResponse voice price', () => {
  const base = {
    planTier: 'pro',
    periodStart: '2026-10-01T00:00:00.000Z',
    resetAt: '2026-11-01T00:00:00.000Z',
    units: [],
    images: { images: 0 },
  };

  it('keeps a positive price per minute and drops anything else', () => {
    expect(
      parseAccountUsageLimitsResponse({ ...base, voiceMinuteCredits: 13.05 })?.voiceMinuteCredits,
    ).toBe(13.05);
    expect(
      parseAccountUsageLimitsResponse({ ...base, voiceMinuteCredits: 0 })?.voiceMinuteCredits,
    ).toBeNull();
    expect(parseAccountUsageLimitsResponse(base)?.voiceMinuteCredits).toBeNull();
  });
});

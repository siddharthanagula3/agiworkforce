import { describe, expect, it } from 'vitest';

import {
  CANARY_CHANNEL,
  FEATURE_MATURITIES,
  RELEASE_AVAILABILITIES,
  RELEASE_CHANNELS,
  channelCarriesMaturity,
  maturityAdmitsAvailability,
  maturityWidestAvailability,
  surfaceReleaseStateGaps,
  type SurfaceReleaseState,
} from '../model-catalog';

const MOBILE: SurfaceReleaseState = {
  surface: 'mobile',
  released: false,
  maturity: 'experimental',
  channel: 'nightly',
  availability: 'unavailable',
};

describe('feature maturity, release channel and availability', () => {
  it('names general availability rather than implying it', () => {
    expect(FEATURE_MATURITIES).toContain('general_availability');
    expect(RELEASE_CHANNELS).toContain(CANARY_CHANNEL);
    expect(RELEASE_AVAILABILITIES).toContain('internal');
  });

  it('keeps an unfinished feature out of a channel wider than it has earned', () => {
    expect(channelCarriesMaturity('nightly', 'experimental')).toBe(true);
    expect(channelCarriesMaturity('beta', 'experimental')).toBe(false);
    expect(channelCarriesMaturity('stable', 'general_availability')).toBe(true);
  });

  it('bounds availability by maturity', () => {
    expect(maturityWidestAvailability('experimental')).toBe('internal');
    expect(maturityAdmitsAvailability('beta', 'limited')).toBe(true);
    expect(maturityAdmitsAvailability('beta', 'general')).toBe(false);
    expect(maturityAdmitsAvailability('general_availability', 'general')).toBe(true);
  });

  it('reads the three facts separately and names each contradiction', () => {
    expect(surfaceReleaseStateGaps(MOBILE)).toEqual([]);
    expect(surfaceReleaseStateGaps({ ...MOBILE, channel: 'stable' })).toEqual([
      expect.stringContaining('stable channel'),
    ]);
    expect(
      surfaceReleaseStateGaps({
        ...MOBILE,
        maturity: 'general_availability',
        channel: 'stable',
        availability: 'general',
      }),
    ).toEqual([expect.stringContaining('published no release')]);
  });
});

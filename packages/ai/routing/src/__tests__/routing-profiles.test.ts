import { describe, expect, it } from 'vitest';

import { TASK_FAMILIES } from '../task-family';
import {
  ROUTING_PROFILES,
  ROUTING_PROFILE_IDS,
  isRoutingProfileId,
  profileForTaskFamily,
  routingProfileByName,
  weightedScore,
  type RoutingCandidateMeasurements,
} from '../profiles';

const MEASUREMENTS: RoutingCandidateMeasurements = {
  qualityBand: 1,
  expectedMicroUsd: 400,
  dearestMicroUsd: 500,
  latencyP50Ms: 900,
  slowestP50Ms: 1000,
};

describe('the four named profiles', () => {
  it('selects Research by name and weighs it differently from Instant', () => {
    const research = routingProfileByName('Research');
    const instant = routingProfileByName('Instant');

    expect(research?.id).toBe('research');
    expect(instant?.id).toBe('instant');
    expect(research?.weights).not.toEqual(instant?.weights);
    expect(research!.weights.quality).toBeGreaterThan(instant!.weights.quality);
    expect(instant!.weights.latency).toBeGreaterThan(research!.weights.latency);
  });

  it('answers to the id as well as the display name, and to nothing else', () => {
    expect(routingProfileByName('code')?.id).toBe('code');
    expect(routingProfileByName('  high  ')?.id).toBe('high');
    expect(routingProfileByName('frontier')).toBeNull();
    expect(isRoutingProfileId('instant')).toBe(true);
    expect(isRoutingProfileId('Instant')).toBe(false);
  });

  it('gives every profile its own weight set, each a share of one decision', () => {
    for (const id of ROUTING_PROFILE_IDS) {
      const { weights } = ROUTING_PROFILES[id];
      expect(weights.quality + weights.cost + weights.latency).toBeCloseTo(1, 10);
      for (const weight of Object.values(weights)) {
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThan(1);
      }
    }
    const sets = ROUTING_PROFILE_IDS.map((id) => JSON.stringify(ROUTING_PROFILES[id].weights));
    expect(new Set(sets).size).toBe(ROUTING_PROFILE_IDS.length);
  });
});

describe('every classified request has a profile', () => {
  it('maps each task family to exactly one profile', () => {
    const claimed = ROUTING_PROFILE_IDS.flatMap((id) => [...ROUTING_PROFILES[id].taskFamilies]);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect([...claimed].sort()).toEqual([...TASK_FAMILIES].sort());
  });

  it('routes the families the profiles were named after', () => {
    expect(profileForTaskFamily('simple_chat')?.id).toBe('instant');
    expect(profileForTaskFamily('extended_thinking')?.id).toBe('high');
    expect(profileForTaskFamily('code_execution')?.id).toBe('code');
    expect(profileForTaskFamily('deep_research')?.id).toBe('research');
  });
});

describe('weightedScore', () => {
  it('scores the same candidate differently under different profiles', () => {
    const cheapAndFast: RoutingCandidateMeasurements = {
      qualityBand: 0,
      expectedMicroUsd: 0,
      dearestMicroUsd: 500,
      latencyP50Ms: 0,
      slowestP50Ms: 1000,
    };
    const slowAndBest: RoutingCandidateMeasurements = {
      qualityBand: 1,
      expectedMicroUsd: 500,
      dearestMicroUsd: 500,
      latencyP50Ms: 1000,
      slowestP50Ms: 1000,
    };
    const instant = ROUTING_PROFILES.instant;
    const high = ROUTING_PROFILES.high;

    expect(weightedScore(instant, cheapAndFast)).toBeGreaterThan(
      weightedScore(instant, slowAndBest),
    );
    expect(weightedScore(high, slowAndBest)).toBeGreaterThan(weightedScore(high, cheapAndFast));
  });

  it('counts a missing measurement as nothing rather than guessing one', () => {
    const unpriced = { ...MEASUREMENTS, expectedMicroUsd: null, dearestMicroUsd: null };
    const profile = ROUTING_PROFILES.code;
    expect(weightedScore(profile, unpriced)).toBeLessThan(weightedScore(profile, MEASUREMENTS));
    expect(weightedScore(profile, unpriced)).toBeCloseTo(
      profile.weights.quality + profile.weights.latency * 0.1,
      10,
    );
  });

  it('clamps a measurement outside its range instead of scoring above one', () => {
    const profile = ROUTING_PROFILES.high;
    const impossible = { ...MEASUREMENTS, qualityBand: 4, expectedMicroUsd: -100 };
    expect(weightedScore(profile, impossible)).toBeLessThanOrEqual(1);
  });
});

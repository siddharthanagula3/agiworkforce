import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  FREE_LANE_MODES,
  freeLaneDispatches,
  freeLaneModeFor,
  freeLaneObserves,
  freeLaneStrandsWhenUnavailable,
  parseFreeLaneMode,
  type FreeLaneMode,
} from './mode';

describe('parseFreeLaneMode', () => {
  it('accepts every declared mode', () => {
    for (const mode of Object.values(FREE_LANE_MODES)) {
      expect(parseFreeLaneMode(mode)).toBe(mode);
    }
  });

  it('normalises case and surrounding whitespace', () => {
    expect(parseFreeLaneMode('  STRICT ')).toBe(FREE_LANE_MODES.strict);
    expect(parseFreeLaneMode('Shadow')).toBe(FREE_LANE_MODES.shadow);
  });

  it.each([undefined, null, '', '   '])('defaults to off for %p', (raw) => {
    expect(parseFreeLaneMode(raw)).toBe(FREE_LANE_MODES.off);
  });

  it('falls back to off rather than throwing on an unrecognised value', () => {
    expect(parseFreeLaneMode('enabled')).toBe(FREE_LANE_MODES.off);
    expect(parseFreeLaneMode('1')).toBe(FREE_LANE_MODES.off);
  });

  it('does not treat an inherited Object property as a mode', () => {
    expect(parseFreeLaneMode('constructor')).toBe(FREE_LANE_MODES.off);
    expect(parseFreeLaneMode('toString')).toBe(FREE_LANE_MODES.off);
  });
});

describe('freeLaneModeFor', () => {
  it.each(Object.values(FREE_LANE_MODES))('forces %s to off outside the population', (mode) => {
    expect(freeLaneModeFor(mode, false)).toBe(FREE_LANE_MODES.off);
  });

  it.each(Object.values(FREE_LANE_MODES))('passes %s through for a free plan', (mode) => {
    expect(freeLaneModeFor(mode, true)).toBe(mode);
  });
});

describe('mode predicates', () => {
  const expectations: ReadonlyArray<{
    mode: FreeLaneMode;
    observes: boolean;
    dispatches: boolean;
    strands: boolean;
  }> = [
    { mode: FREE_LANE_MODES.off, observes: false, dispatches: false, strands: false },
    { mode: FREE_LANE_MODES.shadow, observes: true, dispatches: false, strands: false },
    { mode: FREE_LANE_MODES.prefer, observes: true, dispatches: true, strands: false },
    { mode: FREE_LANE_MODES.strict, observes: true, dispatches: true, strands: true },
  ];

  it.each(expectations)('$mode', ({ mode, observes, dispatches, strands }) => {
    expect(freeLaneObserves(mode)).toBe(observes);
    expect(freeLaneDispatches(mode)).toBe(dispatches);
    expect(freeLaneStrandsWhenUnavailable(mode)).toBe(strands);
  });

  it('only strict may strand, and only the dispatching modes may serve', () => {
    const strandingModes = expectations.filter((entry) => entry.strands).map((entry) => entry.mode);
    expect(strandingModes).toEqual([FREE_LANE_MODES.strict]);
    for (const entry of expectations) {
      if (entry.strands) expect(entry.dispatches).toBe(true);
      if (entry.dispatches) expect(entry.observes).toBe(true);
    }
  });
});

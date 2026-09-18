import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/data-region', () => ({ managedCloudDataRegion: () => 'us-east-1' }));

const store = vi.hoisted(() => ({ definitions: [] as unknown[], overrides: [] as unknown[] }));

vi.mock('../flag-store', () => ({
  getActiveFlagDefinitions: async () => store.definitions,
  getSubjectOverrides: async () => store.overrides,
}));

import { evaluateFlags, type FlagSubject } from '../evaluate-flags';
import { FlagDefinitionInputSchema, type FlagDefinition } from '../flag-definition';
import { readRolloutGate } from '../rollout-gate';
import {
  RELEASE_CHANNELS,
  activeRolloutRings,
  parseRolloutRingFlagKey,
  plannedPercentage,
  ringIncluded,
  rolloutRingBlockers,
  rolloutRingDefinition,
  rolloutRingFlagKey,
  type RolloutRing,
  type RolloutRingPlan,
} from '../rollout-rings';

const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-09-18T12:00:00.000Z');

const DESKTOP_RING: RolloutRing = {
  id: 'voice_mode',
  surface: 'desktop',
  channel: 'beta',
  description: 'voice mode on the desktop beta channel',
};

const MOBILE_RING: RolloutRing = {
  id: 'voice_mode',
  surface: 'mobile',
  channel: 'stable',
  description: 'voice mode on the mobile stable channel',
};

function plan(patch: Partial<RolloutRingPlan> = {}): RolloutRingPlan {
  return { percentage: 0, ramp: null, pausedAt: null, storeApproval: null, ...patch };
}

function definitionFor(
  ring: RolloutRing,
  ringPlan: RolloutRingPlan,
  nowMs: number = NOW,
): FlagDefinition {
  return {
    ...FlagDefinitionInputSchema.parse(rolloutRingDefinition(ring, ringPlan, nowMs)),
    version: 1,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
  };
}

function subject(patch: Partial<FlagSubject> = {}): FlagSubject {
  return {
    userId: 'user_1',
    workspaceId: WORKSPACE_ID,
    role: 'member',
    plan: 'pro',
    region: 'us-east-1',
    country: 'US',
    surface: 'desktop',
    clientVersion: '2.4.1',
    ...patch,
  };
}

function reachOf(ring: RolloutRing, ringPlan: RolloutRingPlan, nowMs = NOW): number {
  const definitions = [definitionFor(ring, ringPlan, nowMs)];
  let included = 0;
  const population = 400;
  for (let index = 0; index < population; index += 1) {
    const evaluations = evaluateFlags(
      definitions,
      subject({ userId: `user_${index}`, surface: ring.surface }),
      [],
      nowMs,
    );
    if (ringIncluded(evaluations, ring)) included += 1;
  }
  return (included / population) * 100;
}

describe('rollout ring keys', () => {
  it('round-trips a key for every channel and refuses anything else', () => {
    for (const channel of RELEASE_CHANNELS) {
      const ring = { ...DESKTOP_RING, channel };
      expect(parseRolloutRingFlagKey(rolloutRingFlagKey(ring))).toEqual({
        surface: 'desktop',
        channel,
        id: 'voice_mode',
      });
    }
    expect(rolloutRingFlagKey(DESKTOP_RING)).toBe('rollout.desktop.beta.voice_mode');
    expect(parseRolloutRingFlagKey('rollout.desktop.experimental.voice_mode')).toBeNull();
    expect(parseRolloutRingFlagKey('capability.work')).toBeNull();
  });

  it('produces a definition the flag schema accepts, closed by default', () => {
    const parsed = FlagDefinitionInputSchema.parse(rolloutRingDefinition(DESKTOP_RING, plan()));
    expect(parsed.defaultVariant).toBe('off');
    expect(parsed.killSwitch).toBe(false);
    expect(parsed.rules).toHaveLength(1);
  });
});

describe('a ring that reaches part of a surface', () => {
  it('admits about the planned share of one surface and nobody on another', () => {
    const reach = reachOf(DESKTOP_RING, plan({ percentage: 25 }));
    expect(reach).toBeGreaterThan(15);
    expect(reach).toBeLessThan(35);

    const definitions = [definitionFor(DESKTOP_RING, plan({ percentage: 100 }))];
    const elsewhere = evaluateFlags(definitions, subject({ surface: 'mobile' }), [], NOW);
    expect(ringIncluded(elsewhere, DESKTOP_RING)).toBe(false);
  });

  it('never admits anyone while no ring flag exists', () => {
    expect(ringIncluded({}, DESKTOP_RING)).toBe(false);
  });
});

describe('pausing a ring', () => {
  const ramp = {
    fromPercentage: 0,
    toPercentage: 100,
    startAt: '2026-09-18T00:00:00.000Z',
    endAt: '2026-09-20T00:00:00.000Z',
  };
  const paused = plan({ ramp, pausedAt: '2026-09-18T12:00:00.000Z' });

  it('holds the reach the ramp had reached instead of advancing', () => {
    expect(plannedPercentage(plan({ ramp }), NOW)).toBeCloseTo(25, 5);
    const later = Date.parse('2026-09-19T12:00:00.000Z');
    expect(plannedPercentage(plan({ ramp }), later)).toBeCloseTo(75, 5);
    expect(plannedPercentage(paused, later)).toBeCloseTo(25, 5);
  });

  it('keeps the people it already had, which setting the percentage to zero does not', () => {
    const definitions = [definitionFor(DESKTOP_RING, plan({ ramp }), NOW)];
    const admitted = Array.from({ length: 400 }, (unused, index) => `user_${index}`).filter(
      (userId) =>
        ringIncluded(
          evaluateFlags(definitions, subject({ userId, surface: 'desktop' }), [], NOW),
          DESKTOP_RING,
        ),
    );
    expect(admitted.length).toBeGreaterThan(0);

    const held = [definitionFor(DESKTOP_RING, paused, NOW)];
    const stopped = [definitionFor(DESKTOP_RING, plan({ percentage: 0 }), NOW)];
    const later = Date.parse('2026-09-19T12:00:00.000Z');
    for (const userId of admitted) {
      const context = subject({ userId, surface: 'desktop' });
      expect(ringIncluded(evaluateFlags(held, context, [], later), DESKTOP_RING)).toBe(true);
      expect(ringIncluded(evaluateFlags(stopped, context, [], later), DESKTOP_RING)).toBe(false);
    }
  });

  it('reads back as paused, and a live ramp does not', () => {
    const later = Date.parse('2026-09-19T12:00:00.000Z');
    const [heldState] = activeRolloutRings([definitionFor(DESKTOP_RING, paused, NOW)], later);
    expect(heldState).toMatchObject({ included: true, paused: true, surface: 'desktop' });
    expect(heldState?.percentage).toBeCloseTo(25, 5);

    const [rampingState] = activeRolloutRings(
      [definitionFor(DESKTOP_RING, plan({ ramp }), NOW)],
      later,
    );
    expect(rampingState).toMatchObject({ included: true, paused: false });

    expect(
      activeRolloutRings([definitionFor(DESKTOP_RING, plan({ percentage: 100 }))], NOW),
    ).toEqual([expect.objectContaining({ included: true, paused: false, percentage: 100 })]);
  });
});

describe('a ring on a surface a store has to approve', () => {
  it('refuses to reach anyone before the store has said yes', () => {
    expect(rolloutRingBlockers(MOBILE_RING, plan({ percentage: 0 }), NOW)).toEqual([]);
    expect(
      rolloutRingBlockers(MOBILE_RING, plan({ percentage: 5, storeApproval: 'approved' }), NOW),
    ).toEqual([]);
    expect(
      rolloutRingBlockers(MOBILE_RING, plan({ percentage: 5, storeApproval: 'in_review' }), NOW),
    ).toHaveLength(1);
    expect(() =>
      rolloutRingDefinition(MOBILE_RING, plan({ percentage: 100, storeApproval: null }), NOW),
    ).toThrow(/store approval state/u);
  });

  it('refuses a ramp whose end claims reach the store has not granted', () => {
    const ramp = {
      fromPercentage: 0,
      toPercentage: 100,
      startAt: '2026-09-18T00:00:00.000Z',
      endAt: '2026-09-20T00:00:00.000Z',
    };
    expect(() =>
      rolloutRingDefinition(MOBILE_RING, plan({ ramp, storeApproval: 'in_review' }), NOW),
    ).toThrow(/while the store submission is in_review/u);
  });

  it('leaves a surface nobody reviews alone', () => {
    expect(rolloutRingBlockers(DESKTOP_RING, plan({ percentage: 100 }), NOW)).toEqual([]);
  });
});

describe('the per-request gate', () => {
  it('reports only the rings this surface and channel are inside', async () => {
    store.definitions = [
      definitionFor(DESKTOP_RING, plan({ percentage: 100 })),
      definitionFor({ ...DESKTOP_RING, id: 'held_back' }, plan({ percentage: 0 })),
      definitionFor(
        { ...DESKTOP_RING, channel: 'stable', id: 'other_channel' },
        plan({ percentage: 100 }),
      ),
    ];
    store.overrides = [];

    const gate = await readRolloutGate(subject({ surface: 'desktop' }), NOW);
    expect(gate.ringOpen(DESKTOP_RING)).toBe(true);
    expect(gate.ringOpen({ ...DESKTOP_RING, id: 'held_back' })).toBe(false);
    expect(gate.openRingIds('desktop', 'beta')).toEqual(['voice_mode']);
    expect(gate.openRingIds('desktop', 'stable')).toEqual(['other_channel']);
  });

  it('opens nothing when the flag store answers with no definitions', async () => {
    store.definitions = [];
    store.overrides = [];
    const gate = await readRolloutGate(subject(), NOW);
    expect(gate.ringOpen(DESKTOP_RING)).toBe(false);
    expect(gate.openRingIds('desktop', 'beta')).toEqual([]);
  });
});

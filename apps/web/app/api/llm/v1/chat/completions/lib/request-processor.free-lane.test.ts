import { describe, expect, it } from 'vitest';
import { getRoutingSlotModel, type RoutingSlot } from '@agiworkforce/types';
import type { RoutingTaskType } from '@agiworkforce/routing';

import { resolveWebCloudModelRoute } from './request-processor';
import {
  FREE_LANE_SELECTION,
  activateFreeLane,
  freeLanePreferredSlots,
} from '@/lib/services/free-lane/stage';
import { FREE_LANE_MODES } from '@/lib/services/free-lane/mode';
import { routesOf } from '@/lib/services/free-lane/plan';
import { isFreePlanTier } from '@/lib/services/free-trial-service';

const FREE_SLOTS = [
  'free_workhorse',
  'free_workhorse_fast',
] as const satisfies readonly RoutingSlot[];

/**
 * Every slot a pool record claims, verified or not. The Model Studio
 * allocations claim the reasoning slots and stay unverified until the founder
 * records the review, so the lane looks at those slots and refuses their
 * routes as `not_verified_free`; only the FREE_SLOTS models may be served.
 */
const POOL_CLAIMED_SLOTS = [
  ...FREE_SLOTS,
  'reasoning_balanced',
  'reasoning_economy',
  'reasoning_premium',
] as const satisfies readonly RoutingSlot[];

/**
 * Every plan tier `resolveAutoRoute` folds into the `free` ceiling.
 *
 * `normalizeTier` (auto.ts) maps `basic` and `hobby` onto `free`, and its
 * default branch sends every unrecognised or absent tier there too. `basic` is
 * a paying plan, so this set is NOT "the free plan", which is why the lane
 * gates on `isFreePlanTier` (exact `free`) and not on the resolver's tier.
 */
const TIERS_FOLDED_INTO_FREE = ['basic', 'hobby', 'something-unknown', undefined] as const;
const PAID_TIERS = ['pro', 'team', 'max', 'max_15x', 'enterprise', 'byok'] as const;

const TASKS = [
  'simple_chat',
  'general',
  'coding',
  'reasoning',
  'creative_writing',
  'multimodal',
  'long_context',
  'research',
  'agentic',
] as const satisfies readonly RoutingTaskType[];

const freeSlotModels = new Set(FREE_SLOTS.map((slot) => getRoutingSlotModel(slot)));

function plan(
  tier: string | undefined,
  taskType: RoutingTaskType,
  preferSlots?: readonly string[],
) {
  const decision = resolveWebCloudModelRoute(
    FREE_LANE_SELECTION,
    tier,
    taskType,
    undefined,
    preferSlots,
  );
  return decision.status === 'selected'
    ? { head: decision.modelKey, routeIds: routesOf(decision).map((route) => route.routeId) }
    : { head: `unavailable:${decision.code}`, routeIds: [] as string[] };
}

describe('the lane preference is derived from the pool config', () => {
  it('names exactly the slots the pool records claim', () => {
    expect([...freeLanePreferredSlots()].sort()).toEqual([...POOL_CLAIMED_SLOTS].sort());
  });
});

/**
 * Requirement: the preference reaches the resolver only for an exact-`free`
 * plan with the lane on. This is the gate that stops the `normalizeTier`
 * default→free fold from granting free-lane preference to an unknown or absent
 * tier, or to a paying Basic customer.
 */
describe('only an exact free plan with the lane on gets the preference', () => {
  const activate = (
    configuredMode: (typeof FREE_LANE_MODES)[keyof typeof FREE_LANE_MODES],
    tier: string | undefined,
  ) => activateFreeLane({ configuredMode, isFreePlan: isFreePlanTier(tier) });

  it.each([...TIERS_FOLDED_INTO_FREE, ...PAID_TIERS])('withholds it from tier %s', (tier) => {
    for (const mode of [FREE_LANE_MODES.strict, FREE_LANE_MODES.prefer, FREE_LANE_MODES.shadow]) {
      expect(activate(mode, tier)).toEqual({ mode: FREE_LANE_MODES.off, preferSlots: [] });
    }
  });

  it.each(['free', 'FREE'])('supplies it for tier %p', (tier) => {
    const activation = activate(FREE_LANE_MODES.strict, tier);
    expect(activation.mode).toBe(FREE_LANE_MODES.strict);
    expect(activation.preferSlots.length).toBeGreaterThan(0);
  });

  it('withholds it from an exact free plan when the knob is off', () => {
    expect(activate(FREE_LANE_MODES.off, 'free')).toEqual({
      mode: FREE_LANE_MODES.off,
      preferSlots: [],
    });
  });

  it('fails closed on a tier string it cannot parse cleanly', () => {
    // `isFreePlanTier` lowercases but does not trim, so a padded value reads as
    // not-free. Off is the safe direction for a tier we could not parse.
    expect(activate(FREE_LANE_MODES.strict, ' free ').preferSlots).toEqual([]);
  });
});

/** Requirement: without the preference, nothing moved for anyone. */
describe('without the preference the plan is unchanged for every tier', () => {
  it.each([...TIERS_FOLDED_INTO_FREE, ...PAID_TIERS, 'free'])(
    'never reaches a free slot for %s',
    (tier) => {
      for (const taskType of TASKS) {
        for (const routeId of plan(tier, taskType).routeIds) {
          const modelKey = routeId.slice(routeId.indexOf('/') + 1);
          expect(freeSlotModels.has(modelKey), `${String(tier)}/${taskType} → ${routeId}`).toBe(
            false,
          );
        }
      }
    },
  );

  it('resolves identically for every tier folded into free', () => {
    for (const taskType of TASKS) {
      const baseline = plan('free', taskType);
      for (const tier of TIERS_FOLDED_INTO_FREE) {
        expect(plan(tier, taskType), `tier ${String(tier)}`).toEqual(baseline);
      }
    }
  });
});

/**
 * Requirement: the regression pair. A paying Basic request never reaches a free
 * slot, the :382 route test proves that end to end, while a free-plan request
 * carrying the preference heads its plan with the free workhorse. Together they
 * are the mechanism's proof.
 */
describe('with the preference, only the free plan moves', () => {
  it('heads a free-plan chat plan with the free workhorse', () => {
    const withPreference = plan('free', 'simple_chat', freeLanePreferredSlots());
    expect(withPreference.head).toBe(getRoutingSlotModel('free_workhorse'));
  });

  it('keeps the previously-served model reachable behind it', () => {
    const before = plan('free', 'simple_chat');
    const after = plan('free', 'simple_chat', freeLanePreferredSlots());
    expect(after.head).not.toBe(before.head);
    expect(after.routeIds.some((routeId) => routeId.endsWith(`/${before.head}`))).toBe(true);
  });

  /**
   * Deliberately NOT asserted: that passing the preference to a folded tier
   * would be harmless. It would not be, at the resolver a Basic request IS
   * free-tier, so the preference would move it, which is exactly the 502 this
   * mechanism replaced. The resolver cannot tell the two apart; the gate above
   * is the whole protection, which is why it is one function with its own test.
   */
  it('moves a folded tier if the gate is bypassed, which is why the gate exists', () => {
    const bypassed = plan('basic', 'simple_chat', freeLanePreferredSlots());
    expect(bypassed.head).toBe(getRoutingSlotModel('free_workhorse'));
    expect(
      activateFreeLane({ configuredMode: FREE_LANE_MODES.strict, isFreePlan: false }).preferSlots,
    ).toEqual([]);
  });
});

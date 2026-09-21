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
 * routes as `not_verified_free`.
 *
 * FREE_SLOTS are deliberately absent. They were claimed by the two Groq
 * `gpt-oss` pools until the founder retired those models on 2026-09-11
 * (carried in 22fe3e3e8) and put the OpenRouter free router in both free
 * slots. That router may not enter the company lane: the terms workbook
 * excludes it on `promptsExcludedFromTraining`, and `check-free-pools.mjs`
 * calls its absence from the pool file the deliberate state. So no pool record
 * claims a free slot today, and the lane cannot look at one. A terms review
 * that admits a free-slot route is what puts them back here.
 */
const POOL_CLAIMED_SLOTS = [
  'reasoning_balanced',
  'reasoning_economy',
  'reasoning_premium',
] as const satisfies readonly RoutingSlot[];

/** The models behind the claimed slots: what the preference can reach. */
const pooledSlotModels = new Set(POOL_CLAIMED_SLOTS.map((slot) => getRoutingSlotModel(slot)));

/**
 * Every tier `resolveAutoRoute` still sends to the `free` ceiling.
 *
 * `basic` and `hobby` used to be here: `normalizeTier` (auto.ts) folded the
 * paying Basic plan onto `free` back when the two shared a slot list. They no
 * longer do, so what remains is only what `normalizeTier`'s default branch
 * catches, an unrecognised or absent tier. The lane still gates on
 * `isFreePlanTier` (exact `free`) rather than on the resolver's tier, because
 * an unparsed tier reaching the free ceiling is not the same claim as an
 * account being on the free plan.
 */
const TIERS_DEFAULTED_TO_FREE = ['something-unknown', undefined] as const;
const PAID_TIERS = [
  'basic',
  'hobby',
  'pro',
  'team',
  'max',
  'max_15x',
  'enterprise',
  'byok',
] as const;

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

  it.each([...TIERS_DEFAULTED_TO_FREE, ...PAID_TIERS])('withholds it from tier %s', (tier) => {
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

/**
 * Requirement: without the preference, no paid plan spends free capacity.
 *
 * The free plan itself is deliberately absent. Its own slots now carry the
 * zero-priced router it is entitled to, so reaching a free slot is what a free
 * request is supposed to do; asserting otherwise would pin the leak this file
 * exists to prevent, one tier over.
 */
describe('without the preference no paid plan reaches free capacity', () => {
  it.each([...PAID_TIERS])('never reaches a free slot for %s', (tier) => {
    for (const taskType of TASKS) {
      for (const routeId of plan(tier, taskType).routeIds) {
        const modelKey = routeId.slice(routeId.indexOf('/') + 1);
        expect(freeSlotModels.has(modelKey), `${String(tier)}/${taskType} → ${routeId}`).toBe(
          false,
        );
      }
    }
  });

  it('resolves identically for every tier the resolver defaults to free', () => {
    for (const taskType of TASKS) {
      const baseline = plan('free', taskType);
      for (const tier of TIERS_DEFAULTED_TO_FREE) {
        expect(plan(tier, taskType), `tier ${String(tier)}`).toEqual(baseline);
      }
    }
  });
});

/**
 * The preference is a REORDER WITHIN the admitted set, never a widening of it.
 *
 * Every slot a pool record claims is a reasoning slot carrying a priced model,
 * and the free tier is now granted only zero-priced slots, so `preferSlots` has
 * nothing admitted to promote on the free plan and the plan does not move. That
 * is the preference behaving correctly rather than the lane being bypassed: a
 * stage that may only reorder cannot reach a slot admission withheld.
 *
 * It also means the lane cannot serve the free plan while its pools claim
 * priced slots. Every pool is `hardStopsBeforePaid: false` and the mode
 * defaults off, so nothing is live today, but turning the lane on is not
 * sufficient on its own: how a provider free-quota allocation of a priced model
 * is represented in `tierAllowedSlots.free` is a founder decision, not
 * something a preference can route around.
 */
describe('the preference reorders within admission and never widens it', () => {
  it('leaves a free-plan chat plan where admission already put it', () => {
    const before = plan('free', 'simple_chat');
    const after = plan('free', 'simple_chat', freeLanePreferredSlots());
    expect(after).toEqual(before);
  });

  it('reaches no pooled model on the free plan, because none is admitted there', () => {
    const withPreference = plan('free', 'simple_chat', freeLanePreferredSlots());
    expect(pooledSlotModels.has(withPreference.head), withPreference.head).toBe(false);
  });

  /**
   * A paying Basic plan DOES admit the pooled slots, so handing it the
   * preference would move it. The resolver no longer confuses Basic with free,
   * but it was never the resolver's job to decide who gets a lane preference:
   * `activateFreeLane` is still the whole protection, which is why it is one
   * function with its own test.
   */
  it('would move a paying plan if the gate were bypassed, which is why the gate exists', () => {
    const bypassed = plan('basic', 'simple_chat', freeLanePreferredSlots());
    expect(bypassed.head).not.toBe(plan('basic', 'simple_chat').head);
    expect(pooledSlotModels.has(bypassed.head), bypassed.head).toBe(true);
    expect(
      activateFreeLane({ configuredMode: FREE_LANE_MODES.strict, isFreePlan: false }).preferSlots,
    ).toEqual([]);
  });
});

import type { SourceSurface } from '@agiworkforce/types';

import type { DesktopReleaseChannel } from '@/lib/releases/github-desktop-releases';

import { rolloutPercentage, type FlagEvaluation } from './evaluate-flags';
import {
  FLAG_OFF_VARIANT,
  FLAG_ON_VARIANT,
  type FlagDefinition,
  type FlagDefinitionInput,
  type FlagRollout,
  type FlagRule,
} from './flag-definition';

export const ROLLOUT_FLAG_PREFIX = 'rollout.';
export const ROLLOUT_RING_RULE_ID = 'ring';

// `satisfies` binds this list to the channel names the desktop release feed
// already stores, so the two cannot drift into different vocabularies.
export const RELEASE_CHANNELS = [
  'stable',
  'beta',
  'nightly',
] as const satisfies readonly DesktopReleaseChannel[];

export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];
export type RolloutSurface = SourceSurface;

/**
 * Surfaces whose distribution a third party approves before anyone can install
 * it. A ring on one of these may not claim reach the store has not granted.
 */
export const STORE_REVIEWED_SURFACES: readonly RolloutSurface[] = ['mobile', 'vscode', 'chrome'];

export type StoreApproval = 'unsubmitted' | 'in_review' | 'approved';

export interface RolloutRing {
  readonly id: string;
  readonly surface: RolloutSurface;
  readonly channel: ReleaseChannel;
  readonly description: string;
}

export interface RolloutRamp {
  readonly fromPercentage: number;
  readonly toPercentage: number;
  readonly startAt: string;
  readonly endAt: string;
}

/**
 * What an operator sets. `pausedAt` is not a percentage: it freezes the ring at
 * the reach it had at that instant, so pausing keeps everyone already on the
 * new build while admitting nobody new. Setting the percentage to 0 instead
 * retracts it from every one of them.
 */
export interface RolloutRingPlan {
  readonly percentage: number;
  readonly ramp: RolloutRamp | null;
  readonly pausedAt: string | null;
  readonly storeApproval: StoreApproval | null;
}

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const FULL_REACH = 100;
const NO_REACH = 0;

export function rolloutRingFlagKey(ring: RolloutRing): string {
  return `${ROLLOUT_FLAG_PREFIX}${ring.surface}.${ring.channel}.${ring.id}`;
}

export function parseRolloutRingFlagKey(
  key: string,
): { surface: RolloutSurface; channel: ReleaseChannel; id: string } | null {
  if (!key.startsWith(ROLLOUT_FLAG_PREFIX)) return null;
  const [surface, channel, ...rest] = key.slice(ROLLOUT_FLAG_PREFIX.length).split('.');
  const id = rest.join('.');
  if (!surface || !channel || !id) return null;
  if (!(RELEASE_CHANNELS as readonly string[]).includes(channel)) return null;
  if (!ID_PATTERN.test(id)) return null;
  return { surface: surface as RolloutSurface, channel: channel as ReleaseChannel, id };
}

export function rampPercentageAt(ramp: RolloutRamp, atMs: number): number {
  return rolloutPercentage({ ramp }, atMs);
}

/**
 * The reach the plan asks for right now. A paused plan resolves its ramp at the
 * instant it was paused rather than at `nowMs`, which is what makes a pause
 * hold its population instead of continuing to grow or dropping to nothing.
 */
export function plannedPercentage(plan: RolloutRingPlan, nowMs: number): number {
  if (plan.ramp === null) return plan.percentage;
  const atMs = plan.pausedAt === null ? nowMs : Date.parse(plan.pausedAt);
  return rampPercentageAt(plan.ramp, atMs);
}

/**
 * Why this plan may not ship as written. A store surface cannot be handed to
 * anyone before the store says yes, and cannot be called generally available
 * while the submission is still in review, which is the failure mode of
 * announcing GA on a build the platform has not approved.
 */
export function rolloutRingBlockers(
  ring: RolloutRing,
  plan: RolloutRingPlan,
  nowMs: number,
): string[] {
  const blockers: string[] = [];
  const reach = Math.max(plannedPercentage(plan, nowMs), plan.ramp?.toPercentage ?? NO_REACH);
  if (!STORE_REVIEWED_SURFACES.includes(ring.surface)) return blockers;
  if (reach <= NO_REACH) return blockers;
  if (plan.storeApproval === null) {
    blockers.push(
      `${ring.surface} is distributed through a store, so ring ${ring.id} must record the store approval state before it reaches anyone`,
    );
    return blockers;
  }
  if (plan.storeApproval !== 'approved') {
    blockers.push(
      `${ring.surface} ring ${ring.id} would reach ${reach}% while the store submission is ${plan.storeApproval}`,
    );
  }
  return blockers;
}

function rolloutFor(plan: RolloutRingPlan): FlagRollout {
  if (plan.ramp === null) return { percentage: plan.percentage };
  if (plan.pausedAt === null) return { ramp: { ...plan.ramp } };
  return { percentage: rampPercentageAt(plan.ramp, Date.parse(plan.pausedAt)) };
}

/**
 * The rule id never varies with the plan: the evaluation bucket is seeded from
 * it, so changing it would re-draw the population and hand the build to a
 * different set of people on the very edit meant to hold it still.
 */
export function rolloutRingRule(ring: RolloutRing, plan: RolloutRingPlan): FlagRule {
  return {
    id: ROLLOUT_RING_RULE_ID,
    conditions: { surfaces: [ring.surface] },
    rollout: rolloutFor(plan),
    bucketBy: 'user',
    variant: FLAG_ON_VARIANT,
  };
}

/**
 * A ring is opt-in, the mirror of a kill switch: `defaultVariant: off`, so a
 * missing flag means the staged change has not been handed to anybody and a
 * flag-store outage cannot widen a rollout.
 */
export function rolloutRingDefinition(
  ring: RolloutRing,
  plan: RolloutRingPlan,
  nowMs: number = Date.now(),
): FlagDefinitionInput {
  const blockers = rolloutRingBlockers(ring, plan, nowMs);
  if (blockers.length > 0) throw new Error(blockers[0]);
  return {
    key: rolloutRingFlagKey(ring),
    description: ring.description,
    killSwitch: false,
    variants: [FLAG_ON_VARIANT, FLAG_OFF_VARIANT],
    defaultVariant: FLAG_OFF_VARIANT,
    rules: [rolloutRingRule(ring, plan)],
    expiresAt: null,
  };
}

export interface RolloutRingState {
  key: string;
  surface: RolloutSurface;
  channel: ReleaseChannel;
  id: string;
  included: boolean;
  paused: boolean;
  percentage: number;
}

function ringPercentage(definition: FlagDefinition, nowMs: number): number {
  const rule = definition.rules.find((candidate) => candidate.id === ROLLOUT_RING_RULE_ID);
  if (!rule || rule.variant !== FLAG_ON_VARIANT) return NO_REACH;
  return rolloutPercentage(rule.rollout, nowMs);
}

/**
 * A ramp that has not run out is still advancing. A ring open to some people
 * and no longer moving is one an operator stopped, which is the state an
 * incident review has to be able to read back from the store alone.
 */
function ringAdvancing(definition: FlagDefinition, nowMs: number): boolean {
  const rule = definition.rules.find((candidate) => candidate.id === ROLLOUT_RING_RULE_ID);
  const rollout = rule?.rollout;
  if (!rollout || !('ramp' in rollout)) return false;
  return Date.parse(rollout.ramp.endAt) > nowMs;
}

export function isRolloutRingKey(key: string): boolean {
  return parseRolloutRingFlagKey(key) !== null;
}

export function ringIncluded(
  evaluations: Readonly<Record<string, FlagEvaluation>>,
  ring: RolloutRing,
): boolean {
  return evaluations[rolloutRingFlagKey(ring)]?.enabled === true;
}

/**
 * Every ring currently open, with the reach it is holding, so one view answers
 * what is part-way out and whether it is still moving.
 */
export function activeRolloutRings(
  definitions: readonly FlagDefinition[],
  nowMs: number = Date.now(),
): RolloutRingState[] {
  const rings: RolloutRingState[] = [];
  for (const definition of definitions) {
    if (definition.archivedAt !== null) continue;
    const parsed = parseRolloutRingFlagKey(definition.key);
    if (!parsed) continue;
    const percentage = ringPercentage(definition, nowMs);
    rings.push({
      key: definition.key,
      ...parsed,
      included: percentage > NO_REACH,
      paused: percentage > NO_REACH && percentage < FULL_REACH && !ringAdvancing(definition, nowMs),
      percentage,
    });
  }
  return rings;
}

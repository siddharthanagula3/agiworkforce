/**
 * The four named routing profiles, as literal objects with their own weights.
 *
 * WHY THIS EXISTS
 * ---------------
 * Instant, High, Code and Research were real routing behaviours with no name:
 * "instant" was a cheap band in `free-auto.ts`, "high" was the frontier and
 * reasoning tiers in `model-families.json`, "code" was a task type in
 * `task-family.ts`, "research" was a mode flag. Each was tuned by a different
 * knob, and there was no single place to answer "what does Research trade away
 * to get its answer" or to change that trade for one profile without moving a
 * shared threshold under the other three.
 *
 * WHAT A PROFILE IS
 * -----------------
 * A profile is the trade-off a request is routed under, expressed as weights
 * over three axes the router already measures per candidate: the quality band
 * of the slot, the expected cost of the cheapest admissible route, and the
 * measured p50 latency. The weights sum to one so two profiles are directly
 * comparable, and `weightedScore` is the only place they are combined.
 *
 * WHAT A PROFILE IS NOT
 * ---------------------
 * A profile never admits a candidate that admission rejected, and never
 * overrides a quality floor. `RoutingProfile` in `auto.ts` (economy, balanced,
 * premium) stays the cost band a plan tier clamps; a named profile carries a
 * band and adds the weights that order candidates inside it. This module is
 * pure: no registry read, no environment read, no I/O.
 *
 * @module routing/profiles
 * @packageDocumentation
 */

import type { RoutingProfile } from '../auto';
import type { TaskFamily } from '../task-family';

export const ROUTING_PROFILE_IDS = ['instant', 'high', 'code', 'research'] as const;

export type RoutingProfileId = (typeof ROUTING_PROFILE_IDS)[number];

/**
 * How much each axis counts when ordering admitted candidates. The three sum
 * to 1: a weight is a share of one decision, not an independent dial, which is
 * what makes "Research weighs quality more than Instant does" a checkable
 * statement rather than a comparison of unrelated numbers.
 */
export interface RoutingProfileWeights {
  readonly quality: number;
  readonly cost: number;
  readonly latency: number;
}

export interface NamedRoutingProfile {
  readonly id: RoutingProfileId;
  /** What the profile is called on a surface that offers it. */
  readonly name: string;
  /** The cost band this profile routes within, before a plan tier clamps it. */
  readonly band: RoutingProfile;
  readonly weights: RoutingProfileWeights;
  /** The task families this profile is the trade-off for. */
  readonly taskFamilies: readonly TaskFamily[];
  readonly intent: string;
}

const INSTANT: NamedRoutingProfile = {
  id: 'instant',
  name: 'Instant',
  band: 'economy',
  weights: { quality: 0.15, cost: 0.35, latency: 0.5 },
  taskFamilies: ['simple_chat', 'general_chat', 'caller_tool_loop'],
  intent: 'Answer now. Latency outweighs everything the answer could gain by waiting.',
};

const HIGH: NamedRoutingProfile = {
  id: 'high',
  name: 'High',
  band: 'premium',
  weights: { quality: 0.7, cost: 0.1, latency: 0.2 },
  taskFamilies: ['extended_thinking', 'long_context', 'vision'],
  intent: 'Answer well. The hardest requests, where a cheaper answer is the expensive one.',
};

const CODE: NamedRoutingProfile = {
  id: 'code',
  name: 'Code',
  band: 'balanced',
  weights: { quality: 0.55, cost: 0.2, latency: 0.25 },
  taskFamilies: ['code_execution', 'agentic_work', 'screen_automation'],
  intent: 'Code that runs. Wrong code costs another whole turn, so quality leads cost.',
};

const RESEARCH: NamedRoutingProfile = {
  id: 'research',
  name: 'Research',
  band: 'balanced',
  weights: { quality: 0.6, cost: 0.25, latency: 0.15 },
  taskFamilies: ['deep_research', 'web_grounded_answer', 'document_authoring'],
  intent: 'Answer thoroughly. A long-running request nobody is watching tick by tick.',
};

export const ROUTING_PROFILES: Readonly<Record<RoutingProfileId, NamedRoutingProfile>> = {
  instant: INSTANT,
  high: HIGH,
  code: CODE,
  research: RESEARCH,
};

export function isRoutingProfileId(value: unknown): value is RoutingProfileId {
  return typeof value === 'string' && (ROUTING_PROFILE_IDS as readonly string[]).includes(value);
}

export function routingProfile(id: RoutingProfileId): NamedRoutingProfile {
  return ROUTING_PROFILES[id];
}

/** Resolve a profile by the name a surface shows, case-insensitively. */
export function routingProfileByName(name: string): NamedRoutingProfile | null {
  const wanted = name.trim().toLowerCase();
  return (
    ROUTING_PROFILE_IDS.map((id) => ROUTING_PROFILES[id]).find(
      (profile) => profile.name.toLowerCase() === wanted || profile.id === wanted,
    ) ?? null
  );
}

const PROFILE_BY_FAMILY: ReadonlyMap<TaskFamily, RoutingProfileId> = new Map(
  ROUTING_PROFILE_IDS.flatMap((id) =>
    ROUTING_PROFILES[id].taskFamilies.map((family) => [family, id] as const),
  ),
);

/**
 * The profile a classified request is routed under. Every task family maps to
 * exactly one profile, which `routing-profiles.test.ts` holds: a family with no
 * profile would silently fall back to Instant and be routed cheap.
 */
export function profileForTaskFamily(
  family: TaskFamily | null | undefined,
): NamedRoutingProfile | null {
  if (family === null || family === undefined) return null;
  const id = PROFILE_BY_FAMILY.get(family);
  return id === undefined ? null : ROUTING_PROFILES[id];
}

export interface RoutingCandidateMeasurements {
  /** 0 for the weakest band offered, 1 for the strongest. */
  readonly qualityBand: number;
  /** Expected cost of this candidate, and the dearest candidate compared. */
  readonly expectedMicroUsd: number | null;
  readonly dearestMicroUsd: number | null;
  readonly latencyP50Ms: number | null;
  readonly slowestP50Ms: number | null;
}

function normalisedSaving(value: number | null, worst: number | null): number {
  if (value === null || worst === null || worst <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - value / worst));
}

/**
 * One number per candidate, under one profile's weights. Higher is better.
 *
 * Cost and latency enter as savings against the worst candidate in the same
 * set, so a profile's weights are comparable across requests of very different
 * absolute price. A measurement the router does not have contributes nothing
 * rather than a guessed default, so a candidate is never ranked up by a gap in
 * the data.
 */
export function weightedScore(
  profile: NamedRoutingProfile,
  measurements: RoutingCandidateMeasurements,
): number {
  const quality = Math.max(0, Math.min(1, measurements.qualityBand));
  const cost = normalisedSaving(measurements.expectedMicroUsd, measurements.dearestMicroUsd);
  const speed = normalisedSaving(measurements.latencyP50Ms, measurements.slowestP50Ms);
  return (
    profile.weights.quality * quality +
    profile.weights.cost * cost +
    profile.weights.latency * speed
  );
}

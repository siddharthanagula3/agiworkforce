/**
 * Task-family eligibility floor + Pareto (cost-ranked) candidate ordering.
 *
 * Design source of truth:
 * `docs/architecture/execution-plan-contract.md` §3.2 invariant 1
 * ("A plan never widens admission … the plan describes the survivor"),
 * invariant 4 ("Absent policy is not permissive"), and §5 Stage 2.
 *
 * THE ROUTING THESIS THIS IMPLEMENTS
 * ----------------------------------
 * Pick the CHEAPEST configuration that still meets a measurable, task-specific
 * quality threshold. Hard constraints filter FIRST; cost ranks only what
 * survives. Concretely, in this module:
 *
 *   1. Admission is untouched. The candidate set handed in is exactly the set
 *      `resolveAutoRoute` already built, `auto.tasks.<task>.preferredSlots`
 *      for the tier-clamped effective profile. This module never adds a slot,
 *      never reads `tierAllowedSlots`, and never sees a trust mode.
 *   2. The per-family quality floor partitions that set into `aboveFloor` and
 *      the rest.
 *   3. `aboveFloor` is sorted by ascending estimated request cost.
 *   4. The result is a PERMUTATION of the input: `[...aboveFloorByCost,
 *      ...restInAuthoredOrder]`. Same members, same length, nothing dropped.
 *
 * Step 4 is the whole safety argument. A filter could strand a request whose
 * only eligible route sat below the floor; a permutation cannot. If nothing
 * meets the floor the list is returned in its authored order and the stage is
 * a no-op that still reports WHY (`task_family_floor_unmet`).
 *
 * WHAT A FLOOR MAY BE EXPRESSED AGAINST
 * -------------------------------------
 * Only metadata the registry already carries:
 *  - `minimumSlotBand`, the lowest authored profile band (`economy` <
 *    `balanced` < `premium`) whose `preferredSlots` list contains the slot, for
 *    THIS task. This is the curator's own quality ladder, read back.
 *  - `requiredCapabilities`, `registry.capabilities[modelKey]`.
 *  - `minimumContextTokens`, `registry.limits[modelKey].contextTokens`.
 *  - `minimumBenchmarkScores`, `registry.benchmarks[modelKey]`, read only when
 *    the score names the source it came from. An unsourced score counts as no
 *    score at all.
 *
 * **Benchmark coverage is thin and a floor that uses it fails closed.** At the
 * time of writing only 10 of 31 registry models carry any benchmark scores,
 * and the models pinned by the most-used slots (`workhorse_general`,
 * `coding_balanced`, `flagship_general`) carry none. A model with no recorded
 * score for a named benchmark therefore FAILS that floor, absent policy is not
 * permissive (§3.2 invariant 4). That is why no seeded family authors a
 * benchmark floor today: the mechanism exists, the data does not.
 *
 * RUST ADOPTION FOLLOWS OQ-1
 * --------------------------
 * This stage is TypeScript-only on purpose. `crates/agiworkforce-model-registry`
 * carries a second, already-diverged resolver (its `AutoRoutingRequest` has no
 * budget or capability fields, and its `UnavailableCode` has six variants to
 * this side's eight). Design-doc **OQ-1, which resolver is canonical, is
 * undecided**, and adding this stage to both would double the divergence
 * surface before that question is answered. The Rust resolver is deliberately
 * NOT modified; it adopts this stage only after OQ-1 is resolved.
 *
 * @module routing/task-family-routing
 * @packageDocumentation
 */

import { modelRegistry } from '@agiworkforce/model-registry';
import type { RoutingTaskType } from '@agiworkforce/types';

import type { IntrinsicCapability, RoutingProfile } from './auto';
import type { TaskFamily } from './task-family';

export const TASK_FAMILY_STAGE_ENV = 'AGI_ROUTING_TASK_FAMILY_STAGE';

const TASK_FAMILY_STAGE_KILL_VALUES: ReadonlySet<string> = new Set(['0', 'false', 'off']);

/**
 * The stage is ON unless an operator turns it off.
 *
 * The variable is a kill switch, not a launch switch: an unset environment
 * runs the cost-ordered stage, and `0`, `false` or `off` restores the authored
 * order across every surface in one edit.
 */
export function taskFamilyRoutingStageEnabled(): boolean {
  if (typeof process === 'undefined') return true;
  const raw = process.env?.[TASK_FAMILY_STAGE_ENV];
  if (raw === undefined) return true;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return true;
  return !TASK_FAMILY_STAGE_KILL_VALUES.has(normalized);
}

export const MICRO_USD_PER_CENT = 10_000;

export function expectedMicroUsdFromCents(cents: number): number {
  return Math.round(cents * MICRO_USD_PER_CENT);
}

export interface TaskFamilyQualityFloor {
  minimumSlotBand?: RoutingProfile;
  requiredCapabilities?: readonly IntrinsicCapability[];
  minimumContextTokens?: number;
  minimumBenchmarkScores?: Readonly<Record<string, number>>;
}

export interface TaskFamilyPolicyEntry {
  appliesToTaskTypes: readonly RoutingTaskType[];
  riskLabel: 'low' | 'high';
  qualityFloor: TaskFamilyQualityFloor;
}

interface RegistryBenchmarkScore {
  value: number;
  source: string;
  version: string | null;
  date: string | null;
  confidence: 'verified' | 'aggregated' | 'unknown';
}

function sourcedBenchmarkValue(score: RegistryBenchmarkScore | undefined): number | undefined {
  if (!score || typeof score.source !== 'string' || score.source.length === 0) return undefined;
  return Number.isFinite(score.value) ? score.value : undefined;
}

interface TaskFamilyRegistryView {
  capabilities: Record<string, Partial<Record<IntrinsicCapability, boolean>>>;
  limits: Record<string, { contextTokens?: number }>;
  benchmarks: Record<string, Record<string, RegistryBenchmarkScore>>;
  policies: { auto: { taskFamilies?: Record<string, TaskFamilyPolicyEntry> } };
}

const registry = modelRegistry as unknown as TaskFamilyRegistryView;

export function taskFamilyPolicy(family: TaskFamily): TaskFamilyPolicyEntry | undefined {
  return registry.policies.auto.taskFamilies?.[family];
}

export type TaskFamilyStageReason =
  | 'task_family_ordering_applied'
  /** Every candidate failed the floor; the authored order was preserved. */
  | 'task_family_floor_unmet'
  /** The curated policy declares no entry for this family. */
  | 'task_family_no_policy'
  /** The family does not narrow this request's canonical task type. */
  | 'task_family_task_mismatch'
  /** The fast path declined to classify (ambiguous request). */
  | 'task_family_unclassified'
  /** The operator flag is off. */
  | 'task_family_stage_disabled'
  /** The task has no preferred slots at this profile, nothing to order. */
  | 'task_family_no_candidates';

export interface TaskFamilyFloorRejection {
  slotId: string;
  modelKey: string;
  reasons: string[];
}

/** What one route costs for this request, from the cheapest admissible route. */
export interface TaskFamilySlotCost {
  routeId: string | null;
  cents: number;
}

export interface TaskFamilyCandidate {
  slotId: string;
  modelKey: string;
  routeId: string | null;
  expectedMicroUsd: number | null;
  aboveFloor: boolean;
}

export interface TaskFamilySelectionRecord {
  slotId: string | null;
  modelKey: string;
  routeId: string;
  expectedMicroUsd: number | null;
}

export interface TaskFamilyOrdering {
  family: TaskFamily;
  reasonCode: TaskFamilyStageReason;
  slots: readonly string[];
  aboveFloor: readonly string[];
  /** The band the floor demanded, authored or derived from the first slot. */
  floorBand: RoutingProfile | null;
  /** Every candidate in final order, with the cost that ordered it. */
  candidates: readonly TaskFamilyCandidate[];
  escalationLadder: readonly string[];
  rejections: readonly TaskFamilyFloorRejection[];
}

export function slotQualityBand(
  slotId: string,
  preferredSlotsByProfile: Readonly<Partial<Record<RoutingProfile, readonly string[]>>>,
  profileOrder: readonly RoutingProfile[],
): RoutingProfile | null {
  for (const profile of profileOrder) {
    if (preferredSlotsByProfile[profile]?.includes(slotId)) return profile;
  }
  return null;
}

function evaluateFloor(
  slotId: string,
  modelKey: string,
  floor: TaskFamilyQualityFloor,
  preferredSlotsByProfile: Readonly<Partial<Record<RoutingProfile, readonly string[]>>>,
  profileOrder: readonly RoutingProfile[],
): string[] {
  const reasons: string[] = [];

  if (floor.minimumSlotBand !== undefined) {
    const band = slotQualityBand(slotId, preferredSlotsByProfile, profileOrder);
    const bandIndex = band === null ? -1 : profileOrder.indexOf(band);
    const floorIndex = profileOrder.indexOf(floor.minimumSlotBand);
    if (bandIndex < 0) {
      reasons.push(`slot ${slotId} is in no authored profile band for this task`);
    } else if (bandIndex < floorIndex) {
      reasons.push(`slot ${slotId} band ${band} is below the ${floor.minimumSlotBand} floor`);
    }
  }

  const capabilities = registry.capabilities[modelKey];
  for (const capability of floor.requiredCapabilities ?? []) {
    if (capabilities?.[capability] !== true) {
      reasons.push(`model ${modelKey} lacks intrinsic capability ${capability}`);
    }
  }

  if (floor.minimumContextTokens !== undefined) {
    const contextTokens = registry.limits[modelKey]?.contextTokens ?? 0;
    if (contextTokens < floor.minimumContextTokens) {
      reasons.push(
        `model ${modelKey} context ${contextTokens} is below the ${floor.minimumContextTokens} floor`,
      );
    }
  }

  for (const [benchmark, minimum] of Object.entries(floor.minimumBenchmarkScores ?? {})) {
    const score = sourcedBenchmarkValue(registry.benchmarks[modelKey]?.[benchmark]);
    if (score === undefined) {
      reasons.push(`model ${modelKey} has no sourced ${benchmark} score`);
    } else if (score < minimum) {
      reasons.push(`model ${modelKey} ${benchmark} ${score} is below the ${minimum} floor`);
    }
  }

  return reasons;
}

export interface TaskFamilyOrderingInput {
  family: TaskFamily;
  taskType: RoutingTaskType;
  preferredSlots: readonly string[];
  preferredSlotsByProfile: Readonly<Partial<Record<RoutingProfile, readonly string[]>>>;
  profileOrder: readonly RoutingProfile[];
  slots: Readonly<Record<string, { modelKey: string } | undefined>>;
  /** List-price estimate, the fallback when the caller cannot price routes. */
  estimateCents: (modelKey: string) => number;
  /**
   * The route this model would actually dispatch on, and what it costs.
   *
   * `null` means no route of that model can serve this request, so the slot
   * carries no cost and sinks behind every priced candidate instead of leading
   * on a price nothing can charge.
   */
  estimateRoute?: (modelKey: string) => TaskFamilySlotCost | null;
}

/**
 * The floor a family is actually held to.
 *
 * A family that authors no band inherits the band of its own first authored
 * slot, so "no floor" never means "any slot will do".
 */
export function effectiveQualityFloor(
  floor: TaskFamilyQualityFloor,
  preferredSlots: readonly string[],
  preferredSlotsByProfile: Readonly<Partial<Record<RoutingProfile, readonly string[]>>>,
  profileOrder: readonly RoutingProfile[],
): TaskFamilyQualityFloor {
  if (floor.minimumSlotBand !== undefined) return floor;
  const firstSlot = preferredSlots[0];
  const band =
    firstSlot === undefined
      ? null
      : slotQualityBand(firstSlot, preferredSlotsByProfile, profileOrder);
  return band === null ? floor : { ...floor, minimumSlotBand: band };
}

function slotCostResolver(
  input: TaskFamilyOrderingInput,
): (modelKey: string) => TaskFamilySlotCost | null {
  const memo = new Map<string, TaskFamilySlotCost | null>();
  return (modelKey) => {
    if (memo.has(modelKey)) return memo.get(modelKey) ?? null;
    const cost = input.estimateRoute
      ? input.estimateRoute(modelKey)
      : { routeId: null, cents: input.estimateCents(modelKey) };
    memo.set(modelKey, cost);
    return cost;
  };
}

/**
 * Order the admitted candidate set for `family`: floor-meeting slots first,
 * cheapest first, then everything else in its authored order.
 *
 * Returns `null` when the stage does not apply, so the caller can keep the
 * existing walk byte-for-byte. `null` is always accompanied by a reason code
 * on the returned envelope from {@link resolveTaskFamilyOrdering}.
 */
export function orderPreferredSlotsForTaskFamily(
  input: TaskFamilyOrderingInput,
): TaskFamilyOrdering | null {
  const policy = taskFamilyPolicy(input.family);
  if (!policy) return null;
  if (!policy.appliesToTaskTypes.includes(input.taskType)) return null;
  if (input.preferredSlots.length === 0) return null;

  const floor = effectiveQualityFloor(
    policy.qualityFloor,
    input.preferredSlots,
    input.preferredSlotsByProfile,
    input.profileOrder,
  );
  const costOf = slotCostResolver(input);

  interface Entry {
    slotId: string;
    modelKey: string;
    cost: TaskFamilySlotCost | null;
    authoredIndex: number;
  }
  const aboveFloor: Entry[] = [];
  const belowFloor: Entry[] = [];
  const rejections: TaskFamilyFloorRejection[] = [];

  input.preferredSlots.forEach((slotId, authoredIndex) => {
    const modelKey = input.slots[slotId]?.modelKey;
    if (modelKey === undefined) {
      rejections.push({ slotId, modelKey: '', reasons: [`routing slot ${slotId} is missing`] });
      belowFloor.push({ slotId, modelKey: '', cost: null, authoredIndex });
      return;
    }
    const reasons = evaluateFloor(
      slotId,
      modelKey,
      floor,
      input.preferredSlotsByProfile,
      input.profileOrder,
    );
    const entry: Entry = { slotId, modelKey, cost: costOf(modelKey), authoredIndex };
    if (reasons.length === 0) {
      aboveFloor.push(entry);
      return;
    }
    rejections.push({ slotId, modelKey, reasons });
    belowFloor.push(entry);
  });

  aboveFloor.sort((left, right) => {
    if ((left.cost === null) !== (right.cost === null)) return left.cost === null ? 1 : -1;
    if (left.cost && right.cost && left.cost.cents !== right.cost.cents) {
      return left.cost.cents - right.cost.cents;
    }
    return left.authoredIndex - right.authoredIndex;
  });

  const ordered = [...aboveFloor, ...belowFloor];
  const head = aboveFloor.map((entry) => entry.slotId);

  /* istanbul ignore next -- structural guard; a violation is a programming error */
  if (ordered.length !== input.preferredSlots.length) {
    throw new Error('task-family ordering must be a permutation of the admitted candidate set');
  }

  const candidates: TaskFamilyCandidate[] = ordered.map((entry) => ({
    slotId: entry.slotId,
    modelKey: entry.modelKey,
    routeId: entry.cost?.routeId ?? null,
    expectedMicroUsd: entry.cost ? expectedMicroUsdFromCents(entry.cost.cents) : null,
    aboveFloor: aboveFloor.includes(entry),
  }));

  return {
    family: input.family,
    reasonCode: head.length === 0 ? 'task_family_floor_unmet' : 'task_family_ordering_applied',
    slots: ordered.map((entry) => entry.slotId),
    aboveFloor: head,
    floorBand: floor.minimumSlotBand ?? null,
    candidates,
    escalationLadder: [
      ...new Set(
        ordered
          .filter((entry) => entry.modelKey.length > 0)
          .map((entry) => {
            const band = slotQualityBand(
              entry.slotId,
              input.preferredSlotsByProfile,
              input.profileOrder,
            );
            return {
              slotId: entry.slotId,
              modelKey: entry.modelKey,
              bandIndex: band === null ? -1 : input.profileOrder.indexOf(band),
              cents: entry.cost?.cents ?? Number.POSITIVE_INFINITY,
            };
          })
          .sort(
            (a, b) =>
              a.bandIndex - b.bandIndex || a.cents - b.cents || a.slotId.localeCompare(b.slotId),
          )
          .map((entry) => entry.modelKey),
      ),
    ],
    rejections,
  };
}

export interface TaskFamilyStageDecision {
  family: TaskFamily | null;
  reasonCode: TaskFamilyStageReason;
  ordering?: TaskFamilyOrdering;
  /** The slot and route the resolver actually took, recorded for the log. */
  selected?: TaskFamilySelectionRecord;
}

export function recordTaskFamilySelection(
  decision: TaskFamilyStageDecision,
  selected: TaskFamilySelectionRecord,
): TaskFamilyStageDecision {
  if (!decision.ordering) return decision;
  return { ...decision, selected };
}

export function resolveTaskFamilyOrdering(
  input: Omit<TaskFamilyOrderingInput, 'family'> & { family: TaskFamily | null; enabled: boolean },
): TaskFamilyStageDecision {
  if (!input.enabled) {
    return { family: input.family, reasonCode: 'task_family_stage_disabled' };
  }
  if (input.family === null) {
    return { family: null, reasonCode: 'task_family_unclassified' };
  }
  const policy = taskFamilyPolicy(input.family);
  if (!policy) {
    return { family: input.family, reasonCode: 'task_family_no_policy' };
  }
  if (!policy.appliesToTaskTypes.includes(input.taskType)) {
    return { family: input.family, reasonCode: 'task_family_task_mismatch' };
  }
  if (input.preferredSlots.length === 0) {
    return { family: input.family, reasonCode: 'task_family_no_candidates' };
  }
  const ordering = orderPreferredSlotsForTaskFamily({ ...input, family: input.family });
  /* istanbul ignore next -- the four null paths are all handled above */
  if (!ordering) {
    return { family: input.family, reasonCode: 'task_family_no_policy' };
  }
  return { family: input.family, reasonCode: ordering.reasonCode, ordering };
}

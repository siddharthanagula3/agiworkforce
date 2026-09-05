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

export function taskFamilyRoutingStageEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return process.env?.[TASK_FAMILY_STAGE_ENV] === '1';
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

export interface TaskFamilyOrdering {
  family: TaskFamily;
  reasonCode: TaskFamilyStageReason;
  slots: readonly string[];
  aboveFloor: readonly string[];
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
  estimateCents: (modelKey: string) => number;
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

  const aboveFloor: { slotId: string; cents: number; authoredIndex: number }[] = [];
  const rejections: TaskFamilyFloorRejection[] = [];
  const belowFloor: string[] = [];

  input.preferredSlots.forEach((slotId, authoredIndex) => {
    const modelKey = input.slots[slotId]?.modelKey;
    if (modelKey === undefined) {
      rejections.push({ slotId, modelKey: '', reasons: [`routing slot ${slotId} is missing`] });
      belowFloor.push(slotId);
      return;
    }
    const reasons = evaluateFloor(
      slotId,
      modelKey,
      policy.qualityFloor,
      input.preferredSlotsByProfile,
      input.profileOrder,
    );
    if (reasons.length === 0) {
      aboveFloor.push({ slotId, cents: input.estimateCents(modelKey), authoredIndex });
      return;
    }
    rejections.push({ slotId, modelKey, reasons });
    belowFloor.push(slotId);
  });

  aboveFloor.sort((a, b) => a.cents - b.cents || a.authoredIndex - b.authoredIndex);
  const head = aboveFloor.map((entry) => entry.slotId);
  const ordered = [...head, ...belowFloor];

  /* istanbul ignore next -- structural guard; a violation is a programming error */
  if (ordered.length !== input.preferredSlots.length) {
    throw new Error('task-family ordering must be a permutation of the admitted candidate set');
  }

  return {
    family: input.family,
    reasonCode: head.length === 0 ? 'task_family_floor_unmet' : 'task_family_ordering_applied',
    slots: ordered,
    aboveFloor: head,
    escalationLadder: [
      ...new Set(
        [...input.preferredSlots]
          .map((slotId) => {
            const modelKey = input.slots[slotId]?.modelKey;
            if (typeof modelKey !== 'string') return null;
            const band = slotQualityBand(slotId, input.preferredSlotsByProfile, input.profileOrder);
            return {
              slotId,
              modelKey,
              bandIndex: band === null ? -1 : input.profileOrder.indexOf(band),
              cents: input.estimateCents(modelKey),
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
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

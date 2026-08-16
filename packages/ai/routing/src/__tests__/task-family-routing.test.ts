import { describe, expect, it } from 'vitest';

import { modelRegistry } from '@agiworkforce/model-registry';

import { resolveAutoRoute, type RoutingProfile } from '../auto';
import { decideTaskFamilyContinuity } from '../task-family-continuity';
import { TASK_FAMILIES, TASK_FAMILY_INTENDED_TASK_TYPES, type TaskFamily } from '../task-family';
import {
  orderPreferredSlotsForTaskFamily,
  resolveTaskFamilyOrdering,
  slotQualityBand,
  TASK_FAMILY_STAGE_ENV,
  taskFamilyPolicy,
  taskFamilyRoutingStageEnabled,
  type TaskFamilyOrderingInput,
} from '../task-family-routing';
import type { RoutingTaskType } from '../types';

const registry = modelRegistry as unknown as {
  policies: {
    auto: {
      profileOrder: RoutingProfile[];
      slots: Record<string, { modelKey: string }>;
      tasks: Record<string, { preferredSlots: Record<RoutingProfile, string[]> }>;
    };
  };
};
const policy = registry.policies.auto;

const PROFILE_ORDER = policy.profileOrder;
const WORKHORSE_MODEL_ID = policy.slots.workhorse_general!.modelKey;
const CODING_ESCALATION_MODEL_ID = policy.slots.escalation_coding!.modelKey;
const CODING_BALANCED_MODEL_ID = policy.slots.coding_balanced!.modelKey;
const CODING_PREMIUM_MODEL_ID = policy.slots.flagship_coding!.modelKey;

function taskInput(
  family: TaskFamily,
  taskType: RoutingTaskType,
  profile: RoutingProfile,
  estimateCents: (modelKey: string) => number,
): TaskFamilyOrderingInput {
  const task = policy.tasks[taskType]!;
  return {
    family,
    taskType,
    preferredSlots: task.preferredSlots[profile],
    preferredSlotsByProfile: task.preferredSlots,
    profileOrder: PROFILE_ORDER,
    slots: policy.slots,
    estimateCents,
  };
}

function fakeCents(modelKey: string): number {
  let hash = 0;
  for (let index = 0; index < modelKey.length; index += 1) {
    hash = (hash * 31 + modelKey.charCodeAt(index)) % 9973;
  }
  return hash / 100;
}

describe('feature flag', () => {
  it('is OFF unless the operator env is exactly "1"', () => {
    const original = process.env[TASK_FAMILY_STAGE_ENV];
    try {
      delete process.env[TASK_FAMILY_STAGE_ENV];
      expect(taskFamilyRoutingStageEnabled()).toBe(false);
      for (const value of ['', '0', 'true', 'on', 'yes', 'TRUE']) {
        process.env[TASK_FAMILY_STAGE_ENV] = value;
        expect(taskFamilyRoutingStageEnabled()).toBe(false);
      }
      process.env[TASK_FAMILY_STAGE_ENV] = '1';
      expect(taskFamilyRoutingStageEnabled()).toBe(true);
    } finally {
      if (original === undefined) delete process.env[TASK_FAMILY_STAGE_ENV];
      else process.env[TASK_FAMILY_STAGE_ENV] = original;
    }
  });
});

describe('curated policy', () => {
  it('declares an entry for every family the classifier can return', () => {
    for (const family of TASK_FAMILIES) {
      expect(taskFamilyPolicy(family), `missing policy for ${family}`).toBeDefined();
    }
  });

  it('agrees with the classifier about which tasks each family narrows', () => {
    for (const family of TASK_FAMILIES) {
      expect(new Set(taskFamilyPolicy(family)!.appliesToTaskTypes)).toEqual(
        new Set(TASK_FAMILY_INTENDED_TASK_TYPES[family]),
      );
    }
  });

  it('only names task types the Auto policy actually defines', () => {
    for (const family of TASK_FAMILIES) {
      for (const taskType of taskFamilyPolicy(family)!.appliesToTaskTypes) {
        expect(policy.tasks[taskType], `${family} → unknown task ${taskType}`).toBeDefined();
      }
    }
  });

  it('labels every family low or high risk', () => {
    for (const family of TASK_FAMILIES) {
      expect(['low', 'high']).toContain(taskFamilyPolicy(family)!.riskLabel);
    }
  });

  it('seeds no benchmark floor, because benchmark coverage is partial', () => {
    for (const family of TASK_FAMILIES) {
      expect(taskFamilyPolicy(family)!.qualityFloor.minimumBenchmarkScores).toBeUndefined();
    }
  });
});

describe('slotQualityBand', () => {
  const bands = {
    economy: ['a', 'b'],
    balanced: ['b', 'c'],
    premium: ['c', 'd'],
  } as const;

  it('returns the LOWEST band a slot appears in', () => {
    expect(slotQualityBand('a', bands, PROFILE_ORDER)).toBe('economy');
    expect(slotQualityBand('b', bands, PROFILE_ORDER)).toBe('economy');
    expect(slotQualityBand('c', bands, PROFILE_ORDER)).toBe('balanced');
    expect(slotQualityBand('d', bands, PROFILE_ORDER)).toBe('premium');
  });

  it('returns null for a slot in no band', () => {
    expect(slotQualityBand('zzz', bands, PROFILE_ORDER)).toBeNull();
  });
});

describe('orderPreferredSlotsForTaskFamily · the permutation invariant', () => {
  it('returns exactly the input members for every family/task/profile combination', () => {
    for (const family of TASK_FAMILIES) {
      for (const taskType of taskFamilyPolicy(family)!.appliesToTaskTypes) {
        for (const profile of PROFILE_ORDER) {
          const input = taskInput(family, taskType, profile, fakeCents);
          const ordering = orderPreferredSlotsForTaskFamily(input);
          expect(ordering, `${family}/${taskType}/${profile}`).not.toBeNull();
          expect([...ordering!.slots].sort()).toEqual([...input.preferredSlots].sort());
          expect(ordering!.slots).toHaveLength(input.preferredSlots.length);
        }
      }
    }
  });

  it('holds as a property over randomised synthetic candidate sets', () => {
    let seed = 20260805;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const slotIds = Array.from({ length: 12 }, (_, index) => `slot_${index}`);
    const slots = Object.fromEntries(
      slotIds.map((slotId, index) => [slotId, { modelKey: `model_${index}` }]),
    );
    let sawNonEmptyHead = false;
    let sawRejection = false;

    for (let iteration = 0; iteration < 250; iteration += 1) {
      const size = 1 + Math.floor(next() * slotIds.length);
      const candidates = [...slotIds].sort(() => next() - 0.5).slice(0, size);
      const bands: Record<RoutingProfile, string[]> = {
        economy: candidates.filter(() => next() < 0.5),
        balanced: candidates.filter(() => next() < 0.5),
        premium: candidates.filter(() => next() < 0.5),
      };
      const ordering = orderPreferredSlotsForTaskFamily({
        family: 'web_grounded_answer',
        taskType: 'general',
        preferredSlots: candidates,
        preferredSlotsByProfile: bands,
        profileOrder: PROFILE_ORDER,
        slots,
        estimateCents: () => next() * 10,
      });
      expect(ordering).not.toBeNull();
      expect([...ordering!.slots].sort()).toEqual([...candidates].sort());
      expect(ordering!.slots.slice(0, ordering!.aboveFloor.length)).toEqual([
        ...ordering!.aboveFloor,
      ]);
      sawNonEmptyHead ||= ordering!.aboveFloor.length > 0;
      sawRejection ||= ordering!.rejections.length > 0;
    }
    expect(sawNonEmptyHead).toBe(true);
    expect(sawRejection).toBe(true);
  });
});

describe('orderPreferredSlotsForTaskFamily · floor and cost', () => {
  it('ranks the floor-meeting head by ascending cost', () => {
    const ordering = orderPreferredSlotsForTaskFamily(
      taskInput('code_execution', 'coding', 'premium', fakeCents),
    )!;
    const costs = ordering.aboveFloor.map((slotId) => fakeCents(policy.slots[slotId]!.modelKey));
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });

  it('breaks cost ties by the curator authored order', () => {
    const ordering = orderPreferredSlotsForTaskFamily({
      family: 'web_grounded_answer',
      taskType: 'general',
      preferredSlots: ['first', 'second', 'third'],
      preferredSlotsByProfile: { economy: ['first', 'second', 'third'] },
      profileOrder: PROFILE_ORDER,
      slots: { first: { modelKey: 'a' }, second: { modelKey: 'b' }, third: { modelKey: 'c' } },
      estimateCents: () => 1,
    })!;
    expect(ordering.aboveFloor).toEqual(['first', 'second', 'third']);
  });

  it('keeps the authored order and says so when nothing meets the floor', () => {
    const ordering = orderPreferredSlotsForTaskFamily(
      taskInput('vision', 'multimodal', 'economy', fakeCents),
    )!;
    expect(ordering.aboveFloor).toEqual([]);
    expect(ordering.reasonCode).toBe('task_family_floor_unmet');
    expect(ordering.slots).toEqual(policy.tasks['multimodal']!.preferredSlots.economy);
  });

  it('records a per-slot reason for every floor rejection', () => {
    const ordering = orderPreferredSlotsForTaskFamily(
      taskInput('vision', 'multimodal', 'economy', fakeCents),
    )!;
    expect(ordering.rejections.length).toBeGreaterThan(0);
    for (const rejection of ordering.rejections) {
      expect(rejection.reasons.length).toBeGreaterThan(0);
      expect(rejection.slotId).not.toBe('');
    }
  });

  it('fails a candidate closed when a named benchmark score is missing', () => {
    const ordering = orderPreferredSlotsForTaskFamily({
      family: 'simple_chat',
      taskType: 'simple_chat',
      preferredSlots: ['workhorse_general'],
      preferredSlotsByProfile: { economy: ['workhorse_general'] },
      profileOrder: PROFILE_ORDER,
      slots: policy.slots,
      estimateCents: fakeCents,
    })!;
    expect(ordering.aboveFloor).toEqual(['workhorse_general']);
    const benchmarks = (
      modelRegistry as unknown as { benchmarks: Record<string, Record<string, number>> }
    ).benchmarks;
    expect(benchmarks[WORKHORSE_MODEL_ID]).toEqual({});
  });

  it('rejects an unresolvable slot rather than assuming it passes', () => {
    const ordering = orderPreferredSlotsForTaskFamily({
      family: 'simple_chat',
      taskType: 'simple_chat',
      preferredSlots: ['ghost_slot'],
      preferredSlotsByProfile: { economy: ['ghost_slot'] },
      profileOrder: PROFILE_ORDER,
      slots: {},
      estimateCents: fakeCents,
    })!;
    expect(ordering.aboveFloor).toEqual([]);
    expect(ordering.rejections[0]?.reasons[0]).toContain('missing');
  });

  it('derives the escalation ladder as an ascending curator-band ladder, not a naive reverse', () => {
    const ordering = orderPreferredSlotsForTaskFamily(
      taskInput('code_execution', 'coding', 'premium', fakeCents),
    )!;
    expect(ordering.escalationLadder).toEqual([
      CODING_BALANCED_MODEL_ID,
      CODING_ESCALATION_MODEL_ID,
      CODING_PREMIUM_MODEL_ID,
    ]);
  });

  it('never descends the curator band ladder for any family/task/profile (Decision #10)', () => {
    for (const family of TASK_FAMILIES) {
      const familyPolicy = taskFamilyPolicy(family);
      if (!familyPolicy) continue;
      for (const taskType of familyPolicy.appliesToTaskTypes) {
        if (!policy.tasks[taskType]) continue;
        for (const profile of PROFILE_ORDER) {
          const input = taskInput(family, taskType, profile, fakeCents);
          if (!input.preferredSlots || input.preferredSlots.length === 0) continue;
          const ordering = orderPreferredSlotsForTaskFamily(input);
          if (!ordering) continue;

          const bandIndexOf = (modelKey: string): number =>
            Math.min(
              ...input.preferredSlots
                .filter((slotId) => input.slots[slotId]?.modelKey === modelKey)
                .map((slotId) => {
                  const band = slotQualityBand(
                    slotId,
                    input.preferredSlotsByProfile,
                    input.profileOrder,
                  );
                  return band === null ? -1 : input.profileOrder.indexOf(band);
                }),
            );

          const indexes = ordering.escalationLadder.map(bandIndexOf);
          for (let i = 1; i < indexes.length; i += 1) {
            expect(
              indexes[i],
              `${family}/${taskType}/${profile} ladder descends: ${ordering.escalationLadder.join(' → ')}`,
            ).toBeGreaterThanOrEqual(indexes[i - 1]!);
          }
        }
      }
    }
  });
});

describe('resolveTaskFamilyOrdering · reason codes', () => {
  const base = taskInput('simple_chat', 'simple_chat', 'economy', fakeCents);

  it('reports the disabled flag', () => {
    expect(resolveTaskFamilyOrdering({ ...base, enabled: false }).reasonCode).toBe(
      'task_family_stage_disabled',
    );
  });

  it('reports an unclassified request', () => {
    expect(resolveTaskFamilyOrdering({ ...base, family: null, enabled: true })).toEqual({
      family: null,
      reasonCode: 'task_family_unclassified',
    });
  });

  it('reports a family the curated policy does not declare', () => {
    expect(
      resolveTaskFamilyOrdering({
        ...base,
        family: 'not_a_family' as TaskFamily,
        enabled: true,
      }).reasonCode,
    ).toBe('task_family_no_policy');
  });

  it('reports a family/task mismatch instead of applying anyway', () => {
    expect(
      resolveTaskFamilyOrdering({ ...base, taskType: 'coding', enabled: true }).reasonCode,
    ).toBe('task_family_task_mismatch');
  });

  it('reports an empty candidate set', () => {
    expect(
      resolveTaskFamilyOrdering({ ...base, preferredSlots: [], enabled: true }).reasonCode,
    ).toBe('task_family_no_candidates');
  });

  it('reports an applied ordering', () => {
    const decision = resolveTaskFamilyOrdering({ ...base, enabled: true });
    expect(decision.reasonCode).toBe('task_family_ordering_applied');
    expect(decision.ordering?.slots).toHaveLength(base.preferredSlots.length);
  });
});

describe('resolveAutoRoute integration · admission is never widened', () => {
  const managed = { trustMode: 'managed_cloud', runtimeProfileId: 'web/cloud-chat' } as const;

  it('changes nothing while the stage is off', () => {
    for (const family of TASK_FAMILIES) {
      for (const taskType of taskFamilyPolicy(family)!.appliesToTaskTypes) {
        for (const subscriptionTier of ['free', 'pro', 'max']) {
          const off = resolveAutoRoute({
            selection: 'auto',
            taskType,
            subscriptionTier,
            ...managed,
          });
          const withFamilyButDisabled = resolveAutoRoute({
            selection: 'auto',
            taskType,
            subscriptionTier,
            taskFamily: family,
            enableTaskFamilyStage: false,
            ...managed,
          });
          expect(withFamilyButDisabled).toMatchObject(
            off.status === 'selected'
              ? { status: 'selected', modelKey: off.modelKey, reason: off.reason }
              : { status: 'unavailable', code: off.code },
          );
        }
      }
    }
  });

  it('never selects a model the tier could not already reach', () => {
    for (const family of TASK_FAMILIES) {
      for (const taskType of taskFamilyPolicy(family)!.appliesToTaskTypes) {
        for (const subscriptionTier of ['free', 'pro', 'max']) {
          const on = resolveAutoRoute({
            selection: 'auto',
            taskType,
            subscriptionTier,
            taskFamily: family,
            enableTaskFamilyStage: true,
            ...managed,
          });
          if (on.status !== 'selected') continue;
          const allowedModels = new Set(
            (
              modelRegistry as unknown as {
                policies: { auto: { tierAllowedSlots: Record<string, string[]> } };
              }
            ).policies.auto.tierAllowedSlots[subscriptionTier]!.map(
              (slotId) => policy.slots[slotId]!.modelKey,
            ),
          );
          expect(allowedModels, `${family}/${taskType}/${subscriptionTier}`).toContain(on.modelKey);
        }
      }
    }
  });

  it('never turns an unavailable route into an available one', () => {
    for (const subscriptionTier of ['free', 'pro', 'max']) {
      const off = resolveAutoRoute({
        selection: 'auto',
        taskType: 'computer-use',
        subscriptionTier,
        ...managed,
      });
      const on = resolveAutoRoute({
        selection: 'auto',
        taskType: 'computer-use',
        subscriptionTier,
        taskFamily: 'screen_automation',
        enableTaskFamilyStage: true,
        ...managed,
      });
      expect(off.status).toBe('unavailable');
      expect(on.status).toBe('unavailable');
    }
  });

  it('picks the cheapest floor-meeting slot and names the reason', () => {
    const on = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      taskFamily: 'code_execution',
      enableTaskFamilyStage: true,
      ...managed,
    });
    const off = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      ...managed,
    });
    expect(off).toMatchObject({ status: 'selected', modelKey: CODING_PREMIUM_MODEL_ID });
    expect(on).toMatchObject({
      status: 'selected',
      modelKey: CODING_ESCALATION_MODEL_ID,
      effectiveProfile: 'premium',
      reason: 'task_family_pareto',
    });
    expect(on.status === 'selected' && on.taskFamilyDecision?.reasonCode).toBe(
      'task_family_ordering_applied',
    );
  });

  it('carries a stage decision on every Auto resolution that reaches the walk', () => {
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'general',
      subscriptionTier: 'pro',
      ...managed,
    });
    expect(decision.status).toBe('selected');
    expect(decision.status === 'selected' && decision.taskFamilyDecision).toEqual({
      family: null,
      reasonCode: 'task_family_stage_disabled',
    });
  });

  it('is gated by the operator env when no explicit override is supplied', () => {
    const original = process.env[TASK_FAMILY_STAGE_ENV];
    const request = {
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      taskFamily: 'code_execution',
      ...managed,
    } as const;
    try {
      delete process.env[TASK_FAMILY_STAGE_ENV];
      expect(resolveAutoRoute(request)).toMatchObject({ modelKey: CODING_PREMIUM_MODEL_ID });
      process.env[TASK_FAMILY_STAGE_ENV] = '1';
      expect(resolveAutoRoute(request)).toMatchObject({ modelKey: CODING_ESCALATION_MODEL_ID });
      expect(resolveAutoRoute({ ...request, enableTaskFamilyStage: false })).toMatchObject({
        modelKey: CODING_PREMIUM_MODEL_ID,
      });
    } finally {
      if (original === undefined) delete process.env[TASK_FAMILY_STAGE_ENV];
      else process.env[TASK_FAMILY_STAGE_ENV] = original;
    }
  });

  it('feeds the resolver ladder straight into escalation-only continuity', () => {
    const on = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      taskFamily: 'code_execution',
      enableTaskFamilyStage: true,
      ...managed,
    });
    expect(on.status).toBe('selected');
    const ladder =
      on.status === 'selected' ? on.taskFamilyDecision!.ordering!.escalationLadder : [];
    expect(ladder).toEqual([
      CODING_ESCALATION_MODEL_ID,
      CODING_BALANCED_MODEL_ID,
      CODING_PREMIUM_MODEL_ID,
    ]);

    const pinned = decideTaskFamilyContinuity({
      session: {
        family: 'code_execution',
        modelKey: CODING_ESCALATION_MODEL_ID,
        priorTurnCount: 2,
      },
      nextFamily: 'code_execution',
      candidateModelKey: CODING_ESCALATION_MODEL_ID,
      ladder,
    });
    expect(pinned).toMatchObject({ action: 'pin', modelKey: CODING_ESCALATION_MODEL_ID });

    const escalated = decideTaskFamilyContinuity({
      session: {
        family: 'code_execution',
        modelKey: CODING_ESCALATION_MODEL_ID,
        priorTurnCount: 2,
      },
      nextFamily: 'code_execution',
      candidateModelKey: CODING_BALANCED_MODEL_ID,
      ladder,
      failureSignal: `Insufficient credits for ${CODING_ESCALATION_MODEL_ID}, switched to ${CODING_BALANCED_MODEL_ID}`,
    });
    expect(escalated).toMatchObject({
      action: 'escalate',
      reasonCode: 'escalated_on_failure',
      modelKey: CODING_BALANCED_MODEL_ID,
    });
    expect(escalated.cache?.resetsCache).toBe(true);
  });

  it('leaves an explicit model selection untouched', () => {
    const explicit = resolveAutoRoute({
      selection: CODING_BALANCED_MODEL_ID,
      taskType: 'coding',
      subscriptionTier: 'max',
      taskFamily: 'code_execution',
      enableTaskFamilyStage: true,
      ...managed,
    });
    expect(explicit).toMatchObject({
      status: 'selected',
      modelKey: CODING_BALANCED_MODEL_ID,
      reason: 'explicit',
    });
  });
});

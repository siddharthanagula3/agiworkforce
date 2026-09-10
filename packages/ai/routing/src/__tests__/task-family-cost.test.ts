import { describe, expect, it } from 'vitest';

import { modelRegistry } from '@agiworkforce/model-registry';

import type { RoutingProfile } from '../auto';
import {
  effectiveQualityFloor,
  expectedMicroUsdFromCents,
  orderPreferredSlotsForTaskFamily,
  recordTaskFamilySelection,
  resolveTaskFamilyOrdering,
  type TaskFamilyOrderingInput,
  type TaskFamilySlotCost,
} from '../task-family-routing';

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
const CODING_SLOTS = policy.tasks.coding!.preferredSlots;
const BALANCED_SLOTS = CODING_SLOTS.balanced;
const BELOW_FLOOR_SLOT = BALANCED_SLOTS.find(
  (slotId) => CODING_SLOTS.economy.includes(slotId) && !CODING_SLOTS.premium.includes(slotId),
)!;

function codingInput(
  estimateRoute?: (modelKey: string) => TaskFamilySlotCost | null,
): TaskFamilyOrderingInput {
  return {
    family: 'code_execution',
    taskType: 'coding',
    preferredSlots: BALANCED_SLOTS,
    preferredSlotsByProfile: CODING_SLOTS,
    profileOrder: policy.profileOrder,
    slots: policy.slots,
    estimateCents: () => 1,
    ...(estimateRoute ? { estimateRoute } : {}),
  };
}

function costsBySlot(costs: Record<string, TaskFamilySlotCost | null>) {
  return (modelKey: string): TaskFamilySlotCost | null => {
    const slotId = BALANCED_SLOTS.find(
      (candidate) => policy.slots[candidate]?.modelKey === modelKey,
    );
    return slotId === undefined ? null : (costs[slotId] ?? null);
  };
}

describe('effectiveQualityFloor', () => {
  it('keeps an authored band', () => {
    const floor = effectiveQualityFloor(
      { minimumSlotBand: 'premium' },
      BALANCED_SLOTS,
      CODING_SLOTS,
      policy.profileOrder,
    );
    expect(floor.minimumSlotBand).toBe('premium');
  });

  it('derives the band of the first authored slot when a family names none', () => {
    const floor = effectiveQualityFloor({}, BALANCED_SLOTS, CODING_SLOTS, policy.profileOrder);
    const firstSlot = BALANCED_SLOTS[0]!;
    const expected = policy.profileOrder.find((profile) =>
      CODING_SLOTS[profile]?.includes(firstSlot),
    );
    expect(floor.minimumSlotBand).toBe(expected);
  });

  it('leaves the floor alone when no slot is authored', () => {
    const floor = effectiveQualityFloor({}, [], CODING_SLOTS, policy.profileOrder);
    expect(floor.minimumSlotBand).toBeUndefined();
  });
});

describe('cost ordering over the admitted set', () => {
  const aboveFloorSlots = BALANCED_SLOTS.filter((slotId) => slotId !== BELOW_FLOOR_SLOT);

  it('orders floor-passing slots by ascending route cost', () => {
    const costs = Object.fromEntries(
      aboveFloorSlots.map((slotId, index) => [
        slotId,
        { routeId: `${slotId}/route`, cents: aboveFloorSlots.length - index },
      ]),
    );
    const ordering = orderPreferredSlotsForTaskFamily(codingInput(costsBySlot(costs)))!;
    expect(ordering.aboveFloor).toEqual([...aboveFloorSlots].reverse());
    expect(ordering.slots).toEqual([...aboveFloorSlots].reverse().concat(BELOW_FLOOR_SLOT));
    expect(ordering.reasonCode).toBe('task_family_ordering_applied');
    expect(ordering.floorBand).toBe('balanced');
  });

  it('breaks a cost tie on the authored order', () => {
    const costs = Object.fromEntries(
      aboveFloorSlots.map((slotId) => [slotId, { routeId: `${slotId}/route`, cents: 5 }]),
    );
    const ordering = orderPreferredSlotsForTaskFamily(codingInput(costsBySlot(costs)))!;
    expect(ordering.aboveFloor).toEqual(aboveFloorSlots);
  });

  it('sinks a slot that no route can serve behind every priced candidate', () => {
    const [firstAbove, ...rest] = aboveFloorSlots;
    const costs: Record<string, TaskFamilySlotCost | null> = { [firstAbove!]: null };
    rest.forEach((slotId, index) => {
      costs[slotId] = { routeId: `${slotId}/route`, cents: 100 + index };
    });
    const ordering = orderPreferredSlotsForTaskFamily(codingInput(costsBySlot(costs)))!;
    expect(ordering.aboveFloor.at(-1)).toBe(firstAbove);
    expect([...ordering.slots].sort()).toEqual([...BALANCED_SLOTS].sort());
    const unpriced = ordering.candidates.find((candidate) => candidate.slotId === firstAbove)!;
    expect(unpriced.expectedMicroUsd).toBeNull();
    expect(unpriced.aboveFloor).toBe(true);
  });

  it('prices each model once', () => {
    const seen: string[] = [];
    orderPreferredSlotsForTaskFamily(
      codingInput((modelKey) => {
        seen.push(modelKey);
        return { routeId: `${modelKey}/route`, cents: 1 };
      }),
    );
    expect(seen.length).toBe(new Set(seen).size);
  });

  it('records every candidate in final order with its route and microUSD', () => {
    const costs = Object.fromEntries(
      BALANCED_SLOTS.map((slotId, index) => [
        slotId,
        { routeId: `${slotId}/route`, cents: 0.5 + index },
      ]),
    );
    const ordering = orderPreferredSlotsForTaskFamily(codingInput(costsBySlot(costs)))!;
    expect(ordering.candidates.map((candidate) => candidate.slotId)).toEqual([...ordering.slots]);
    for (const candidate of ordering.candidates) {
      const cost = costs[candidate.slotId]!;
      expect(candidate.routeId).toBe(cost.routeId);
      expect(candidate.expectedMicroUsd).toBe(expectedMicroUsdFromCents(cost.cents));
    }
    expect(ordering.candidates.filter((candidate) => candidate.aboveFloor).length).toBe(
      ordering.aboveFloor.length,
    );
  });

  it('falls back to the list-price estimate when no route pricer is supplied', () => {
    const ordering = orderPreferredSlotsForTaskFamily(codingInput())!;
    for (const candidate of ordering.candidates) {
      expect(candidate.routeId).toBeNull();
      expect(candidate.expectedMicroUsd).toBe(expectedMicroUsdFromCents(1));
    }
  });
});

describe('stage decision record', () => {
  it('reports the kill switch without an ordering', () => {
    const decision = resolveTaskFamilyOrdering({ ...codingInput(), enabled: false });
    expect(decision).toEqual({
      family: 'code_execution',
      reasonCode: 'task_family_stage_disabled',
    });
    expect(
      recordTaskFamilySelection(decision, {
        slotId: null,
        modelKey: policy.slots[BALANCED_SLOTS[0]!]!.modelKey,
        routeId: 'unused',
        expectedMicroUsd: null,
      }),
    ).toEqual(decision);
  });

  it('attaches the selection to an applied ordering', () => {
    const decision = resolveTaskFamilyOrdering({ ...codingInput(), enabled: true });
    expect(decision.reasonCode).toBe('task_family_ordering_applied');
    const selected = {
      slotId: decision.ordering!.aboveFloor[0]!,
      modelKey: policy.slots[decision.ordering!.aboveFloor[0]!]!.modelKey,
      routeId: 'chosen/route',
      expectedMicroUsd: expectedMicroUsdFromCents(1),
    };
    expect(recordTaskFamilySelection(decision, selected).selected).toEqual(selected);
  });
});

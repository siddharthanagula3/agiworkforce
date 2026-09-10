import { describe, expect, it } from 'vitest';

import { modelRegistry } from '@agiworkforce/model-registry';

import { resolveAutoRoute, type AutoRoutingRequest, type RoutingProfile } from '../auto';
import { TASK_FAMILY_STAGE_ENV } from '../task-family-routing';

const registry = modelRegistry as unknown as {
  routes: Record<
    string,
    {
      modelKey: string;
      provider: string;
      selectable: boolean;
      availability: string;
      commercialStatus: string;
      trustModes: string[];
      pricing: { inputPerMillion?: number; outputPerMillion?: number };
    }
  >;
  capabilities: Record<string, Record<string, boolean>>;
  policies: {
    auto: {
      profileOrder: RoutingProfile[];
      slots: Record<string, { modelKey: string }>;
      tasks: Record<string, { preferredSlots: Record<RoutingProfile, string[]> }>;
    };
  };
};
const policy = registry.policies.auto;

const INPUT_TOKENS = 4_000;
const OUTPUT_TOKENS = 1_000;
const TOKENS_PER_PRICED_MILLION = 1_000_000;
const CENTS_PER_USD = 100;
const CONTINUITY_RATIO = 2;

const MANAGED = {
  trustMode: 'managed_cloud',
  runtimeProfileId: 'web/cloud-chat',
  estimatedInputTokens: INPUT_TOKENS,
  estimatedOutputTokens: OUTPUT_TOKENS,
  enableTaskFamilyStage: true,
} as const satisfies Partial<AutoRoutingRequest>;

function managedRoutes(modelKey: string) {
  return Object.entries(registry.routes).filter(
    ([, route]) =>
      route.modelKey === modelKey &&
      route.trustModes.includes('managed_cloud') &&
      route.selectable &&
      route.availability === 'live' &&
      route.commercialStatus !== 'blocked' &&
      route.commercialStatus !== 'experimental_only',
  );
}

/** The same arithmetic the ranker uses, recomputed from the price sheet. */
function cheapestManagedCents(modelKey: string, providers?: ReadonlySet<string>): number | null {
  const prices = managedRoutes(modelKey)
    .filter(([, route]) => !providers || providers.has(route.provider))
    .map(
      ([, route]) =>
        ((INPUT_TOKENS * (route.pricing.inputPerMillion ?? 0) +
          OUTPUT_TOKENS * (route.pricing.outputPerMillion ?? 0)) /
          TOKENS_PER_PRICED_MILLION) *
        CENTS_PER_USD,
    );
  return prices.length === 0 ? null : Math.min(...prices);
}

function providersOf(modelKey: string): Set<string> {
  return new Set(managedRoutes(modelKey).map(([, route]) => route.provider));
}

function slotBand(taskType: string, slotId: string): RoutingProfile | null {
  const byProfile = policy.tasks[taskType]!.preferredSlots;
  for (const profile of policy.profileOrder) {
    if (byProfile[profile]?.includes(slotId)) return profile;
  }
  return null;
}

describe('cost-aware Auto · floor first, then price', () => {
  it('picks the cheapest floor-passing slot for a general chat turn on pro', () => {
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'general',
      subscriptionTier: 'pro',
      taskFamily: 'general_chat',
      ...MANAGED,
    });
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;

    const authored = policy.tasks.general!.preferredSlots.balanced;
    const priced = authored
      .map((slotId) => ({
        slotId,
        modelKey: policy.slots[slotId]!.modelKey,
        cents: cheapestManagedCents(policy.slots[slotId]!.modelKey),
      }))
      .filter(
        (entry): entry is { slotId: string; modelKey: string; cents: number } =>
          entry.cents !== null,
      )
      .sort((left, right) => left.cents - right.cents);

    expect(priced.length).toBeGreaterThan(1);
    expect(decision.modelKey).toBe(priced[0]!.modelKey);
    expect(decision.modelKey).not.toBe(policy.slots[authored[0]!]!.modelKey);
    expect(decision.reason).toBe('task_family_pareto');
  });

  it('lets a simple chat turn on pro stay on the economy band', () => {
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'simple_chat',
      subscriptionTier: 'pro',
      taskFamily: 'simple_chat',
      ...MANAGED,
    });
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.effectiveProfile).toBe('economy');
    expect(decision.taskFamilyDecision?.ordering?.floorBand).toBe('economy');
    const balancedLeader =
      policy.slots[policy.tasks.simple_chat!.preferredSlots.balanced[0]!]!.modelKey;
    expect(cheapestManagedCents(decision.modelKey)!).toBeLessThan(
      cheapestManagedCents(balancedLeader)!,
    );
  });

  it('never drops coding below the balanced band on pro', () => {
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'pro',
      taskFamily: 'code_execution',
      ...MANAGED,
    });
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;

    const ordering = decision.taskFamilyDecision?.ordering;
    expect(ordering?.floorBand).toBe('balanced');
    const chosenSlot = decision.taskFamilyDecision?.selected?.slotId;
    expect(chosenSlot).toBeTruthy();
    const band = slotBand('coding', chosenSlot!);
    expect(policy.profileOrder.indexOf(band!)).toBeGreaterThanOrEqual(
      policy.profileOrder.indexOf('balanced'),
    );
    const economyOnly = policy.tasks.coding!.preferredSlots.economy.filter(
      (slotId) => slotBand('coding', slotId) === 'economy',
    );
    expect(ordering!.aboveFloor.some((slotId) => economyOnly.includes(slotId))).toBe(false);
  });

  it('keeps a reasoning-capable slot for reasoning on max', () => {
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'reasoning',
      subscriptionTier: 'max',
      taskFamily: 'extended_thinking',
      ...MANAGED,
    });
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(registry.capabilities[decision.modelKey]?.reasoning).toBe(true);
    for (const slotId of decision.taskFamilyDecision!.ordering!.aboveFloor) {
      expect(registry.capabilities[policy.slots[slotId]!.modelKey]?.reasoning).toBe(true);
    }
  });

  it('skips a slot whose routes carry no available credential', () => {
    const balanced = policy.slots.coding_balanced!.modelKey;
    const escalation = policy.slots.escalation_coding!.modelKey;
    const escalationProviders = providersOf(escalation);
    const availableProviderIds = new Set(
      [...providersOf(balanced)].filter((provider) => !escalationProviders.has(provider)),
    );
    expect(availableProviderIds.size).toBeGreaterThan(0);
    expect(cheapestManagedCents(escalation)).toBeLessThan(cheapestManagedCents(balanced)!);

    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'pro',
      taskFamily: 'code_execution',
      availableProviderIds,
      ...MANAGED,
    });
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.modelKey).toBe(balanced);
    const skipped = decision.taskFamilyDecision!.ordering!.candidates.find(
      (candidate) => candidate.modelKey === escalation,
    );
    expect(skipped?.expectedMicroUsd).toBeNull();
    expect(skipped?.routeId).toBeNull();
  });
});

describe('cost-aware Auto · flag, continuity and explicit selection', () => {
  it('restores the authored order under the kill switch', () => {
    const original = process.env[TASK_FAMILY_STAGE_ENV];
    const request = {
      selection: 'auto',
      taskType: 'general',
      subscriptionTier: 'pro',
      taskFamily: 'general_chat',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
      estimatedInputTokens: INPUT_TOKENS,
      estimatedOutputTokens: OUTPUT_TOKENS,
    } as const satisfies AutoRoutingRequest;
    const authoredLeader =
      policy.slots[policy.tasks.general!.preferredSlots.balanced[0]!]!.modelKey;
    try {
      for (const value of ['0', 'false', 'off']) {
        process.env[TASK_FAMILY_STAGE_ENV] = value;
        const off = resolveAutoRoute(request);
        expect(off.status === 'selected' && off.modelKey).toBe(authoredLeader);
        expect(off.status === 'selected' && off.taskFamilyDecision?.reasonCode).toBe(
          'task_family_stage_disabled',
        );
      }
      delete process.env[TASK_FAMILY_STAGE_ENV];
      const on = resolveAutoRoute(request);
      expect(on.status === 'selected' && on.modelKey).not.toBe(authoredLeader);
    } finally {
      if (original === undefined) delete process.env[TASK_FAMILY_STAGE_ENV];
      else process.env[TASK_FAMILY_STAGE_ENV] = original;
    }
  });

  it('leaves an explicit model selection identical to the stage-off decision', () => {
    const named = policy.slots.general_balanced!.modelKey;
    const request = {
      selection: named,
      taskType: 'general',
      subscriptionTier: 'pro',
      taskFamily: 'general_chat',
      ...MANAGED,
    } as const satisfies AutoRoutingRequest;
    const withStage = resolveAutoRoute(request);
    const withoutStage = resolveAutoRoute({ ...request, enableTaskFamilyStage: false });
    expect(withStage).toEqual(withoutStage);
    expect(withStage).toMatchObject({ status: 'selected', modelKey: named, reason: 'explicit' });
  });

  it('keeps the current model until it costs more than the named ratio', () => {
    const cheap = policy.slots.workhorse_general!.modelKey;
    const dear = policy.slots.general_balanced!.modelKey;
    const ratio = cheapestManagedCents(dear)! / cheapestManagedCents(cheap)!;
    expect(ratio).toBeGreaterThan(CONTINUITY_RATIO);

    const base = {
      selection: 'auto',
      taskType: 'general',
      subscriptionTier: 'pro',
      taskFamily: 'general_chat',
      previousTaskType: 'general',
      ...MANAGED,
    } as const satisfies AutoRoutingRequest;

    const kept = resolveAutoRoute({ ...base, currentModelKey: cheap });
    expect(kept).toMatchObject({ status: 'selected', modelKey: cheap, reason: 'continuity' });

    const dropped = resolveAutoRoute({ ...base, currentModelKey: dear });
    expect(dropped.status).toBe('selected');
    expect(dropped.status === 'selected' && dropped.reason).not.toBe('continuity');
    expect(dropped.status === 'selected' && dropped.modelKey).toBe(cheap);
  });

  it('drops continuity onto a model that fails the family floor', () => {
    const belowFloor = policy.slots.workhorse_general!.modelKey;
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'pro',
      taskFamily: 'code_execution',
      currentModelKey: belowFloor,
      previousTaskType: 'coding',
      ...MANAGED,
    });
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.reason).not.toBe('continuity');
    expect(decision.modelKey).not.toBe(belowFloor);
  });

  it('records the decision inputs the web layer logs', () => {
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'general',
      subscriptionTier: 'pro',
      taskFamily: 'general_chat',
      ...MANAGED,
    });
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;

    const stage = decision.taskFamilyDecision;
    expect(stage?.family).toBe('general_chat');
    expect(stage?.reasonCode).toBe('task_family_ordering_applied');
    expect(stage?.ordering?.floorBand).toBe('economy');

    const candidates = stage!.ordering!.candidates;
    expect(candidates.map((candidate) => candidate.slotId)).toEqual([...stage!.ordering!.slots]);
    for (const candidate of candidates.filter((entry) => entry.expectedMicroUsd !== null)) {
      expect(candidate.expectedMicroUsd).toBeGreaterThan(0);
      expect(candidate.routeId).toBeTruthy();
    }
    const priced = candidates
      .filter((candidate) => candidate.aboveFloor && candidate.expectedMicroUsd !== null)
      .map((candidate) => candidate.expectedMicroUsd!);
    expect([...priced].sort((left, right) => left - right)).toEqual(priced);

    expect(stage?.selected).toEqual({
      slotId: candidates[0]!.slotId,
      modelKey: decision.modelKey,
      routeId: decision.routeId,
      expectedMicroUsd: candidates[0]!.expectedMicroUsd,
    });
  });
});

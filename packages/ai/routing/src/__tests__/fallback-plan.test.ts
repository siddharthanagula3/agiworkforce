import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import { resolveAutoRoute, type AutoRoutingRequest, type SelectedAutoRoute } from '../auto';
import type { RoutingRuntimeState } from '../runtime-state';

const AUTO_ALIAS = 'auto';
const WEB_RUNTIME_PROFILE = 'web/cloud-chat';
const MANAGED = 'managed_cloud' as const;
const PAID_TIER = 'pro';
const ECONOMY_ONLY_TIER = 'basic';
const MAX_FALLBACK_ROUTES = 4;
const PARKED_REASON = 'circuit_open' as const;

function managedAuto(overrides: Partial<AutoRoutingRequest> = {}): AutoRoutingRequest {
  return {
    selection: AUTO_ALIAS,
    taskType: 'simple_chat',
    subscriptionTier: PAID_TIER,
    trustMode: MANAGED,
    runtimeProfileId: WEB_RUNTIME_PROFILE,
    enableTaskFamilyStage: false,
    ...overrides,
  };
}

function selected(request: AutoRoutingRequest): SelectedAutoRoute {
  const decision = resolveAutoRoute(request);
  if (decision.status !== 'selected') {
    throw new Error(`expected a selection, got ${decision.code}: ${decision.reasons.join('; ')}`);
  }
  return decision;
}

function everyManagedProvider(): string[] {
  const providers = new Set<string>();
  for (const route of Object.values(modelRegistry.routes)) {
    if (route.trustModes.includes(MANAGED)) providers.add(route.provider);
  }
  return [...providers];
}

function parkedProviders(providers: readonly string[]): RoutingRuntimeState {
  return {
    routeHealth: {},
    providerHealth: Object.fromEntries(
      providers.map((provider) => [provider, { available: false, reason: PARKED_REASON }]),
    ),
    quotaPools: {},
    freeEligibility: {},
    capturedAtMs: 0,
  };
}

describe('fallback plan', () => {
  it('gives an economy-profile task on a paid tier a failover onto another provider', () => {
    const decision = selected(managedAuto());
    expect(decision.fallbacks.length).toBeGreaterThan(0);
    expect(decision.fallbacks.map((fallback) => fallback.provider)).not.toContain(
      decision.provider,
    );
  });

  it('gives the economy-only tier a failover off the primary provider', () => {
    const decision = selected(managedAuto({ subscriptionTier: ECONOMY_ONLY_TIER }));
    expect(decision.fallbacks.length).toBeGreaterThan(0);
    expect(decision.fallbacks.every((fallback) => fallback.provider !== decision.provider)).toBe(
      true,
    );
  });

  it('never repeats a provider and never exceeds the plan cap', () => {
    for (const taskType of ['simple_chat', 'general', 'coding', 'research'] as const) {
      const decision = selected(managedAuto({ taskType, subscriptionTier: 'max' }));
      const providers = [decision.provider, ...decision.fallbacks.map((entry) => entry.provider)];
      expect(new Set(providers).size).toBe(providers.length);
      expect(decision.fallbacks.length).toBeLessThanOrEqual(MAX_FALLBACK_ROUTES);
    }
  });

  it('keeps every fallback inside the same admission the primary passed', () => {
    const decision = selected(managedAuto({ taskType: 'coding' }));
    for (const fallback of decision.fallbacks) {
      const explicit = resolveAutoRoute(
        managedAuto({ taskType: 'coding', selection: fallback.modelKey }),
      );
      expect(explicit.status).toBe('selected');
    }
  });
});

describe('health-aware slot walk', () => {
  it('moves the primary off a parked provider and keeps parked routes behind live ones', () => {
    const healthy = selected(managedAuto());
    const rerouted = selected(managedAuto({ runtimeState: parkedProviders([healthy.provider]) }));
    expect(rerouted.provider).not.toBe(healthy.provider);
    expect(rerouted.reason).toBe('health_fallback');
    expect(rerouted.fallbacks.slice(0, -1).map((entry) => entry.provider)).not.toContain(
      healthy.provider,
    );
  });

  it('still selects when every provider is parked instead of stranding the request', () => {
    const healthy = selected(managedAuto());
    const decision = selected(
      managedAuto({ runtimeState: parkedProviders(everyManagedProvider()) }),
    );
    expect(decision.modelKey).toBe(healthy.modelKey);
    expect(decision.reason).toBe(healthy.reason);
  });

  it('moves the primary off a provider with no managed credential', () => {
    const healthy = selected(managedAuto());
    const credentialed = new Set(healthy.fallbacks.map((entry) => entry.provider));
    const rerouted = selected(managedAuto({ availableProviderIds: credentialed }));
    expect(rerouted.provider).not.toBe(healthy.provider);
    expect(credentialed.has(rerouted.provider)).toBe(true);
  });

  it('lets continuity yield when the current model is parked', () => {
    const healthy = selected(managedAuto({ taskType: 'coding' }));
    const stuck = selected(
      managedAuto({
        taskType: 'coding',
        currentModelKey: healthy.modelKey,
        previousTaskType: 'coding',
      }),
    );
    expect(stuck.reason).toBe('continuity');
    const moved = selected(
      managedAuto({
        taskType: 'coding',
        currentModelKey: healthy.modelKey,
        previousTaskType: 'coding',
        runtimeState: parkedProviders([healthy.provider]),
      }),
    );
    expect(moved.reason).not.toBe('continuity');
    expect(moved.provider).not.toBe(healthy.provider);
  });
});

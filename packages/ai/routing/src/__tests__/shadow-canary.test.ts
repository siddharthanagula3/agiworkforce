import {
  LIFECYCLE_STAGES,
  lifecycleStageAtOrAfter,
  modelRegistry,
} from '@agiworkforce/model-registry';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canaryBucket } from '../auto';
import type {
  AutoRouteDecision,
  AutoRoutingRequest,
  IntrinsicCapability,
  RoutingRegistryView,
} from '../auto';
import type { RoutingRuntimeState } from '../runtime-state';

const CANARY_MODEL_KEY = 'shadow-canary-test-canary';
const SHADOW_MODEL_KEY = 'shadow-canary-test-shadow';
const PROVIDER = 'shadow-canary-test-provider';
const HARNESS_ID = 'shadow-canary-test/chat-completions';

const ALIAS_ID = 'auto-balanced';
const TASK_TYPE = 'coding' as const;
const SUBSCRIPTION_TIER = 'max';
const TRUST_MODE = 'byok' as const;
const CONTEXT_TOKENS_LIMIT = 128_000;
const INPUT_PER_MILLION = 1;
const OUTPUT_PER_MILLION = 2;

const CANARY_FRACTION = 0.5;
const SHADOW_DAILY_CAP = 10;

const ALL_CAPABILITIES: Record<IntrinsicCapability, boolean> = {
  textInput: true,
  imageInput: true,
  audioInput: true,
  videoInput: true,
  textOutput: true,
  imageOutput: true,
  audioOutput: true,
  videoOutput: true,
  streaming: true,
  structuredOutput: true,
  functionCalling: true,
  reasoning: true,
};

function routeId(modelKey: string): string {
  return `${PROVIDER}/${modelKey}`;
}

function syntheticModel(modelKey: string) {
  return {
    identity: { key: modelKey, provider: PROVIDER, providerModelId: modelKey },
    lifecycle: { availability: 'live', deprecated: false },
  };
}

function syntheticRoute(modelKey: string) {
  return {
    modelKey,
    provider: PROVIDER,
    providerModelId: modelKey,
    harnessId: HARNESS_ID,
    trustModes: [TRUST_MODE, 'managed_cloud' as const],
    availability: 'live',
    selectable: true,
    isDefault: true,
    cacheClass: 'no_provider_cache' as const,
    commercialStatus: 'agi_direct' as const,
    dataRetention: 'provider_default' as const,
    pricing: {
      currency: 'USD',
      unit: 'per_million_tokens',
      inputPerMillion: INPUT_PER_MILLION,
      outputPerMillion: OUTPUT_PER_MILLION,
    },
  };
}

const CANDIDATE_KEYS = [CANARY_MODEL_KEY, SHADOW_MODEL_KEY];

/**
 * The slot this task already reaches first, given a canary and a shadow
 * candidate. Keeping the real slot and its real promoted model means the case
 * exercises the ordering the product actually uses; only the two candidates are
 * synthetic, because the live catalog deliberately declares neither.
 */
const REAL_REGISTRY = modelRegistry as unknown as RoutingRegistryView;
const SLOT_ID = (() => {
  const auto = REAL_REGISTRY.policies.auto;
  const allowed = new Set(auto.tierAllowedSlots[SUBSCRIPTION_TIER] ?? []);
  const slotId = (auto.tasks[TASK_TYPE].preferredSlots.balanced ?? []).find((candidate) =>
    allowed.has(candidate),
  );
  if (!slotId) throw new Error('no allowed slot leads this task for this tier');
  return slotId;
})();
const PROMOTED_MODEL_KEY = REAL_REGISTRY.policies.auto.slots[SLOT_ID].modelKey;

function buildSyntheticRegistry(): RoutingRegistryView {
  const base = structuredClone(modelRegistry) as unknown as RoutingRegistryView;
  return {
    ...base,
    models: {
      ...base.models,
      ...Object.fromEntries(CANDIDATE_KEYS.map((key) => [key, syntheticModel(key)])),
    },
    routes: {
      ...base.routes,
      ...Object.fromEntries(CANDIDATE_KEYS.map((key) => [routeId(key), syntheticRoute(key)])),
    },
    capabilities: {
      ...base.capabilities,
      ...Object.fromEntries(CANDIDATE_KEYS.map((key) => [key, ALL_CAPABILITIES])),
    },
    limits: {
      ...base.limits,
      ...Object.fromEntries(
        CANDIDATE_KEYS.map((key) => [key, { contextTokens: CONTEXT_TOKENS_LIMIT }]),
      ),
    },
    policies: {
      ...base.policies,
      auto: {
        ...base.policies.auto,
        slots: {
          ...base.policies.auto.slots,
          [SLOT_ID]: {
            ...base.policies.auto.slots[SLOT_ID],
            canary: { modelKey: CANARY_MODEL_KEY, trafficFraction: CANARY_FRACTION },
            shadow: { modelKey: SHADOW_MODEL_KEY, dailyRequestCap: SHADOW_DAILY_CAP },
          },
        },
      },
    },
  };
}

function unavailableRoute(id: string): RoutingRuntimeState {
  return {
    routeHealth: { [id]: { available: false, reason: 'circuit_open' } },
    providerHealth: {},
    quotaPools: {},
    freeEligibility: {},
    capturedAtMs: 0,
  };
}

async function resolve(
  request: Partial<AutoRoutingRequest>,
  mutate?: (registry: RoutingRegistryView) => void,
): Promise<AutoRouteDecision> {
  const registry = buildSyntheticRegistry();
  mutate?.(registry);
  vi.resetModules();
  vi.doMock('@agiworkforce/model-registry', () => ({
    modelRegistry: registry,
    LIFECYCLE_STAGES,
    lifecycleStageAtOrAfter,
  }));
  const { resolveAutoRoute } = await import('../auto');
  return resolveAutoRoute({
    selection: ALIAS_ID,
    taskType: TASK_TYPE,
    subscriptionTier: SUBSCRIPTION_TIER,
    trustMode: TRUST_MODE,
    enableTaskFamilyStage: false,
    ...request,
  });
}

/** A request id on each side of the declared fraction, found rather than assumed. */
function requestIdInBucket(inside: boolean): string {
  for (let index = 0; index < 1_000; index += 1) {
    const candidate = `request-${index}`;
    if (canaryBucket(candidate) < CANARY_FRACTION === inside) return candidate;
  }
  throw new Error('no request id falls on the requested side of the canary split');
}

const INSIDE_ID = requestIdInBucket(true);
const OUTSIDE_ID = requestIdInBucket(false);

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@agiworkforce/model-registry');
});

describe('canary selection', () => {
  it('serves the promoted model when the stage is off, whatever the request id', async () => {
    for (const requestId of [INSIDE_ID, OUTSIDE_ID]) {
      const decision = await resolve({ requestId, enableCanary: false });
      expect(decision).toMatchObject({
        status: 'selected',
        modelKey: PROMOTED_MODEL_KEY,
        reason: 'preferred_slot',
      });
      expect(decision).not.toHaveProperty('shadow');
    }
  });

  it('serves the canary for the fraction of request ids that hash into it', async () => {
    const inside = await resolve({ requestId: INSIDE_ID, enableCanary: true });
    expect(inside).toMatchObject({
      status: 'selected',
      modelKey: CANARY_MODEL_KEY,
      routeId: routeId(CANARY_MODEL_KEY),
      reason: 'canary',
    });

    const outside = await resolve({ requestId: OUTSIDE_ID, enableCanary: true });
    expect(outside).toMatchObject({ status: 'selected', modelKey: PROMOTED_MODEL_KEY });
  });

  it('splits a large id population close to the declared fraction', async () => {
    const ids = Array.from({ length: 2_000 }, (_, index) => `conversation-${index}`);
    const selected = ids.filter((id) => canaryBucket(id) < CANARY_FRACTION).length;
    expect(Math.abs(selected / ids.length - CANARY_FRACTION)).toBeLessThan(0.05);
  });

  it('never reaches a canary without a request id to hash', async () => {
    const decision = await resolve({ requestId: null, enableCanary: true });
    expect(decision).toMatchObject({ status: 'selected', modelKey: PROMOTED_MODEL_KEY });
  });

  it('is the same answer for the same request id, every time', async () => {
    const first = await resolve({ requestId: INSIDE_ID, enableCanary: true });
    const second = await resolve({ requestId: INSIDE_ID, enableCanary: true });
    expect(first).toEqual(second);
  });

  it('falls back to the promoted sibling when the breaker pulls the canary', async () => {
    const decision = await resolve({
      requestId: INSIDE_ID,
      enableCanary: true,
      runtimeState: unavailableRoute(routeId(CANARY_MODEL_KEY)),
    });
    expect(decision).toMatchObject({
      status: 'selected',
      modelKey: PROMOTED_MODEL_KEY,
      reason: 'preferred_slot',
    });
  });

  it('falls back to the promoted sibling when the canary loses a required capability', async () => {
    const decision = await resolve({ requestId: INSIDE_ID, enableCanary: true }, (registry) => {
      registry.capabilities[CANARY_MODEL_KEY] = { ...ALL_CAPABILITIES, functionCalling: false };
    });
    expect(decision).toMatchObject({ status: 'selected', modelKey: PROMOTED_MODEL_KEY });
  });
});

describe('shadow mirroring', () => {
  it('offers a mirror alongside the served route, never as the served route', async () => {
    const decision = await resolve({ requestId: OUTSIDE_ID, enableCanary: true });
    if (decision.status !== 'selected') throw new Error('expected a selected route');
    expect(decision.modelKey).toBe(PROMOTED_MODEL_KEY);
    expect(decision.shadow).toEqual({
      slotId: SLOT_ID,
      modelKey: SHADOW_MODEL_KEY,
      provider: PROVIDER,
      providerModelId: SHADOW_MODEL_KEY,
      routeId: routeId(SHADOW_MODEL_KEY),
      harnessId: HARNESS_ID,
      dailyRequestCap: SHADOW_DAILY_CAP,
    });
    expect(decision.fallbacks.map((fallback) => fallback.modelKey)).not.toContain(SHADOW_MODEL_KEY);
  });

  it('stops mirroring once the slot reaches its daily cap', async () => {
    const atCap = await resolve({
      requestId: OUTSIDE_ID,
      enableCanary: true,
      shadowRequestsToday: { [SLOT_ID]: SHADOW_DAILY_CAP },
    });
    expect(atCap).not.toHaveProperty('shadow');

    const belowCap = await resolve({
      requestId: OUTSIDE_ID,
      enableCanary: true,
      shadowRequestsToday: { [SLOT_ID]: SHADOW_DAILY_CAP - 1 },
    });
    expect(belowCap).toHaveProperty('shadow');
  });

  it('offers no mirror when the shadow candidate has no dispatchable route', async () => {
    const decision = await resolve({ requestId: OUTSIDE_ID, enableCanary: true }, (registry) => {
      registry.routes[routeId(SHADOW_MODEL_KEY)].selectable = false;
    });
    expect(decision).not.toHaveProperty('shadow');
  });

  it('mirrors alongside a canary as readily as alongside the promoted model', async () => {
    const decision = await resolve({ requestId: INSIDE_ID, enableCanary: true });
    if (decision.status !== 'selected') throw new Error('expected a selected route');
    expect(decision.modelKey).toBe(CANARY_MODEL_KEY);
    expect(decision.shadow?.modelKey).toBe(SHADOW_MODEL_KEY);
  });
});

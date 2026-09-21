import { modelRegistry } from '@agiworkforce/model-registry';
import {
  canAccessModelForSubscriptionTier,
  getDefaultModelFor,
  getModelMetadataById,
} from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import { resolveAutoRoute, type RoutingTaskType, type RoutingTrustMode } from '../auto';

// Auto and the explicit picker are two gates over one plan; for free they must
// agree, and both halves are derived from the compiled registry, not listed.
interface RegistryView {
  policies: {
    auto: {
      tierAllowedSlots: Record<string, readonly string[]>;
      slots: Record<string, { modelKey: string }>;
      tasks: Record<string, unknown>;
    };
  };
}

const registry = modelRegistry as unknown as RegistryView;
const FREE_TIER = 'free';
const MANAGED: RoutingTrustMode = 'managed_cloud';

const freeSlots = registry.policies.auto.tierAllowedSlots[FREE_TIER] ?? [];

describe('every slot the free tier may route to', () => {
  it('has slots at all, so free Auto has somewhere to land', () => {
    expect(freeSlots.length).toBeGreaterThan(0);
  });

  it.each([...freeSlots])('%s carries a model the free picker also admits', (slotId) => {
    const modelKey = registry.policies.auto.slots[slotId]?.modelKey;
    expect(modelKey, `${slotId} names no model`).toBeTruthy();
    expect(
      canAccessModelForSubscriptionTier(modelKey as string, FREE_TIER),
      `${slotId} routes free traffic to ${modelKey}, which the explicit picker refuses on free`,
    ).toBe(true);
  });

  it.each([...freeSlots])('%s carries a model priced at zero in and out', (slotId) => {
    const modelKey = registry.policies.auto.slots[slotId]?.modelKey as string;
    const metadata = getModelMetadataById(modelKey);
    expect(metadata, `${modelKey} is not in the compiled catalog`).toBeTruthy();
    expect(metadata?.inputCost, `${modelKey} bills for input on the free plan`).toBe(0);
    expect(metadata?.outputCost, `${modelKey} bills for output on the free plan`).toBe(0);
  });
});

// The bare resolver cannot serve agentic without a harness context, so the task
// list here is the chat set; the zero-price checks below still cover every task.
const CHAT_TASKS: readonly RoutingTaskType[] = ['simple_chat', 'general', 'coding', 'reasoning'];

const ALL_TASKS = Object.keys(registry.policies.auto.tasks) as RoutingTaskType[];

describe('a free account routed through Auto', () => {
  it.each([...CHAT_TASKS])('is served the free tier default for %s', (taskType) => {
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType,
      subscriptionTier: FREE_TIER,
      trustMode: MANAGED,
    });
    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.modelKey).toBe(getDefaultModelFor(FREE_TIER, 'chat'));
  });

  it.each([...ALL_TASKS])('is never dispatched to a priced model for %s', (taskType) => {
    const decision = resolveAutoRoute({
      selection: 'auto',
      taskType,
      subscriptionTier: FREE_TIER,
      trustMode: MANAGED,
    });
    if (decision.status !== 'selected') return;
    for (const modelKey of [decision.modelKey, ...decision.fallbacks.map((r) => r.modelKey)]) {
      expect(
        canAccessModelForSubscriptionTier(modelKey, FREE_TIER),
        `free Auto offered ${modelKey}, which the free plan may not reach`,
      ).toBe(true);
      expect(getModelMetadataById(modelKey)?.inputCost).toBe(0);
      expect(getModelMetadataById(modelKey)?.outputCost).toBe(0);
    }
  });

  it('never reaches a model whose minimum tier is above free, on any task', () => {
    for (const taskType of ALL_TASKS) {
      const decision = resolveAutoRoute({
        selection: 'auto',
        taskType,
        subscriptionTier: FREE_TIER,
        trustMode: MANAGED,
      });
      if (decision.status !== 'selected') continue;
      expect(
        getModelMetadataById(decision.modelKey)?.tierPolicy?.minTier,
        `free Auto selected ${decision.modelKey} for ${taskType}`,
      ).toBe(FREE_TIER);
    }
  });
});

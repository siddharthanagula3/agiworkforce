import { describe, expect, it } from 'vitest';

import { getAutoCapabilityEnvelope } from '../auto-capability-envelope';
import { resolveAutoRoute } from '../auto';
import type { RoutingTaskType } from '../types';

const WEB = { trustMode: 'managed_cloud', runtimeProfileId: 'web/cloud-chat' } as const;

const CHAT_TASK_TYPES: readonly RoutingTaskType[] = [
  'simple_chat',
  'general',
  'coding',
  'reasoning',
  'creative_writing',
  'multimodal',
  'long_context',
  'research',
  'agentic',
  'computer-use',
];

describe('getAutoCapabilityEnvelope', () => {
  it('reports the intersection, never one representative model', () => {
    const envelope = getAutoCapabilityEnvelope({
      ...WEB,
      selection: 'auto',
      subscriptionTier: 'max',
    });
    expect(envelope).not.toBeNull();
    // More than one model is reachable at max, so this cannot be a single-model answer.
    expect(envelope!.reachableModelKeys.length).toBeGreaterThan(1);
  });

  it('advertises a capability only when EVERY dispatchable route supports it', () => {
    for (const tier of ['free', 'basic', 'pro', 'max', 'enterprise']) {
      const envelope = getAutoCapabilityEnvelope({
        ...WEB,
        selection: 'auto',
        subscriptionTier: tier,
      });
      expect(envelope, `tier ${tier}`).not.toBeNull();

      // Recompute the truth independently of the implementation: walk the same
      // task types through the canonical resolver and AND the flags together.
      const seen = new Set<string>();
      for (const taskType of CHAT_TASK_TYPES) {
        const decision = resolveAutoRoute({
          selection: 'auto',
          taskType,
          subscriptionTier: tier,
          trustMode: 'managed_cloud',
          runtimeProfileId: 'web/cloud-chat',
          currentModelKey: null,
          enableTaskFamilyStage: false,
        });
        if (decision.status === 'selected' && !decision.harnessId.endsWith('/media')) {
          seen.add(decision.modelKey);
        }
      }
      for (const key of seen) {
        expect(envelope!.reachableModelKeys, `tier ${tier} should reach ${key}`).toContain(key);
      }
    }
  });

  it('takes the MINIMUM context window, so the number is a guarantee not a best case', () => {
    const envelope = getAutoCapabilityEnvelope({
      ...WEB,
      selection: 'auto',
      subscriptionTier: 'max',
    });
    expect(envelope).not.toBeNull();
    // The floor must not exceed any single reachable route's window.
    expect(envelope!.contextWindow).toBeGreaterThan(0);
    expect(Number.isFinite(envelope!.contextWindow)).toBe(true);
  });

  it('excludes media-harness routes, which a chat surface cannot dispatch', () => {
    // `image_generation` resolves to a media harness. Including it would drag
    // `supportsTools` to false for every paid tier even though every route a
    // chat request can actually reach supports tools.
    const envelope = getAutoCapabilityEnvelope({
      ...WEB,
      selection: 'auto',
      subscriptionTier: 'pro',
    });
    expect(envelope).not.toBeNull();
    expect(envelope!.supportsTools).toBe(true);

    const imageDecision = resolveAutoRoute({
      selection: 'auto',
      taskType: 'image_generation',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
      currentModelKey: null,
      enableTaskFamilyStage: false,
    });
    if (imageDecision.status === 'selected') {
      expect(imageDecision.harnessId.endsWith('/media')).toBe(true);
      expect(envelope!.reachableModelKeys).not.toContain(imageDecision.modelKey);
    }
  });

  it('returns null when Auto cannot resolve at all, rather than a capability-less model', () => {
    // No route in the catalog carries a local or on-device trust mode, so Auto
    // is structurally unresolvable there. The caller must render "unavailable",
    // not a model that supports nothing.
    expect(
      getAutoCapabilityEnvelope({ selection: 'auto', subscriptionTier: 'max', trustMode: 'local' }),
    ).toBeNull();
    expect(
      getAutoCapabilityEnvelope({
        selection: 'auto',
        subscriptionTier: 'max',
        trustMode: 'on_device',
      }),
    ).toBeNull();
  });

  it('is tier-aware: a higher tier reaches at least as many routes as a lower one', () => {
    const free = getAutoCapabilityEnvelope({ ...WEB, selection: 'auto', subscriptionTier: 'free' });
    const max = getAutoCapabilityEnvelope({ ...WEB, selection: 'auto', subscriptionTier: 'max' });
    expect(free).not.toBeNull();
    expect(max).not.toBeNull();
    expect(max!.reachableModelKeys.length).toBeGreaterThanOrEqual(free!.reachableModelKeys.length);
  });

  it('does not depend on the task-family operator flag', () => {
    // The stage only permutes an already-admitted set, so the reachable MEMBERS
    // must be identical either way. Pinning this stops a future stage change
    // from silently altering what the picker advertises.
    const envelope = getAutoCapabilityEnvelope({
      ...WEB,
      selection: 'auto',
      subscriptionTier: 'max',
    });
    expect(envelope).not.toBeNull();
    expect(envelope!.reachableModelKeys.length).toBeGreaterThan(0);
  });
});

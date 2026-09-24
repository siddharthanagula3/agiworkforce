import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import { resolveAutoRoute, type RoutingTrustMode } from '../auto';

interface LifecycleView {
  models: Record<
    string,
    { lifecycle: { status: string; deprecated: boolean; replacedBy: string | null } }
  >;
  retiredModels: Record<string, unknown>;
  policies: { auto: { tierAllowedSlots: Record<string, unknown> } };
}

const registry = modelRegistry as unknown as LifecycleView;
const TIERS = Object.keys(registry.policies.auto.tierAllowedSlots);
const TRUST_MODES: readonly RoutingTrustMode[] = ['managed_cloud', 'byok', 'local', 'on_device'];

const retiredKeys = Object.keys(registry.retiredModels).sort();
const endOfLifeKeys = Object.entries(registry.models)
  .filter(([, model]) => model.lifecycle.deprecated || model.lifecycle.status !== 'active')
  .map(([key]) => key)
  .sort();

// A schedule, trigger or pinned chat naming an end-of-life model is refused with a reason,
// never answered with its successor, which would change what it runs on unasked.
describe('a pinned selection of a retired or deprecated model', () => {
  it('enumerates the lifecycle states the registry records', () => {
    expect(retiredKeys.length).toBeGreaterThan(0);
    expect(endOfLifeKeys.length).toBeGreaterThan(0);
  });

  it('is refused, never resolved to another model, on every tier and trust mode', () => {
    const substituted: string[] = [];
    for (const selection of [...retiredKeys, ...endOfLifeKeys]) {
      for (const subscriptionTier of TIERS) {
        for (const trustMode of TRUST_MODES) {
          const decision = resolveAutoRoute({
            selection,
            taskType: 'general',
            subscriptionTier,
            trustMode,
            runtimeProfileId: 'web/cloud-chat',
          });
          if (decision.status === 'selected' && decision.modelKey !== selection) {
            substituted.push(
              `${selection}@${subscriptionTier}/${trustMode} -> ${decision.modelKey}`,
            );
          }
        }
      }
    }
    expect(substituted).toEqual([]);
  });

  it('names a retired id as an unknown selection rather than an ineligible one', () => {
    for (const selection of retiredKeys) {
      const decision = resolveAutoRoute({
        selection,
        taskType: 'general',
        subscriptionTier: 'max',
        trustMode: 'managed_cloud',
        runtimeProfileId: 'web/cloud-chat',
      });
      expect(decision.status === 'unavailable' && decision.code, selection).toBe(
        'unknown_selection',
      );
    }
  });

  it('keeps a replaced model refused even though its successor is live', () => {
    const replaced = endOfLifeKeys.filter((key) => registry.models[key]?.lifecycle.replacedBy);
    expect(replaced.length).toBeGreaterThan(0);
    for (const selection of replaced) {
      const decision = resolveAutoRoute({
        selection,
        taskType: 'general',
        subscriptionTier: 'max',
        trustMode: 'managed_cloud',
        runtimeProfileId: 'web/cloud-chat',
      });
      expect(decision.status, selection).toBe('unavailable');
    }
  });
});

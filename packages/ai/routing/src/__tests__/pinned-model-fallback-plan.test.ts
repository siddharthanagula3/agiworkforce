import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import { resolveAutoRoute, type AutoRoutingRequest, type SelectedAutoRoute } from '../auto';

const registryRoutes: Record<string, { harnessId: string }> = modelRegistry.routes;
const WEB_RUNTIME_PROFILE = 'web/cloud-chat';
const MANAGED = 'managed_cloud' as const;
const PAID_TIER = 'pro';

function managedPin(selection: string): AutoRoutingRequest {
  return {
    selection,
    taskType: 'simple_chat',
    subscriptionTier: PAID_TIER,
    trustMode: MANAGED,
    runtimeProfileId: WEB_RUNTIME_PROFILE,
    enableTaskFamilyStage: false,
  };
}

function managedRoutesByModel(): Map<string, string[]> {
  const byModel = new Map<string, string[]>();
  for (const [routeId, route] of Object.entries(modelRegistry.routes)) {
    if (!route.trustModes.includes(MANAGED)) continue;
    if (!route.selectable || route.availability !== 'live') continue;
    byModel.set(route.modelKey, [...(byModel.get(route.modelKey) ?? []), routeId]);
  }
  return byModel;
}

/**
 * A model the user could pin today that more than one provider can serve.
 *
 * Discovered rather than named: which model has a second route is a property
 * of the catalog, and naming one here would make this test a record of the
 * catalog on the day it was written.
 */
function pinnedModelWithASecondRoute(): { modelKey: string; decision: SelectedAutoRoute } {
  for (const [modelKey, routeIds] of managedRoutesByModel()) {
    if (routeIds.length < 2) continue;
    const decision = resolveAutoRoute(managedPin(modelKey));
    if (decision.status !== 'selected' || decision.fallbacks.length === 0) continue;
    return { modelKey, decision };
  }
  throw new Error('No managed model in the catalog offers a pinned selection a second route');
}

describe('the fallback plan for a model the user pinned', () => {
  const { modelKey, decision } = pinnedModelWithASecondRoute();

  it('serves the model that was asked for', () => {
    expect(decision.modelKey).toBe(modelKey);
    expect(decision.reason).toBe('explicit');
  });

  it('offers only the other routes of that same model', () => {
    expect(new Set(decision.fallbacks.map((fallback) => fallback.modelKey))).toEqual(
      new Set([modelKey]),
    );
  });

  it('never offers back the route it is already on', () => {
    const providers = decision.fallbacks.map((fallback) => fallback.provider);

    expect(providers).not.toContain(decision.provider);
    expect(new Set(providers).size).toBe(providers.length);
  });

  it('draws every entry from a route the registry declares for that model', () => {
    const declared = managedRoutesByModel().get(modelKey) ?? [];

    for (const fallback of decision.fallbacks) {
      expect(declared).toContain(fallback.routeId);
      expect(registryRoutes[fallback.routeId]?.harnessId).toBe(fallback.harnessId);
    }
  });
});

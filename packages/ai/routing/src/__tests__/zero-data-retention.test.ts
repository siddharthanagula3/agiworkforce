import { describe, expect, it } from 'vitest';
import { modelRegistry } from '@agiworkforce/model-registry';
import { resolveAutoRoute } from '../auto';

const MANAGED_CLOUD_TRUST_MODE = 'managed_cloud';
const OPEN_ROUTER_PROVIDER_ID = 'open_router';
const ZERO_RETENTION = 'zero_retention';
const INELIGIBLE_COMMERCIAL_STATUSES = new Set(['blocked', 'experimental_only']);

type RegistryRoute = (typeof modelRegistry.routes)[string];

function isEligibleManagedRoute(route: RegistryRoute | undefined): route is RegistryRoute {
  return (
    !!route &&
    route.selectable &&
    route.availability === 'live' &&
    route.trustModes.includes(MANAGED_CLOUD_TRUST_MODE) &&
    !INELIGIBLE_COMMERCIAL_STATUSES.has(route.commercialStatus)
  );
}

function routesForModel(modelKey: string): RegistryRoute[] {
  return Object.values(modelRegistry.routes).filter((route) => route.modelKey === modelKey);
}

function findModelWithEligibleOpenRouterRoute(): { modelKey: string; defaultProvider: string } {
  for (const route of Object.values(modelRegistry.routes)) {
    if (route.provider !== OPEN_ROUTER_PROVIDER_ID || !isEligibleManagedRoute(route)) continue;
    const model = modelRegistry.models[route.modelKey as keyof typeof modelRegistry.models] as
      | { identity: { provider: string } }
      | undefined;
    if (model) return { modelKey: route.modelKey, defaultProvider: model.identity.provider };
  }
  throw new Error('no compiled model has an eligible open_router route');
}

function findModelWithOnlyProviderDefaultRoutes(): { modelKey: string; provider: string } {
  for (const model of Object.values(modelRegistry.models) as Array<{
    identity: { key: string; provider: string };
  }>) {
    const eligible = routesForModel(model.identity.key).filter(isEligibleManagedRoute);
    if (eligible.length === 0) continue;
    if (eligible.every((route) => route.dataRetention !== ZERO_RETENTION)) {
      return { modelKey: model.identity.key, provider: model.identity.provider };
    }
  }
  throw new Error('every compiled model has an eligible zero_retention route');
}

describe('zero data retention routing policy', () => {
  it('resolves the selected route to a zero_retention route when required', () => {
    const { modelKey } = findModelWithEligibleOpenRouterRoute();

    const result = resolveAutoRoute({
      selection: modelKey,
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: MANAGED_CLOUD_TRUST_MODE,
      zeroDataRetentionOnly: true,
    });

    expect(result.status).toBe('selected');
    if (result.status !== 'selected') return;
    expect(modelRegistry.routes[result.routeId as keyof typeof modelRegistry.routes]).toMatchObject(
      { dataRetention: ZERO_RETENTION },
    );
  });

  it('excludes every route and reports unavailable for a model with no zero_retention route', () => {
    const { modelKey } = findModelWithOnlyProviderDefaultRoutes();

    const withoutZdr = resolveAutoRoute({
      selection: modelKey,
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: MANAGED_CLOUD_TRUST_MODE,
    });
    expect(withoutZdr.status).toBe('selected');

    const withZdr = resolveAutoRoute({
      selection: modelKey,
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: MANAGED_CLOUD_TRUST_MODE,
      zeroDataRetentionOnly: true,
    });
    expect(withZdr.status).toBe('unavailable');
  });

  it('re-admits a provider_default route when the caller names it as having a ZDR agreement', () => {
    const { modelKey, provider } = findModelWithOnlyProviderDefaultRoutes();

    const result = resolveAutoRoute({
      selection: modelKey,
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: MANAGED_CLOUD_TRUST_MODE,
      zeroDataRetentionOnly: true,
      zeroDataRetentionProviders: new Set([provider]),
    });

    expect(result).toMatchObject({ status: 'selected', provider });
  });
});

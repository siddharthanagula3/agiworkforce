import { describe, expect, it } from 'vitest';
import { modelRegistry } from '@agiworkforce/model-registry';
import { resolveAutoRoute } from '../auto';

const MANAGED_CLOUD_TRUST_MODE = 'managed_cloud';
const ZERO_RETENTION = 'zero_retention';
const CONDITIONAL = 'conditional';
const ZERO_DATA_RETENTION_ON_REQUEST_FEATURE = 'zeroDataRetentionOnRequest';
const IMPLEMENTED = 'implemented';
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

function honoursRequirementPerRequest(route: RegistryRoute): boolean {
  const harnesses = modelRegistry.harnesses as Record<
    string,
    { features: Record<string, { implementation: string } | undefined> } | undefined
  >;
  return (
    harnesses[route.harnessId]?.features[ZERO_DATA_RETENTION_ON_REQUEST_FEATURE]?.implementation ===
    IMPLEMENTED
  );
}

function findEligibleRoute(predicate: (route: RegistryRoute) => boolean): RegistryRoute {
  const route = Object.values(modelRegistry.routes).find(
    (candidate) => isEligibleManagedRoute(candidate) && predicate(candidate),
  );
  if (!route) throw new Error('no compiled route matches the case under test');
  return route;
}

function routesForModel(modelKey: string): RegistryRoute[] {
  return Object.values(modelRegistry.routes).filter((route) => route.modelKey === modelKey);
}

function findModelWithOnlyProviderDefaultRoutes(): { modelKey: string; provider: string } {
  for (const model of Object.values(modelRegistry.models) as Array<{
    identity: { key: string; provider: string };
  }>) {
    const eligible = routesForModel(model.identity.key).filter(isEligibleManagedRoute);
    if (eligible.length === 0) continue;
    if (
      eligible.every(
        (route) => route.dataRetention !== ZERO_RETENTION && !honoursRequirementPerRequest(route),
      )
    ) {
      return { modelKey: model.identity.key, provider: model.identity.provider };
    }
  }
  throw new Error('every compiled model has a route that guarantees zero data retention');
}

describe('zero data retention routing policy', () => {
  it('takes every route retention class straight from the provider governance record', () => {
    const governance = modelRegistry.governance as Record<string, { dataRetentionClass: string }>;
    for (const [routeId, route] of Object.entries(modelRegistry.routes)) {
      expect(governance[route.provider], `${routeId} has no governance record`).toBeDefined();
      expect(route.dataRetention).toBe(governance[route.provider]?.dataRetentionClass);
    }
  });

  it('admits a conditional route when its harness declares it honours the requirement per request', () => {
    const route = findEligibleRoute(
      (candidate) =>
        candidate.dataRetention === CONDITIONAL && honoursRequirementPerRequest(candidate),
    );

    const result = resolveAutoRoute({
      selection: route.modelKey,
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: MANAGED_CLOUD_TRUST_MODE,
      zeroDataRetentionOnly: true,
    });

    expect(result.status).toBe('selected');
    if (result.status !== 'selected') return;
    const admitted = modelRegistry.routes[result.routeId as keyof typeof modelRegistry.routes];
    expect(
      admitted.dataRetention === ZERO_RETENTION || honoursRequirementPerRequest(admitted),
    ).toBe(true);
  });

  it('refuses a model whose every route leaves the requirement undeclared', () => {
    const { modelKey } = findModelWithOnlyProviderDefaultRoutes();

    const result = resolveAutoRoute({
      selection: modelKey,
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: MANAGED_CLOUD_TRUST_MODE,
      zeroDataRetentionOnly: true,
    });

    expect(result.status).toBe('unavailable');
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

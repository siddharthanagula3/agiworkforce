import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { modelRegistry } from '@agiworkforce/model-registry';

vi.mock('server-only', () => ({}));

const GATEWAY_FLAG_ENV = 'AGI_ROUTING_GATEWAY_ROUTES';
const GATEWAY_FLAG_ON = '1';
const WEB_RUNTIME_PROFILE_ID = 'web/cloud-chat';
const MANAGED_TRUST_MODE = 'managed_cloud';
const TASK_TYPE = 'general';
const SUBSCRIPTION_TIER = 'max';
const ADMITTED_COMMERCIAL_STATUS = 'agi_direct';

interface RouteRecord {
  modelKey: string;
  provider: string;
  harnessId: string;
  isDefault: boolean;
  commercialStatus: string;
  pricing: { inputPerMillion?: number; outputPerMillion?: number };
}

type RegistryShape = {
  harnesses: Record<string, { gatewayId?: string }>;
  routes: Record<string, RouteRecord>;
};

function registryWithAdmittedGatewayRoute(): {
  registry: RegistryShape;
  modelKey: string;
  gatewayRouteId: string;
  nativeRouteId: string;
} {
  const registry = structuredClone(modelRegistry) as unknown as RegistryShape;
  const gatewayBacked = new Set(
    Object.entries(registry.harnesses)
      .filter(([, harness]) => harness.gatewayId !== undefined)
      .map(([harnessId]) => harnessId),
  );

  for (const [routeId, route] of Object.entries(registry.routes)) {
    if (!gatewayBacked.has(route.harnessId)) continue;
    const native = Object.entries(registry.routes).find(
      ([, candidate]) => candidate.modelKey === route.modelKey && candidate.isDefault,
    );
    if (!native) continue;
    const gatewayOutput = route.pricing.outputPerMillion ?? Number.POSITIVE_INFINITY;
    const nativeOutput = native[1].pricing.outputPerMillion ?? 0;
    if (gatewayOutput >= nativeOutput) continue;
    route.commercialStatus = ADMITTED_COMMERCIAL_STATUS;
    return {
      registry,
      modelKey: route.modelKey,
      gatewayRouteId: routeId,
      nativeRouteId: native[0],
    };
  }
  throw new Error('the catalog declares no gateway route cheaper than its model default');
}

async function resolveWithFlag(enabled: boolean) {
  const { registry, modelKey, gatewayRouteId, nativeRouteId } = registryWithAdmittedGatewayRoute();
  vi.resetModules();
  vi.doMock('@agiworkforce/model-registry', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@agiworkforce/model-registry')>()),
    modelRegistry: registry,
  }));
  if (enabled) process.env[GATEWAY_FLAG_ENV] = GATEWAY_FLAG_ON;
  else delete process.env[GATEWAY_FLAG_ENV];

  const { admittedHarnessIds } = await import('../gateway-routing');
  const { resolveAutoRoute } = await import('@agiworkforce/routing');
  const allowedHarnessIds = admittedHarnessIds();

  const decision = resolveAutoRoute({
    selection: modelKey,
    taskType: TASK_TYPE,
    subscriptionTier: SUBSCRIPTION_TIER,
    trustMode: MANAGED_TRUST_MODE,
    runtimeProfileId: WEB_RUNTIME_PROFILE_ID,
    ...(allowedHarnessIds ? { allowedHarnessIds } : {}),
  });
  return { decision, modelKey, gatewayRouteId, nativeRouteId };
}

describe('a gateway definition serving a curated model', () => {
  beforeEach(() => {
    delete process.env[GATEWAY_FLAG_ENV];
  });

  afterEach(() => {
    delete process.env[GATEWAY_FLAG_ENV];
    vi.resetModules();
    vi.doUnmock('@agiworkforce/model-registry');
  });

  it('serves the cheaper gateway route when the flag is on', async () => {
    const { decision, modelKey, gatewayRouteId } = await resolveWithFlag(true);

    expect(decision).toMatchObject({
      status: 'selected',
      modelKey,
      routeId: gatewayRouteId,
    });
  });

  it('serves the native route when the flag is off, and never the gateway one', async () => {
    const { decision, modelKey, nativeRouteId, gatewayRouteId } = await resolveWithFlag(false);

    expect(decision).toMatchObject({
      status: 'selected',
      modelKey,
      routeId: nativeRouteId,
    });
    if (decision.status !== 'selected') throw new Error('expected a selected route');
    expect(decision.fallbacks.map((fallback) => fallback.routeId)).not.toContain(gatewayRouteId);
  });

  it('drops only the gateway-backed harnesses from the admitted list', async () => {
    delete process.env[GATEWAY_FLAG_ENV];
    vi.resetModules();
    const { admittedHarnessIds } = await import('../gateway-routing');
    const { GATEWAY_BACKED_HARNESS_IDS, REGISTRY_HARNESS_IDS } =
      await import('@agiworkforce/types');

    const admitted = admittedHarnessIds();

    expect(admitted).toBeDefined();
    expect(GATEWAY_BACKED_HARNESS_IDS.length).toBeGreaterThan(0);
    expect([...(admitted ?? [])].sort()).toEqual(
      REGISTRY_HARNESS_IDS.filter(
        (harnessId) => !GATEWAY_BACKED_HARNESS_IDS.includes(harnessId),
      ).sort(),
    );
  });

  it('stops narrowing the admitted list once the flag is on', async () => {
    process.env[GATEWAY_FLAG_ENV] = GATEWAY_FLAG_ON;
    vi.resetModules();
    const { admittedHarnessIds } = await import('../gateway-routing');

    expect(admittedHarnessIds()).toBeUndefined();
  });
});

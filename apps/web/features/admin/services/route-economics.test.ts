import { beforeEach, describe, expect, it, vi } from 'vitest';

const NOW_MS = Date.UTC(2026, 8, 6);
const HOUR_MS = 60 * 60 * 1000;

const mocks = vi.hoisted(() => ({
  freePoolDecisions: vi.fn(),
  hasServerProviderKey: vi.fn(),
  getProtocolRouteHarness: vi.fn(),
  hasGatewayRouteCredentials: vi.fn(),
  gatewayRoutesEnabled: vi.fn(),
  getOptionalEnv: vi.fn(),
  readRouteScopeHealth: vi.fn(),
}));

const fixtures = vi.hoisted(() => {
  const DISCOUNTED_ROUTE = 'alpha/model-one';
  const LIST_ROUTE = 'beta/model-two';
  const UNGOVERNED_ROUTE = 'gamma/model-three';
  const capabilities = {
    textInput: true,
    imageInput: false,
    audioInput: null,
    videoInput: false,
    textOutput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    streaming: true,
    structuredOutput: true,
    functionCalling: true,
    reasoning: false,
  };
  return {
    DISCOUNTED_ROUTE,
    LIST_ROUTE,
    UNGOVERNED_ROUTE,
    registry: {
      routes: {
        [DISCOUNTED_ROUTE]: {
          modelKey: 'model-one',
          provider: 'alpha',
          providerModelId: 'model-one-api',
          harnessId: 'alpha/chat',
          trustModes: ['managed_cloud'],
          availability: 'live',
          selectable: true,
          isDefault: true,
          cacheClass: 'no_provider_cache',
          commercialStatus: 'agi_direct',
          dataRetention: 'zero_retention',
          pricing: {
            currency: 'USD',
            unit: 'per_million_tokens',
            inputPerMillion: 7.5,
            outputPerMillion: 30,
            cacheReadPerMillion: 0.75,
          },
          discount: {
            minPercent: 25,
            requestField: 'min_discount_percent',
            listPricing: {
              currency: 'USD',
              unit: 'per_million_tokens',
              inputPerMillion: 10,
              outputPerMillion: 40,
              cacheReadPerMillion: 1,
            },
            source: 'https://example.test/docs',
            verifiedOn: '2026-09-06',
          },
        },
        [LIST_ROUTE]: {
          modelKey: 'model-two',
          provider: 'beta',
          providerModelId: 'model-two-api',
          harnessId: 'beta/chat',
          trustModes: ['managed_cloud'],
          availability: 'live',
          selectable: true,
          isDefault: false,
          cacheClass: 'no_provider_cache',
          commercialStatus: 'authorized_marketplace',
          dataRetention: 'provider_default',
          pricing: {
            currency: 'USD',
            unit: 'per_million_tokens',
            inputPerMillion: 8,
            outputPerMillion: 32,
          },
        },
        [UNGOVERNED_ROUTE]: {
          modelKey: 'model-three',
          provider: 'gamma',
          providerModelId: 'model-three-api',
          harnessId: 'gamma/chat',
          trustModes: ['managed_cloud'],
          availability: 'unavailable',
          selectable: false,
          isDefault: false,
          cacheClass: 'no_provider_cache',
          commercialStatus: 'experimental_only',
          dataRetention: 'unknown',
          pricing: { currency: 'USD', unit: 'per_million_tokens' },
        },
      },
      models: {
        'model-one': {
          identity: { displayName: 'Model One', developer: 'labs', openWeight: false },
          lifecycle: { stage: 'promoted' },
        },
        'model-two': {
          identity: { displayName: 'Model Two', developer: 'labs', openWeight: true },
          lifecycle: { stage: 'registered' },
        },
        'model-three': { identity: {}, lifecycle: {} },
      },
      capabilities: { 'model-one': capabilities, 'model-two': capabilities },
      limits: { 'model-one': { contextTokens: 200_000 } },
      governance: {
        alpha: {
          dataRetentionClass: 'zero_retention',
          zeroDataRetentionAvailability: 'default',
          trainsOnInputs: 'never',
          residencyRegions: ['us'],
          verifiedOn: '2026-09-05',
        },
      },
    },
  };
});

const { DISCOUNTED_ROUTE, LIST_ROUTE, UNGOVERNED_ROUTE } = fixtures;

vi.mock('@agiworkforce/model-registry', () => ({ modelRegistry: fixtures.registry }));

vi.mock('@agiworkforce/types', () => ({
  getDeveloperLabel: (developerId: string) => (developerId === 'labs' ? 'Labs' : developerId),
  providerLabels: { alpha: 'Alpha' },
}));

vi.mock('@shared/utils/env', () => ({ getOptionalEnv: mocks.getOptionalEnv }));

vi.mock('@/lib/server/free-pools', () => ({ freePoolDecisions: mocks.freePoolDecisions }));

vi.mock('@/lib/services/aggregator-routing', () => ({
  dispatchProviderForRoute: (routeId: string) => routeId.split('/')[0],
  isManagedOpenRouterRoute: vi.fn(),
  openRouterSlugFor: vi.fn(),
  validateRouteSelection: vi.fn(),
}));

vi.mock('@/lib/services/gateway-routing', () => ({
  gatewayRoutesEnabled: mocks.gatewayRoutesEnabled,
  hasGatewayRouteCredentials: mocks.hasGatewayRouteCredentials,
  listCredentialedGatewayProviderIds: vi.fn(() => []),
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  getProtocolRouteHarness: mocks.getProtocolRouteHarness,
  hasServerProviderKey: mocks.hasServerProviderKey,
}));

vi.mock('./routing-health-metrics', () => ({ readRouteScopeHealth: mocks.readRouteScopeHealth }));

import { effectivePrice, readRouteEconomics, type RouteEconomicsRow } from './route-economics';

function freeEntry(routeId: string, expiresAtMs: number | null) {
  return {
    routeId,
    poolId: `${routeId}-pool`,
    window: 'day',
    limit: 500,
    unit: 'requests',
    expiresAtMs,
    hardStopsBeforePaid: true,
  };
}

function rowOf(rows: RouteEconomicsRow[], routeId: string): RouteEconomicsRow {
  const row = rows.find((candidate) => candidate.routeId === routeId);
  if (!row) throw new Error(`No row for ${routeId}`);
  return row;
}

describe('readRouteEconomics', () => {
  beforeEach(() => {
    mocks.freePoolDecisions.mockReturnValue([]);
    mocks.hasServerProviderKey.mockReturnValue(true);
    mocks.getProtocolRouteHarness.mockReturnValue(null);
    mocks.hasGatewayRouteCredentials.mockReturnValue(false);
    mocks.gatewayRoutesEnabled.mockReturnValue(false);
    mocks.getOptionalEnv.mockReturnValue(undefined);
    mocks.readRouteScopeHealth.mockResolvedValue({});
  });

  it('reads the list price from the discount record and the ceiling from the route price', async () => {
    const { routes } = await readRouteEconomics(NOW_MS);
    const row = rowOf(routes, DISCOUNTED_ROUTE);

    expect(row.listInputPerMillion).toBe(10);
    expect(row.discountPercent).toBe(25);
    expect(row.effectiveInputPerMillion).toBe(7.5);
    expect(row.effectiveOutputPerMillion).toBe(30);
  });

  it('leaves the effective price at list when the route carries no discount', async () => {
    const { routes } = await readRouteEconomics(NOW_MS);
    const row = rowOf(routes, LIST_ROUTE);

    expect(row.discountPercent).toBeNull();
    expect(row.effectiveInputPerMillion).toBe(row.listInputPerMillion);
    expect(row.effectiveOutputPerMillion).toBe(row.listOutputPerMillion);
  });

  it('reports an unpriced route as unknown rather than free', async () => {
    const { routes } = await readRouteEconomics(NOW_MS);
    const row = rowOf(routes, UNGOVERNED_ROUTE);

    expect(row.listInputPerMillion).toBeNull();
    expect(row.effectiveInputPerMillion).toBeNull();
    expect(row.contextTokens).toBeNull();
  });

  it('leaves every governance field null when the provider has no record', async () => {
    const { routes } = await readRouteEconomics(NOW_MS);
    const governed = rowOf(routes, DISCOUNTED_ROUTE);
    const ungoverned = rowOf(routes, UNGOVERNED_ROUTE);

    expect(governed.zeroDataRetention).toBe('default');
    expect(governed.residencyRegions).toEqual(['us']);
    expect(ungoverned.zeroDataRetention).toBeNull();
    expect(ungoverned.trainsOnInputs).toBeNull();
    expect(ungoverned.residencyRegions).toBeNull();
    expect(ungoverned.governanceVerifiedOn).toBeNull();
    expect(ungoverned.developerLabel).toBeNull();
    expect(ungoverned.lifecycleStage).toBeNull();
  });

  it('reads capabilities the registry leaves null as null, not false', async () => {
    const { routes } = await readRouteEconomics(NOW_MS);

    expect(rowOf(routes, DISCOUNTED_ROUTE).modality.audioInput).toBeNull();
    expect(rowOf(routes, UNGOVERNED_ROUTE).modality.textInput).toBeNull();
  });

  it('marks a route whose provider has no managed credential as not configured', async () => {
    mocks.hasServerProviderKey.mockImplementation((provider: string) => provider === 'alpha');
    const { routes } = await readRouteEconomics(NOW_MS);

    expect(rowOf(routes, DISCOUNTED_ROUTE).credentialConfigured).toBe(true);
    expect(rowOf(routes, LIST_ROUTE).credentialConfigured).toBe(false);
  });

  it('treats a gateway provider as configured only while gateway routes are on', async () => {
    mocks.hasServerProviderKey.mockReturnValue(false);
    mocks.hasGatewayRouteCredentials.mockImplementation((provider: string) => provider === 'beta');

    mocks.gatewayRoutesEnabled.mockReturnValue(false);
    expect(rowOf((await readRouteEconomics(NOW_MS)).routes, LIST_ROUTE).credentialConfigured).toBe(
      false,
    );

    mocks.gatewayRoutesEnabled.mockReturnValue(true);
    expect(rowOf((await readRouteEconomics(NOW_MS)).routes, LIST_ROUTE).credentialConfigured).toBe(
      true,
    );
  });

  it('reads a protocol route credential from the environment key its harness names', async () => {
    mocks.hasServerProviderKey.mockReturnValue(false);
    mocks.getProtocolRouteHarness.mockImplementation((provider: string) =>
      provider === 'beta' ? { apiKeyEnv: 'BETA_API_KEY' } : null,
    );
    mocks.getOptionalEnv.mockImplementation((key: string) =>
      key === 'BETA_API_KEY' ? 'configured' : undefined,
    );

    const { routes } = await readRouteEconomics(NOW_MS);

    expect(rowOf(routes, LIST_ROUTE).credentialConfigured).toBe(true);
    expect(rowOf(routes, DISCOUNTED_ROUTE).credentialConfigured).toBe(false);
  });

  it('maps a verified, unexpired pool to eligible and carries its expiry', async () => {
    const expiresAtMs = NOW_MS + HOUR_MS;
    mocks.freePoolDecisions.mockReturnValue([
      { eligible: true, entry: freeEntry(DISCOUNTED_ROUTE, expiresAtMs), eligibility: {} },
    ]);

    const { free } = rowOf((await readRouteEconomics(NOW_MS)).routes, DISCOUNTED_ROUTE);

    expect(free.status).toBe('eligible');
    expect(free.expiresAt).toBe(new Date(expiresAtMs).toISOString());
    expect(free.limit).toBe(500);
  });

  it('maps an expired verification and an unverified pool to distinct statuses', async () => {
    mocks.freePoolDecisions.mockReturnValue([
      {
        eligible: false,
        entry: freeEntry(DISCOUNTED_ROUTE, NOW_MS - HOUR_MS),
        reason: 'verification_expired',
      },
      { eligible: false, entry: freeEntry(LIST_ROUTE, null), reason: 'not_verified_free' },
    ]);

    const { routes } = await readRouteEconomics(NOW_MS);

    expect(rowOf(routes, DISCOUNTED_ROUTE).free.status).toBe('expired');
    expect(rowOf(routes, LIST_ROUTE).free.status).toBe('not_verified');
    expect(rowOf(routes, LIST_ROUTE).free.expiresAt).toBeNull();
    expect(rowOf(routes, UNGOVERNED_ROUTE).free.status).toBe('none');
  });

  it('asks for route health only for the routes the registry lists as live', async () => {
    await readRouteEconomics(NOW_MS);

    expect(mocks.readRouteScopeHealth).toHaveBeenCalledWith([DISCOUNTED_ROUTE, LIST_ROUTE], NOW_MS);
  });

  it('reports health as absent for a route the store has no scope for', async () => {
    mocks.readRouteScopeHealth.mockResolvedValue({
      [DISCOUNTED_ROUTE]: {
        state: 'degraded',
        observations: { sampleCount: 12, successRate: 0.5, ttftP50Ms: 900 },
      },
    });

    const { routes } = await readRouteEconomics(NOW_MS);

    expect(rowOf(routes, DISCOUNTED_ROUTE).health?.state).toBe('degraded');
    expect(rowOf(routes, UNGOVERNED_ROUTE).health).toBeNull();
  });
});

describe('effectivePrice', () => {
  it('returns the list price when there is no discount', () => {
    expect(effectivePrice(12.5, null)).toBe(12.5);
  });

  it('applies the discount as a percentage of the list price', () => {
    expect(effectivePrice(20, 10)).toBe(18);
  });

  it('stays unknown when the list price is unknown', () => {
    expect(effectivePrice(null, 50)).toBeNull();
  });
});

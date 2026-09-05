import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GatewayRoute, ProviderAdapter } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

vi.mock('server-only', () => ({}));

const { gatewayRoutes, flagState } = vi.hoisted(() => ({
  gatewayRoutes: [] as GatewayRoute[],
  flagState: { enabled: true },
}));

const gatewayAdapter = {
  id: 'openai',
  label: 'Gateway route adapter',
  auth: [],
  config: {},
  async catalog() {
    return [];
  },
  async *stream() {
    yield { type: 'stop' as const, reason: 'end_turn' };
  },
} satisfies ProviderAdapter;

const buildGatewayRouteAdapter = vi.fn((_providerId: string) => gatewayAdapter);

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  listProtocolRoutes: () => [],
  listGatewayRoutes: () => gatewayRoutes,
}));

vi.mock('@/lib/services/gateway-routing', () => ({
  buildGatewayRouteAdapter: (providerId: string) => buildGatewayRouteAdapter(providerId),
  gatewayRoutesEnabled: () => flagState.enabled,
  admittedHarnessIds: () => undefined,
  listCredentialedGatewayProviderIds: () => [],
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildProtocolRouteAdapter: () => gatewayAdapter,
  buildServerProviderAdapter: () => gatewayAdapter,
  listAvailableManagedProviderIds: () => new Set<string>(),
  resolveProviderFromModel: (model: string) => model,
  toGenericUpstreamError: vi.fn(),
}));

const FIXTURE_PROVIDER = 'fixture_gateway_reseller';
const FIXTURE_ANTHROPIC_PROVIDER = 'fixture_gateway_reseller_anthropic';
const FIXTURE_MODEL_KEY = 'fixture-gateway-model';
const FIXTURE_BASE_URL_ENV = 'AGI_FIXTURE_GATEWAY_BASE_URL';
const FIXTURE_KEY_ENV = 'AGI_FIXTURE_GATEWAY_API_KEY';

function gatewayRouteFixture(overrides: Partial<GatewayRoute> = {}): GatewayRoute {
  return {
    routeId: `${FIXTURE_PROVIDER}/${FIXTURE_MODEL_KEY}`,
    modelKey: FIXTURE_MODEL_KEY,
    provider: FIXTURE_PROVIDER,
    providerModelId: 'fixture-gateway-upstream',
    harnessId: 'fixture-gateway-reseller/chat-completions',
    apiFamily: 'chat_completions',
    protocol: 'openai_chat',
    hostPolicy: 'registry_declared',
    trustModes: ['managed_cloud'],
    cacheClass: 'no_provider_cache',
    commercialStatus: 'experimental_only',
    gateway: {
      id: 'fixture_gateway',
      displayName: 'Fixture Gateway',
      protocol: 'openai_chat_completions',
      baseUrlEnv: FIXTURE_BASE_URL_ENV,
      apiKeyEnv: FIXTURE_KEY_ENV,
      extraHeaderEnvs: {},
      host: 'fixture-gateway.example',
    },
    ...overrides,
  };
}

async function loadDispatchTable(): Promise<typeof import('./adapter-providers')> {
  vi.resetModules();
  return import('./adapter-providers');
}

const processed = {
  llmRequest: { usePromptCache: true, tools: [] },
} as unknown as ProcessedRequest;

describe('gateway-route dispatch', () => {
  beforeEach(() => {
    buildGatewayRouteAdapter.mockClear();
    gatewayRoutes.length = 0;
    flagState.enabled = true;
  });

  it('dispatches a gateway route through the adapter built from its definition', async () => {
    gatewayRoutes.push(gatewayRouteFixture());

    const { ADAPTER_PROVIDERS } = await loadDispatchTable();
    const entry = ADAPTER_PROVIDERS[FIXTURE_PROVIDER];
    if (!entry) throw new Error('the gateway fixture route was not dispatched');

    expect(entry.wireMode).toBe('openai-passthrough');
    expect(entry.buildAdapter(processed)).toBe(gatewayAdapter);
    expect(buildGatewayRouteAdapter).toHaveBeenCalledWith(FIXTURE_PROVIDER);
  });

  it('registers an anthropic-dialect gateway route on the legacy wire', async () => {
    gatewayRoutes.push(
      gatewayRouteFixture({
        routeId: `${FIXTURE_ANTHROPIC_PROVIDER}/${FIXTURE_MODEL_KEY}`,
        provider: FIXTURE_ANTHROPIC_PROVIDER,
        harnessId: 'fixture-gateway-reseller-anthropic/messages',
        apiFamily: 'messages',
        protocol: 'anthropic_messages',
      }),
    );

    const { ADAPTER_PROVIDERS } = await loadDispatchTable();
    const entry = ADAPTER_PROVIDERS[FIXTURE_ANTHROPIC_PROVIDER];
    if (!entry) throw new Error('the anthropic-dialect gateway fixture route was not dispatched');

    expect(entry.wireMode).toBe('legacy-web');
  });

  it('registers nothing while the gateway flag is off', async () => {
    gatewayRoutes.push(gatewayRouteFixture());
    flagState.enabled = false;

    const { ADAPTER_PROVIDERS, resolveWireMode } = await loadDispatchTable();

    expect(ADAPTER_PROVIDERS[FIXTURE_PROVIDER]).toBeUndefined();
    expect(() => resolveWireMode(FIXTURE_PROVIDER)).toThrow(FIXTURE_PROVIDER);
  });

  it('attributes an upstream failure to the gateway route provider id', async () => {
    gatewayRoutes.push(gatewayRouteFixture());

    const { ADAPTER_PROVIDERS } = await loadDispatchTable();
    const entry = ADAPTER_PROVIDERS[FIXTURE_PROVIDER];
    if (!entry) throw new Error('the gateway fixture route was not dispatched');

    const error = entry.mapError({ type: 'error', message: 'upstream refused', code: '429' });

    expect(error.message).toContain(FIXTURE_PROVIDER);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GatewayRoute, ProviderAdapter } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const { gatewayRoutes } = vi.hoisted(() => ({ gatewayRoutes: [] as GatewayRoute[] }));

const builtAdapter = {
  id: 'openai',
  label: 'Gateway adapter',
  auth: [],
  config: {},
  async catalog() {
    return [];
  },
  async *stream() {
    yield { type: 'stop' as const, reason: 'end_turn' };
  },
} satisfies ProviderAdapter;

const createGatewayAdapter = vi.fn((_gateway: unknown, _env: unknown) => builtAdapter);

vi.mock('@agiworkforce/providers-factory', () => ({
  createGatewayAdapter: (gateway: unknown, env: unknown) => createGatewayAdapter(gateway, env),
}));

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  listGatewayRoutes: () => gatewayRoutes,
}));

const FLAG_ENV = 'AGI_ROUTING_GATEWAY_ROUTES';
const FLAG_ON = '1';
const PROVIDER = 'fixture_gateway_reseller';
const BASE_URL_ENV = 'AGI_FIXTURE_GATEWAY_BASE_URL';
const KEY_ENV = 'AGI_FIXTURE_GATEWAY_API_KEY';
const DECLARED_HOST = 'fixture-gateway.example';
const DECLARED_BASE_URL = `https://${DECLARED_HOST}/v1`;
const FOREIGN_BASE_URL = 'https://fixture-gateway-attacker.example/v1';
const FIXTURE_KEY = 'fixture-gateway-credential';

const OWNED_ENV_KEYS = [FLAG_ENV, BASE_URL_ENV, KEY_ENV] as const;

function gatewayRouteFixture(): GatewayRoute {
  return {
    routeId: `${PROVIDER}/fixture-gateway-model`,
    modelKey: 'fixture-gateway-model',
    provider: PROVIDER,
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
      baseUrlEnv: BASE_URL_ENV,
      apiKeyEnv: KEY_ENV,
      extraHeaderEnvs: {},
      host: DECLARED_HOST,
    },
  };
}

async function loadModule(): Promise<typeof import('../gateway-routing')> {
  vi.resetModules();
  return import('../gateway-routing');
}

describe('building an adapter from a gateway definition', () => {
  beforeEach(() => {
    createGatewayAdapter.mockClear();
    gatewayRoutes.length = 0;
    gatewayRoutes.push(gatewayRouteFixture());
    for (const key of OWNED_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of OWNED_ENV_KEYS) delete process.env[key];
    vi.resetModules();
  });

  it('resolves the endpoint and credential from the env names the definition carries', async () => {
    process.env[FLAG_ENV] = FLAG_ON;
    process.env[BASE_URL_ENV] = DECLARED_BASE_URL;
    process.env[KEY_ENV] = FIXTURE_KEY;

    const { buildGatewayRouteAdapter } = await loadModule();

    expect(buildGatewayRouteAdapter(PROVIDER)).toBe(builtAdapter);
    const [definition, env] = createGatewayAdapter.mock.calls[0] ?? [];
    expect(definition).toMatchObject({ baseUrlEnv: BASE_URL_ENV, apiKeyEnv: KEY_ENV });
    expect((env as Record<string, string>)[KEY_ENV]).toBe(FIXTURE_KEY);
  });

  it('refuses to build while the flag is off', async () => {
    process.env[BASE_URL_ENV] = DECLARED_BASE_URL;
    process.env[KEY_ENV] = FIXTURE_KEY;

    const { buildGatewayRouteAdapter } = await loadModule();

    expect(() => buildGatewayRouteAdapter(PROVIDER)).toThrow(FLAG_ENV);
    expect(createGatewayAdapter).not.toHaveBeenCalled();
  });

  it('names the missing env var rather than dispatching without an endpoint', async () => {
    process.env[FLAG_ENV] = FLAG_ON;
    process.env[KEY_ENV] = FIXTURE_KEY;

    const { buildGatewayRouteAdapter } = await loadModule();

    expect(() => buildGatewayRouteAdapter(PROVIDER)).toThrow(BASE_URL_ENV);
    expect(createGatewayAdapter).not.toHaveBeenCalled();
  });

  it('refuses an endpoint the environment points at a host the definition does not declare', async () => {
    process.env[FLAG_ENV] = FLAG_ON;
    process.env[BASE_URL_ENV] = FOREIGN_BASE_URL;
    process.env[KEY_ENV] = FIXTURE_KEY;

    const { buildGatewayRouteAdapter } = await loadModule();

    expect(() => buildGatewayRouteAdapter(PROVIDER)).toThrow(DECLARED_HOST);
    expect(createGatewayAdapter).not.toHaveBeenCalled();
  });

  it('counts a gateway provider as credentialed only once both env names resolve', async () => {
    process.env[FLAG_ENV] = FLAG_ON;
    process.env[BASE_URL_ENV] = DECLARED_BASE_URL;

    const { hasGatewayRouteCredentials, listCredentialedGatewayProviderIds } = await loadModule();

    expect(hasGatewayRouteCredentials(PROVIDER)).toBe(false);
    expect(listCredentialedGatewayProviderIds()).not.toContain(PROVIDER);

    process.env[KEY_ENV] = FIXTURE_KEY;

    expect(hasGatewayRouteCredentials(PROVIDER)).toBe(true);
    expect(listCredentialedGatewayProviderIds()).toContain(PROVIDER);
  });
});

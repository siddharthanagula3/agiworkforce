import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolRoute, ProviderAdapter } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

vi.mock('server-only', () => ({}));

const OPENAI_CHAT_FIXTURE_BASE_URL = 'https://openrouter.ai/api/v1';
const ANTHROPIC_DIALECT_FIXTURE_BASE_URL = 'https://api.deepseek.com/anthropic';
const GEMINI_DIALECT_FIXTURE_BASE_URL = 'https://fixture-vendor-gemini.example/v1';
const FIXTURE_KEY_ENV = 'AGI_FIXTURE_RESELLER_API_KEY';
const UPSTREAM_ERROR_STATUS = '429';

const { protocolRoutes } = vi.hoisted(() => ({ protocolRoutes: [] as ProtocolRoute[] }));

const protocolAdapter = {
  id: 'openai',
  label: 'Protocol route adapter',
  auth: [],
  config: {},
  async catalog() {
    return [];
  },
  async *stream() {
    yield { type: 'stop' as const, reason: 'end_turn' };
  },
} satisfies ProviderAdapter;

const buildProtocolRouteAdapter = vi.fn(
  (_providerId: string, _options?: unknown) => protocolAdapter,
);

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  listProtocolRoutes: () => protocolRoutes,
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildProtocolRouteAdapter: (providerId: string, options?: unknown) =>
    buildProtocolRouteAdapter(providerId, options),
  buildServerProviderAdapter: () => protocolAdapter,
  listAvailableManagedProviderIds: () => new Set<string>(),
  resolveProviderFromModel: (model: string) => model,
}));

function protocolRouteFixture(overrides: Partial<ProtocolRoute>): ProtocolRoute {
  return {
    routeId: 'fixture_reseller/fixture-model',
    modelKey: 'fixture-model',
    provider: 'fixture_reseller',
    providerModelId: 'fixture-upstream-model',
    harnessId: 'fixture-reseller/chat-completions',
    apiFamily: 'chat_completions',
    protocol: 'openai_chat',
    baseUrl: OPENAI_CHAT_FIXTURE_BASE_URL,
    apiKeyEnv: FIXTURE_KEY_ENV,
    hostPolicy: 'allowlist_only',
    trustModes: ['managed_cloud'],
    cacheClass: 'no_provider_cache',
    commercialStatus: 'experimental_only',
    ...overrides,
  };
}

async function loadDispatchTable(): Promise<typeof import('./adapter-providers')> {
  vi.resetModules();
  return import('./adapter-providers');
}

const cachingRequest = {
  llmRequest: { usePromptCache: true, tools: [] },
} as unknown as ProcessedRequest;

describe('protocol-route dispatch', () => {
  beforeEach(() => {
    buildProtocolRouteAdapter.mockClear();
    protocolRoutes.length = 0;
  });

  it('dispatches an openai_chat route through the OpenAI-compatible wire', async () => {
    protocolRoutes.push(protocolRouteFixture({}));

    const { ADAPTER_PROVIDERS } = await loadDispatchTable();
    const entry = ADAPTER_PROVIDERS['fixture_reseller'];
    if (!entry) throw new Error('the openai_chat fixture route was not dispatched');

    expect(entry.wireMode).toBe('openai-passthrough');
    expect(entry.buildAdapter(cachingRequest)).toBe(protocolAdapter);
    expect(buildProtocolRouteAdapter).toHaveBeenCalledWith('fixture_reseller', {});
  });

  it('carries the prompt-cache configuration into an anthropic_messages route', async () => {
    protocolRoutes.push(
      protocolRouteFixture({
        provider: 'fixture_vendor_anthropic',
        harnessId: 'fixture-vendor-anthropic/messages',
        apiFamily: 'messages',
        protocol: 'anthropic_messages',
        baseUrl: ANTHROPIC_DIALECT_FIXTURE_BASE_URL,
        cacheClass: 'provider_explicit_prompt_cache',
      }),
    );

    const { ADAPTER_PROVIDERS } = await loadDispatchTable();
    const entry = ADAPTER_PROVIDERS['fixture_vendor_anthropic'];
    if (!entry) throw new Error('the anthropic_messages fixture route was not dispatched');

    expect(entry.wireMode).toBe('legacy-web');
    entry.buildAdapter(cachingRequest);

    expect(buildProtocolRouteAdapter).toHaveBeenCalledWith('fixture_vendor_anthropic', {
      anthropicCache: { enableCacheControl: true, cacheRetention: 'long' },
    });
  });

  it('attributes an upstream failure to the route provider id', async () => {
    protocolRoutes.push(protocolRouteFixture({}));

    const { ADAPTER_PROVIDERS } = await loadDispatchTable();
    const entry = ADAPTER_PROVIDERS['fixture_reseller'];
    if (!entry) throw new Error('the openai_chat fixture route was not dispatched');
    const mapped = entry.mapError({
      type: 'error',
      message: 'slow down',
      code: UPSTREAM_ERROR_STATUS,
      retryable: true,
    });

    expect(mapped.message).toContain('fixture_reseller');
    expect((mapped as Error & { status?: number }).status).toBe(Number(UPSTREAM_ERROR_STATUS));
  });

  it('keeps the bespoke adapter for a provider that already ships one', async () => {
    protocolRoutes.push(
      protocolRouteFixture({
        provider: 'anthropic',
        harnessId: 'fixture-anthropic/messages',
        protocol: 'anthropic_messages',
        baseUrl: ANTHROPIC_DIALECT_FIXTURE_BASE_URL,
      }),
    );

    const { ADAPTER_PROVIDERS } = await loadDispatchTable();
    const entry = ADAPTER_PROVIDERS['anthropic'];
    if (!entry) throw new Error('the bespoke Anthropic adapter is missing');
    entry.buildAdapter(cachingRequest);

    expect(buildProtocolRouteAdapter).not.toHaveBeenCalled();
  });

  it('resolves wireMode by protocol for a gemini_native route under a non-google provider id', async () => {
    const provider: string = 'fixture_vendor_gemini';
    protocolRoutes.push(
      protocolRouteFixture({
        provider,
        harnessId: 'fixture-vendor-gemini/generate-content',
        apiFamily: 'generate_content',
        protocol: 'gemini_native',
        baseUrl: GEMINI_DIALECT_FIXTURE_BASE_URL,
      }),
    );

    const { resolveWireMode } = await loadDispatchTable();
    const legacyCallSiteWireMode =
      provider === 'anthropic' || provider === 'google' ? 'legacy-web' : 'openai-passthrough';

    expect(resolveWireMode(provider)).toBe('legacy-web');
    expect(legacyCallSiteWireMode).not.toBe(resolveWireMode(provider));
  });

  it('throws for a provider that is not registered in ADAPTER_PROVIDERS', async () => {
    const { resolveWireMode } = await loadDispatchTable();

    expect(() => resolveWireMode('fixture_unregistered_provider')).toThrow(
      'fixture_unregistered_provider',
    );
  });
});

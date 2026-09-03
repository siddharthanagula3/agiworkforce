import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProviderDefaultModel, requireProviderDefaultModel } from '@agiworkforce/types';
import type { ProtocolRoute } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const OPENAI_CHAT_FIXTURE_BASE_URL = 'https://openrouter.ai/api/v1';
const ANTHROPIC_DIALECT_FIXTURE_BASE_URL = 'https://api.deepseek.com/anthropic';
const OFF_ALLOWLIST_FIXTURE_BASE_URL = 'https://reseller.invalid/v1';
const FIXTURE_KEY_ENV = 'AGI_FIXTURE_RESELLER_API_KEY';

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

const { protocolRoutes } = vi.hoisted(() => ({ protocolRoutes: [] as ProtocolRoute[] }));

vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  listProtocolRoutes: () => protocolRoutes,
}));

const createProviderAdapter = vi.fn((providerId: string, config: unknown) => ({
  providerId,
  config,
}));
const getOptionalEnv = vi.fn<(key: string) => string | undefined>();
const loggerInfo = vi.fn();

vi.mock('@agiworkforce/providers-factory', () => ({
  createProviderAdapter: (providerId: string, config: unknown) =>
    createProviderAdapter(providerId, config),
}));

vi.mock('@shared/utils/env', () => ({
  getOptionalEnv: (key: string) => getOptionalEnv(key),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: (...args: unknown[]) => loggerInfo(...args), warn: vi.fn() },
}));

async function loadService(): Promise<typeof import('./provider-adapter-service')> {
  vi.resetModules();
  return import('./provider-adapter-service');
}

import { buildServerProviderAdapter, resolveProviderFromModel } from './provider-adapter-service';

describe('resolveProviderFromModel', () => {
  it('derives provider ownership from the canonical catalog', () => {
    expect(resolveProviderFromModel(requireProviderDefaultModel('openai'))).toBe('openai');
  });

  it('fails closed for an unknown or retired model instead of guessing a provider', () => {
    expect(() => resolveProviderFromModel('fixture-unknown-model')).toThrow(
      /canonical model catalog/i,
    );
  });
});

describe('buildServerProviderAdapter', () => {
  beforeEach(() => {
    createProviderAdapter.mockClear();
    getOptionalEnv.mockReset();
    loggerInfo.mockClear();
  });

  it('adds request-specific cache policy without allowing the caller to replace managed credentials', () => {
    getOptionalEnv.mockImplementation((key) =>
      key === 'ANTHROPIC_API_KEY' ? 'managed-anthropic-key' : undefined,
    );

    buildServerProviderAdapter('anthropic', {
      anthropicCache: {
        enableCacheControl: true,
        cacheRetention: 'long',
      },
    });

    expect(createProviderAdapter).toHaveBeenCalledOnce();
    expect(createProviderAdapter).toHaveBeenCalledWith('anthropic', {
      apiKey: 'managed-anthropic-key',
      enableCacheControl: true,
      cacheRetention: 'long',
    });
  });

  it('preserves the Gemini API key alias used by Managed Web chat', () => {
    getOptionalEnv.mockImplementation((key) =>
      key === 'GEMINI_API_KEY' ? 'managed-gemini-key' : undefined,
    );

    buildServerProviderAdapter('google');

    expect(createProviderAdapter).toHaveBeenCalledOnce();
    expect(createProviderAdapter).toHaveBeenCalledWith('google', {
      apiKey: 'managed-gemini-key',
    });
  });

  it('leaves native OpenAI models on the adapter default Responses path', () => {
    const model = getProviderDefaultModel('openai');
    expect(model).not.toBeNull();
    getOptionalEnv.mockImplementation((key) =>
      key === 'OPENAI_API_KEY' ? 'managed-openai-key' : undefined,
    );

    buildServerProviderAdapter('openai');

    expect(createProviderAdapter).toHaveBeenCalledOnce();
    expect(createProviderAdapter).toHaveBeenCalledWith('openai', {
      apiKey: 'managed-openai-key',
      onResponsesDiagnostics: expect.any(Function),
    });

    const config = createProviderAdapter.mock.calls[0]?.[1] as {
      onResponsesDiagnostics?: (diagnostics: unknown) => void;
    };
    const diagnostics = {
      requestId: 'req_123',
      request: {
        model,
        inputItemTypes: { message: 1 },
        inputContentTypes: {},
        toolTypes: { function: 2 },
        toolChoice: 'required',
        maxOutputTokens: 8192,
        reasoningEffort: 'low',
        reasoningSummary: 'auto',
        store: false,
      },
      stream: {
        eventTypes: { 'response.completed': 1 },
        finalOutputItemTypes: { function_call: 1 },
        finalContentTypes: {},
        responseStatus: 'completed',
        terminalEventType: 'response.completed',
        emitted: {
          text: false,
          functionCall: true,
          serverTool: false,
          error: false,
        },
      },
    };
    config.onResponsesDiagnostics?.(diagnostics);

    expect(loggerInfo).toHaveBeenCalledWith(
      { providerId: 'openai', responses: diagnostics },
      'OpenAI Responses request completed',
    );
  });
});

describe('free-lane gateway credentials', () => {
  beforeEach(() => {
    createProviderAdapter.mockClear();
    getOptionalEnv.mockReset();
  });

  it('refuses to build the Workers AI adapter while no token is provisioned', () => {
    getOptionalEnv.mockImplementation(() => undefined);

    expect(() => buildServerProviderAdapter('workers_ai')).toThrow(/WORKERS_AI_API_KEY/);
    expect(createProviderAdapter).not.toHaveBeenCalled();
  });

  it('accepts a Cloudflare API token in place of a Workers AI key', () => {
    getOptionalEnv.mockImplementation((key) =>
      key === 'CLOUDFLARE_API_TOKEN' ? 'managed-cloudflare-token' : undefined,
    );

    buildServerProviderAdapter('workers_ai');

    expect(createProviderAdapter).toHaveBeenCalledWith('workers_ai', {
      apiKey: 'managed-cloudflare-token',
    });
  });

  it('prefers a static gateway key over the rotating OIDC token', () => {
    getOptionalEnv.mockImplementation((key) => {
      if (key === 'AI_GATEWAY_API_KEY') return 'static-gateway-key';
      if (key === 'VERCEL_OIDC_TOKEN') return 'oidc-token';
      return undefined;
    });

    buildServerProviderAdapter('vercel_gateway');

    expect(createProviderAdapter).toHaveBeenCalledWith('vercel_gateway', {
      apiKey: 'static-gateway-key',
    });
  });

  it('falls back to the OIDC token when no static key is set', () => {
    getOptionalEnv.mockImplementation((key) =>
      key === 'VERCEL_OIDC_TOKEN' ? 'oidc-token' : undefined,
    );

    buildServerProviderAdapter('vercel_gateway');

    expect(createProviderAdapter).toHaveBeenCalledWith('vercel_gateway', {
      apiKey: 'oidc-token',
    });
  });
});

describe('buildProtocolRouteAdapter', () => {
  beforeEach(() => {
    createProviderAdapter.mockClear();
    getOptionalEnv.mockReset();
    protocolRoutes.length = 0;
  });

  it('builds an OpenAI-compatible adapter from the harness base url and key env', async () => {
    protocolRoutes.push(protocolRouteFixture({}));
    getOptionalEnv.mockImplementation((key) =>
      key === FIXTURE_KEY_ENV ? 'fixture-reseller-key' : undefined,
    );

    const { buildProtocolRouteAdapter } = await loadService();
    buildProtocolRouteAdapter('fixture_reseller');

    expect(createProviderAdapter).toHaveBeenCalledWith('openai_compat', {
      apiKey: 'fixture-reseller-key',
      baseUrl: OPENAI_CHAT_FIXTURE_BASE_URL,
      providerId: 'fixture_reseller',
      label: 'fixture_reseller',
      apiKeyEnvVar: FIXTURE_KEY_ENV,
      skipDiscovery: true,
    });
  });

  it('builds the Anthropic adapter with prompt-cache policy for an anthropic_messages harness', async () => {
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
    getOptionalEnv.mockImplementation((key) =>
      key === FIXTURE_KEY_ENV ? 'fixture-vendor-key' : undefined,
    );

    const { buildProtocolRouteAdapter } = await loadService();
    buildProtocolRouteAdapter('fixture_vendor_anthropic', {
      anthropicCache: { enableCacheControl: true, cacheRetention: 'long' },
    });

    expect(createProviderAdapter).toHaveBeenCalledWith('anthropic', {
      apiKey: 'fixture-vendor-key',
      baseUrl: ANTHROPIC_DIALECT_FIXTURE_BASE_URL,
      enableCacheControl: true,
      cacheRetention: 'long',
    });
  });

  it('refuses a harness whose base url host the egress allowlist does not admit', async () => {
    protocolRoutes.push(protocolRouteFixture({ baseUrl: OFF_ALLOWLIST_FIXTURE_BASE_URL }));
    getOptionalEnv.mockImplementation((key) =>
      key === FIXTURE_KEY_ENV ? 'fixture-reseller-key' : undefined,
    );

    const { buildProtocolRouteAdapter } = await loadService();

    expect(() => buildProtocolRouteAdapter('fixture_reseller')).toThrow(/egress allowlist/);
    expect(createProviderAdapter).not.toHaveBeenCalled();
  });

  it('fails closed when the harness key env var is unset', async () => {
    protocolRoutes.push(protocolRouteFixture({}));
    getOptionalEnv.mockReturnValue(undefined);

    const { buildProtocolRouteAdapter } = await loadService();

    expect(() => buildProtocolRouteAdapter('fixture_reseller')).toThrow(FIXTURE_KEY_ENV);
    expect(createProviderAdapter).not.toHaveBeenCalled();
  });

  it('rejects a provider the registry does not describe by protocol', async () => {
    const { buildProtocolRouteAdapter } = await loadService();

    expect(() => buildProtocolRouteAdapter('anthropic')).toThrow(/no protocol route/);
  });

  it('refuses two protocol harnesses behind one provider id', async () => {
    protocolRoutes.push(
      protocolRouteFixture({}),
      protocolRouteFixture({
        harnessId: 'fixture-reseller/messages',
        protocol: 'anthropic_messages',
        baseUrl: ANTHROPIC_DIALECT_FIXTURE_BASE_URL,
      }),
    );

    await expect(loadService()).rejects.toThrow(/two protocol harnesses/);
  });
});

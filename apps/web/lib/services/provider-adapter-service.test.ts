import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

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

import { buildServerProviderAdapter } from './provider-adapter-service';

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
        model: 'gpt-5.4-mini',
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

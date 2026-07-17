import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const createProviderAdapter = vi.fn((providerId: string, config: unknown) => ({
  providerId,
  config,
}));
const getOptionalEnv = vi.fn<(key: string) => string | undefined>();

vi.mock('@agiworkforce/providers-factory', () => ({
  createProviderAdapter: (providerId: string, config: unknown) =>
    createProviderAdapter(providerId, config),
}));

vi.mock('@shared/utils/env', () => ({
  getOptionalEnv: (key: string) => getOptionalEnv(key),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn() },
}));

import { buildServerProviderAdapter } from './provider-adapter-service';

describe('buildServerProviderAdapter', () => {
  beforeEach(() => {
    createProviderAdapter.mockClear();
    getOptionalEnv.mockReset();
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

  it('preserves the OpenAI Chat Completions adapter contract', () => {
    getOptionalEnv.mockImplementation((key) =>
      key === 'OPENAI_API_KEY' ? 'managed-openai-key' : undefined,
    );

    buildServerProviderAdapter('openai');

    expect(createProviderAdapter).toHaveBeenCalledOnce();
    expect(createProviderAdapter).toHaveBeenCalledWith('openai', {
      apiKey: 'managed-openai-key',
      useResponsesApi: false,
    });
  });
});

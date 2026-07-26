import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProviderAdapter: vi.fn(),
}));

vi.mock('@agiworkforce/providers-factory', () => ({
  createProviderAdapter: (providerId: string, config: unknown) =>
    mocks.createProviderAdapter(providerId, config),
}));

import {
  buildProviderAdapter,
  isSupportedProviderId,
  SUPPORTED_PROVIDER_IDS,
} from '../../src/lib/providerAdapters';

const MANAGED_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_ORG_ID',
  'OPENAI_PROJECT_ID',
  'GOOGLE_API_KEY',
  'GOOGLE_AI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_GENAI_BASE_URL',
  'QWEN_API_KEY',
  'DASHSCOPE_API_KEY',
  'MOONSHOT_API_KEY',
  'MOONSHOT_BASE_URL',
  'OLLAMA_API_KEY',
  'OLLAMA_BASE_URL',
  'MINIMAX_API_KEY',
] as const;

describe('API Gateway provider construction boundary', () => {
  beforeEach(() => {
    mocks.createProviderAdapter.mockReset();
    mocks.createProviderAdapter.mockImplementation((providerId, config) => ({
      id: providerId,
      config,
    }));
    for (const envKey of MANAGED_ENV_KEYS) vi.stubEnv(envKey, undefined);
  });

  it('imports only the aggregate provider factory, never leaf adapter constructors', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'src', 'lib', 'providerAdapters.ts'),
      'utf8',
    );

    const leafImports = [...source.matchAll(/@agiworkforce\/providers-([a-z]+)/g)]
      .map((match) => match[1])
      .filter((packageName) => packageName !== 'factory');

    expect(leafImports).toEqual([]);
  });

  it('keeps the Gateway Anthropic cache default as deployment-local policy', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'gateway-anthropic-key');

    buildProviderAdapter('anthropic');

    expect(mocks.createProviderAdapter).toHaveBeenCalledWith('anthropic', {
      apiKey: 'gateway-anthropic-key',
      enableCacheControl: true,
      cacheRetention: 'short',
    });
  });

  it('keeps Gateway OpenAI discovery and organization policy local', () => {
    vi.stubEnv('OPENAI_API_KEY', 'gateway-openai-key');
    vi.stubEnv('OPENAI_ORG_ID', 'org-test');
    vi.stubEnv('OPENAI_PROJECT_ID', 'project-test');

    buildProviderAdapter('openai');

    expect(mocks.createProviderAdapter).toHaveBeenCalledWith('openai', {
      apiKey: 'gateway-openai-key',
      skipDiscovery: true,
      organization: 'org-test',
      project: 'project-test',
    });
  });

  it('preserves Google aliases and the Gateway-specific base URL variable', () => {
    vi.stubEnv('GEMINI_API_KEY', 'gateway-gemini-key');
    vi.stubEnv('GOOGLE_GENAI_BASE_URL', 'https://generativelanguage.googleapis.com');

    buildProviderAdapter('google');

    expect(mocks.createProviderAdapter).toHaveBeenCalledWith('google', {
      apiKey: 'gateway-gemini-key',
      baseUrl: 'https://generativelanguage.googleapis.com',
    });
  });

  it('preserves provider-specific key aliases without moving them into the shared factory', () => {
    vi.stubEnv('DASHSCOPE_API_KEY', 'gateway-dashscope-key');

    buildProviderAdapter('qwen');

    expect(mocks.createProviderAdapter).toHaveBeenCalledWith('qwen', {
      apiKey: 'gateway-dashscope-key',
    });
  });

  it('matches the current leaf-adapter roster after Groq and Mistral removal', () => {
    expect(SUPPORTED_PROVIDER_IDS).toContain('minimax');
    expect(isSupportedProviderId('minimax')).toBe(true);
    expect(isSupportedProviderId('groq')).toBe(false);
    expect(isSupportedProviderId('mistral')).toBe(false);
  });

  it('constructs the current MiniMax adapter from its documented managed key', () => {
    vi.stubEnv('MINIMAX_API_KEY', 'gateway-minimax-key');

    buildProviderAdapter('minimax');

    expect(mocks.createProviderAdapter).toHaveBeenCalledWith('minimax', {
      apiKey: 'gateway-minimax-key',
    });
  });

  it('returns null before factory dispatch when required managed credentials are missing', () => {
    expect(buildProviderAdapter('perplexity')).toBeNull();
    expect(mocks.createProviderAdapter).not.toHaveBeenCalled();
  });
});

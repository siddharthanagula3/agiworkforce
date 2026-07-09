import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getProviderProbeModel } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  buildServerProviderAdapter: vi.fn(),
  adapterStream: vi.fn(),
  drainToLlmResponse: vi.fn(),
  getClerkAuthUser: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: (...args: unknown[]) => mocks.buildServerProviderAdapter(...args),
  toApiModelId: (modelId: string) => modelId,
  toGenericUpstreamError: (providerId: string, chunk: { message: string }) =>
    new Error(`${providerId} API error: ${chunk.message}`),
}));

vi.mock('@/app/api/llm/v1/chat/completions/lib/adapter-response', () => ({
  drainToLlmResponse: (...args: unknown[]) => mocks.drainToLlmResponse(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: (...args: unknown[]) => mocks.getClerkAuthUser(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: (...args: unknown[]) => mocks.loggerError(...args),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { POST } from '@/app/api/settings/test-provider/route';

function postProvider(provider: string): NextRequest {
  return new NextRequest('http://localhost/api/settings/test-provider', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
}

describe('POST /api/settings/test-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildServerProviderAdapter.mockReturnValue({
      stream: (...args: unknown[]) => {
        mocks.adapterStream(...args);
        return (async function* () {})();
      },
    });
    mocks.drainToLlmResponse.mockResolvedValue({
      content: 'OK',
      model: 'x',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user_test' });
    process.env['AGI_MANAGED_COMPUTE_PRIVATE_BETA'] = '1';
  });

  it('accepts canonical lowercase provider IDs from settings UI', async () => {
    const response = await POST(postProvider('qwen'));
    const body = (await response.json()) as { success: boolean; provider: string; model: string };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.provider).toBe('qwen');
    expect(body.model).toBe(getProviderProbeModel('qwen'));
    expect(mocks.buildServerProviderAdapter).toHaveBeenCalledWith('qwen');
    expect(mocks.adapterStream).toHaveBeenCalledWith(
      expect.objectContaining({
        model: getProviderProbeModel('qwen'),
        maxOutputTokens: 10,
      }),
      expect.anything(),
    );
  });

  it('accepts current display aliases without exposing provider errors', async () => {
    mocks.drainToLlmResponse.mockRejectedValueOnce(
      new Error('401 raw upstream body with secret diagnostic provider-token-value'),
    );

    const response = await POST(postProvider('xAI (Grok)'));
    const body = (await response.json()) as { success: boolean; provider: string; error: string };

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.provider).toBe('xai');
    expect(body.error).toBe('Provider rejected the configured API key (401)');
    expect(body.error).not.toContain('provider-token-value');
    expect(mocks.buildServerProviderAdapter).toHaveBeenCalledWith('xai');
  });

  it('classifies a missing server API key without leaking internals', async () => {
    mocks.buildServerProviderAdapter.mockImplementationOnce(() => {
      throw new Error(
        'Provider "openai" is not configured. Please ensure the OPENAI_API_KEY environment variable is set. Check your .env.local file or deployment environment variables.',
      );
    });

    const response = await POST(postProvider('openai'));
    const body = (await response.json()) as { success: boolean; provider: string; error: string };

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Provider "openai" is not configured - missing API key on server');
    expect(mocks.adapterStream).not.toHaveBeenCalled();
  });
});

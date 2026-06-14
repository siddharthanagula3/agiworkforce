import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getProviderProbeModel } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createProvider: vi.fn(),
  getClerkAuthUser: vi.fn(),
  loggerError: vi.fn(),
  sendRequest: vi.fn(),
}));

vi.mock('@/lib/llm-providers/factory', () => ({
  LLMProviderFactory: {
    createProvider: (...args: unknown[]) => mocks.createProvider(...args),
  },
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
    mocks.createProvider.mockReturnValue({ sendRequest: mocks.sendRequest });
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user_test' });
    mocks.sendRequest.mockResolvedValue({ content: 'OK' });
    process.env['AGI_MANAGED_COMPUTE_PRIVATE_BETA'] = '1';
  });

  it('accepts canonical lowercase provider IDs from settings UI', async () => {
    const response = await POST(postProvider('qwen'));
    const body = (await response.json()) as { success: boolean; provider: string; model: string };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.provider).toBe('qwen');
    expect(body.model).toBe(getProviderProbeModel('qwen'));
    expect(mocks.createProvider).toHaveBeenCalledWith('qwen');
    expect(mocks.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        model: getProviderProbeModel('qwen'),
        stream: false,
        max_tokens: 10,
      }),
    );
  });

  it('accepts current display aliases without exposing provider errors', async () => {
    mocks.sendRequest.mockRejectedValueOnce(
      new Error('401 raw upstream body with secret diagnostic provider-token-value'),
    );

    const response = await POST(postProvider('xAI (Grok)'));
    const body = (await response.json()) as { success: boolean; provider: string; error: string };

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.provider).toBe('xai');
    expect(body.error).toBe('Provider rejected the configured API key (401)');
    expect(body.error).not.toContain('provider-token-value');
    expect(mocks.createProvider).toHaveBeenCalledWith('xai');
  });
});

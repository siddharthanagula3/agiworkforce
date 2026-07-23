import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

import { buildUpstreamErrorResponse } from './response-builder';

describe('buildUpstreamErrorResponse', () => {
  it('does not expose a provider quota payload to the chat UI', async () => {
    const response = buildUpstreamErrorResponse(
      new Error(
        'Google API rate limit exceeded (429): {"error":{"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota"}}',
      ),
      'google',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash-lite',
      'user-1',
      'request-1',
      'streaming',
    );

    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { message: string; type: string } };
    expect(body.error.type).toBe('rate_limit_error');
    expect(body.error.message).toBe(
      'Google is temporarily at capacity. Try again shortly, or choose Auto to use another available model.',
    );
    expect(body.error.message).not.toContain('RESOURCE_EXHAUSTED');
  });
});

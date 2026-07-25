import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

import { buildUpstreamErrorResponse } from './response-builder';

describe('buildUpstreamErrorResponse', () => {
  // CHANGED BY AUDIT-FIX SYS-17/SYS-18 — read loudly.
  //
  // The original fixture threw a bare `new Error('Google API rate limit
  // exceeded (429): ...')` with NO `status` property, because the old
  // implementation derived the HTTP status by SUBSTRING-MATCHING that English
  // text. That fixture no longer represents what the adapters actually throw:
  // `adapter-errors.ts` has always set a structured `error.status`, and the
  // response builder now reads it (via `classifyError`) instead of sniffing
  // strings. The assertion's intent — 429, `rate_limit_error`, and NO provider
  // quota payload in the body — is preserved verbatim.
  function upstreamError(message: string, status?: number): Error {
    const error = new Error(message) as Error & { status?: number };
    if (status !== undefined) error.status = status;
    return error;
  }

  it('does not expose a provider quota payload to the chat UI', async () => {
    const response = buildUpstreamErrorResponse(
      upstreamError(
        'Google API rate limit exceeded (429): {"error":{"status":"RESOURCE_EXHAUSTED","message":"You exceeded your current quota"}}',
        429,
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

  it('never returns the raw upstream message for an unclassified failure (SYS-18)', async () => {
    const response = buildUpstreamErrorResponse(
      upstreamError(
        'Anthropic API error (500): {"type":"error","error":{"message":"internal upstream account 12345 exploded"}}',
        500,
      ),
      'anthropic',
      'claude-x',
      'claude-x',
      'user-1',
      'request-1',
      'streaming',
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as {
      error: { message: string; type: string; code: string; retryable: boolean };
    };
    expect(body.error.type).toBe('upstream_error');
    expect(body.error.code).toBe('provider_error');
    expect(body.error.retryable).toBe(true);
    expect(body.error.message).not.toContain('internal upstream account');
    expect(body.error.message).not.toContain('Anthropic');
  });

  it('maps a context-window overflow to an actionable client code (SYS-19)', async () => {
    const response = buildUpstreamErrorResponse(
      upstreamError('OpenAI API error (400): prompt is too long: 250000 tokens > 200000 maximum'),
      'openai',
      'gpt-x',
      'gpt-x',
      'user-1',
      'request-1',
      'non-streaming',
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('context_length_exceeded');
    expect(body.error.message).toContain('too long for the selected model');
  });

  it('maps a safety stop to a distinct content_filter code (SYS-19)', async () => {
    const response = buildUpstreamErrorResponse(
      upstreamError('Google API error (400): blocked by SAFETY finish reason'),
      'google',
      'gemini-x',
      'gemini-x',
      'user-1',
      'request-1',
      'streaming',
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; type: string } };
    expect(body.error.type).toBe('content_filter');
    expect(body.error.code).toBe('content_filter');
  });

  it('maps a timeout to a distinct provider_timeout code (SYS-19)', async () => {
    const response = buildUpstreamErrorResponse(
      upstreamError('OpenAI request timeout after 60000ms'),
      'openai',
      'gpt-x',
      'gpt-x',
      'user-1',
      'request-1',
      'streaming',
    );

    expect(response.status).toBe(504);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('provider_timeout');
  });
});

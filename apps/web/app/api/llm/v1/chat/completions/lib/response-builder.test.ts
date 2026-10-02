import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

import { FreeLimitSchema } from '@agiworkforce/cloud-contracts';
import { getRoutingSlotModel } from '@agiworkforce/types';
import { buildUpstreamErrorResponse } from './response-builder';

const FIXTURE_MODEL_ID = 'fixture-model';

describe('buildUpstreamErrorResponse', () => {
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
      FIXTURE_MODEL_ID,
      FIXTURE_MODEL_ID,
      'user-1',
      'request-1',
      'streaming',
    );

    expect(response.status).toBe(429);
    const body = (await response.json()) as {
      error: { message: string; type: string; code: string };
    };
    expect(body.error.type).toBe('rate_limit_error');
    // RESOURCE_EXHAUSTED plus "exceeded your current quota" is a spent quota
    // window, not a momentary rate limit, so it must not promise that retrying
    // shortly will work.
    expect(body.error.code).toBe('provider_quota_exhausted');
    expect(body.error.message).toBe(
      'Google capacity for this model is exhausted for now. Choose Auto to use another available model, or try again later.',
    );
    expect(body.error.message).not.toContain('RESOURCE_EXHAUSTED');
  });

  it('names the free lane’s ways out when the shared free allowance is spent', async () => {
    const response = buildUpstreamErrorResponse(
      upstreamError('429 Rate limit exceeded: free-models-per-day', 429),
      'open_router',
      FIXTURE_MODEL_ID,
      FIXTURE_MODEL_ID,
      'user-1',
      'request-1',
      'streaming',
    );

    const body = (await response.json()) as {
      error: { code: string; recovery?: Array<{ action: string; href: string }> };
    };
    expect(body.error.code).toBe('free_allowance_exhausted');
    expect(body.error.recovery).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'upgrade' }),
        expect.objectContaining({ action: 'byok' }),
      ]),
    );
  });

  it('states the spent shared allowance as a typed free limit any client can read', async () => {
    const freeAuto = getRoutingSlotModel('router_zero_cost');
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 2, 12), toFake: ['Date'] });
    try {
      const withReset = buildUpstreamErrorResponse(
        Object.assign(upstreamError('429 Rate limit exceeded: free-models-per-day', 429), {
          retryAfterSeconds: 3_600,
        }),
        'open_router',
        freeAuto,
        freeAuto,
        'user-1',
        'request-1',
        'streaming',
      );
      const withoutReset = buildUpstreamErrorResponse(
        upstreamError('429 Rate limit exceeded: free-models-per-day', 429),
        'open_router',
        freeAuto,
        freeAuto,
        'user-1',
        'request-2',
        'non-streaming',
      );

      const timed = (await withReset.json()) as { error: { free_limit?: unknown } };
      const untimed = (await withoutReset.json()) as { error: { free_limit?: unknown } };
      expect(FreeLimitSchema.parse(timed.error.free_limit)).toEqual({
        model: freeAuto,
        reason: 'shared_pool_used',
        resets_at: '2026-10-02T13:00:00.000Z',
      });
      expect(FreeLimitSchema.parse(untimed.error.free_limit)).toEqual({
        model: freeAuto,
        reason: 'shared_pool_used',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends no free limit for a refusal that is not the shared free allowance', async () => {
    const response = buildUpstreamErrorResponse(
      upstreamError('Google API rate limit exceeded (429)', 429),
      'google',
      FIXTURE_MODEL_ID,
      FIXTURE_MODEL_ID,
      'user-1',
      'request-1',
      'streaming',
    );

    expect(((await response.json()) as { error: { free_limit?: unknown } }).error.free_limit).toBe(
      undefined,
    );
  });

  it('keeps a momentary rate limit distinct from an exhausted quota', async () => {
    const response = buildUpstreamErrorResponse(
      upstreamError('Google API rate limit exceeded (429)', 429),
      'google',
      FIXTURE_MODEL_ID,
      FIXTURE_MODEL_ID,
      'user-1',
      'request-1',
      'streaming',
    );

    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { message: string; code: string } };
    expect(body.error.code).toBe('provider_rate_limited');
    expect(body.error.message).toBe(
      'Google is temporarily at capacity. Try again shortly, or choose Auto to use another available model.',
    );
  });

  it('never returns the raw upstream message for an unclassified failure (SYS-18)', async () => {
    const response = buildUpstreamErrorResponse(
      upstreamError(
        'Anthropic API error (500): {"type":"error","error":{"message":"internal upstream account 12345 exploded"}}',
        500,
      ),
      'anthropic',
      FIXTURE_MODEL_ID,
      FIXTURE_MODEL_ID,
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
      FIXTURE_MODEL_ID,
      FIXTURE_MODEL_ID,
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
      FIXTURE_MODEL_ID,
      FIXTURE_MODEL_ID,
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
      FIXTURE_MODEL_ID,
      FIXTURE_MODEL_ID,
      'user-1',
      'request-1',
      'streaming',
    );

    expect(response.status).toBe(504);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('provider_timeout');
  });
});

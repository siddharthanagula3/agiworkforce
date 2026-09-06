import { describe, expect, it } from 'vitest';

import {
  CannotRetryError,
  FallbackTriggeredError,
  EmptyProviderResponseError,
  SPENDING_CAP_PROVIDER_HINT,
  classifyError,
  parseContextOverflow,
} from '../errors';

const PRIMARY_FIXTURE_MODEL_ID = 'fixture-primary-model';
const FALLBACK_FIXTURE_MODEL_ID = 'fixture-fallback-model';

describe('classifyError', () => {
  it('classifies AbortError as aborted/non-retryable', () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const c = classifyError(err);
    expect(c.category).toBe('aborted');
    expect(c.retryable).toBe(false);
    expect(c.fallbackable).toBe(false);
  });

  it('classifies a connection timeout as api_timeout/retryable', () => {
    const err = { name: 'APIConnectionTimeoutError', message: 'fetch timeout' };
    const c = classifyError(err);
    expect(c.category).toBe('api_timeout');
    expect(c.retryable).toBe(true);
    expect(c.fallbackable).toBe(false);
  });

  it('classifies ECONNRESET as connection/retryable', () => {
    const err = new Error('socket: ECONNRESET');
    const c = classifyError(err);
    expect(c.category).toBe('connection');
    expect(c.retryable).toBe(true);
  });

  it('classifies a 529 overload as server_overload + fallbackable', () => {
    const err = { status: 529, message: '{"type":"overloaded_error"}' };
    const c = classifyError(err);
    expect(c.category).toBe('server_overload');
    expect(c.code).toBe('overloaded_529');
    expect(c.retryable).toBe(true);
    expect(c.fallbackable).toBe(true);
  });

  it('classifies a 503 with overloaded_error as server_overload', () => {
    const err = { status: 503, message: 'Service unavailable: overloaded_error' };
    const c = classifyError(err);
    expect(c.category).toBe('server_overload');
    expect(c.code).toBe('overloaded_503');
  });

  it('classifies an exhausted free-tier-only allocation as quota_exhausted, never auth', () => {
    const err = {
      status: 403,
      code: 'AllocationQuota.FreeTierOnly',
      message: 'The free tier of the model has been exhausted.',
    };
    const c = classifyError(err);
    expect(c.category).toBe('quota_exhausted');
    expect(c.code).toBe('free_quota_exhausted');
    expect(c.providerHint).toBe('free_tier_only');
    expect(c.retryable).toBe(false);
    expect(c.fallbackable).toBe(true);
  });

  it('classifies an exceeded allocation quota on a 429 as quota_exhausted', () => {
    const err = {
      status: 429,
      error: { code: 'Throttling.AllocationQuota' },
      message: 'Allocated quota exceeded, please increase your quota limit.',
    };
    const c = classifyError(err);
    expect(c.category).toBe('quota_exhausted');
    expect(c.code).toBe('free_quota_exhausted');
  });

  it('classifies a marketplace refusing the minimum discount as capacity, not overload', () => {
    const err = {
      status: 503,
      error: { code: 'min_discount_unavailable' },
      message: 'No supply clears the requested discount.',
    };
    const c = classifyError(err);
    expect(c.category).toBe('capacity_off_switch');
    expect(c.code).toBe('min_discount_unavailable');
    expect(c.retryable).toBe(false);
    expect(c.fallbackable).toBe(true);
  });

  it('classifies 429 as rate_limit and reads retry-after', () => {
    const err = {
      status: 429,
      message: 'rate limit',
      headers: { 'retry-after': '12' },
    };
    const c = classifyError(err);
    expect(c.category).toBe('rate_limit');
    expect(c.retryAfterSeconds).toBe(12);
  });

  it('reads anthropic overage hint header', () => {
    const err = {
      status: 429,
      message: 'rate limit',
      headers: new Headers({
        'anthropic-ratelimit-unified-overage-disabled-reason': 'monthly_cap',
      }),
    };
    const c = classifyError(err);
    expect(c.providerHint).toBe('monthly_cap');
  });

  it('classifies context overflow as context_overflow + retryable', () => {
    const err = new Error(
      'input length and `max_tokens` exceed context limit: 195000 + 8192 > 200000',
    );
    const c = classifyError(err);
    expect(c.category).toBe('context_overflow');
    expect(c.retryable).toBe(true);
    expect(c.fallbackable).toBe(true);
  });

  it("classifies Google's input-token-overflow wording as context_overflow", () => {
    const err = {
      status: 400,
      message:
        'The input token count (1234567) exceeds the maximum number of tokens allowed (1000000).',
    };
    const c = classifyError(err);
    expect(c.category).toBe('context_overflow');
    expect(c.category).not.toBe('client_error');
  });

  it('classifies EmptyStreamError as connection/retryable', () => {
    const err = Object.assign(new Error('Stream ended without receiving any events'), {
      name: 'EmptyStreamError',
    });
    const c = classifyError(err);
    expect(c.category).toBe('connection');
    expect(c.retryable).toBe(true);
  });

  it('classifies 401 as auth/retryable-once', () => {
    const err = { status: 401, message: 'invalid api key' };
    const c = classifyError(err);
    expect(c.category).toBe('auth');
    expect(c.retryable).toBe(true);
  });

  it('classifies 403 oauth-revoked as auth/non-retryable', () => {
    const err = { status: 403, message: 'OAuth token has been revoked' };
    const c = classifyError(err);
    expect(c.category).toBe('auth');
    expect(c.code).toBe('oauth_revoked');
    expect(c.retryable).toBe(false);
  });

  it('classifies tool_use mismatch as tool_validation/non-retryable', () => {
    const err = {
      status: 400,
      message: 'tool_use ids were found without tool_result blocks immediately after',
    };
    const c = classifyError(err);
    expect(c.category).toBe('tool_validation');
    expect(c.retryable).toBe(false);
  });

  it('classifies image-too-large as media_too_large', () => {
    const err = { status: 400, message: 'image dimensions exceed limit' };
    const c = classifyError(err);
    expect(c.category).toBe('media_too_large');
  });

  it('classifies 413 as request_too_large_413', () => {
    const err = { status: 413, message: 'request entity too large' };
    const c = classifyError(err);
    expect(c.code).toBe('request_too_large_413');
  });

  it('classifies invalid model name', () => {
    const err = { status: 400, message: 'model fixture-missing not found' };
    const c = classifyError(err);
    expect(c.category).toBe('invalid_model');
    expect(c.fallbackable).toBe(true);
  });

  it('classifies safety/refusal as safety + fallbackable', () => {
    const err = new Error('content_filter triggered');
    const c = classifyError(err);
    expect(c.category).toBe('safety');
    expect(c.fallbackable).toBe(true);
  });

  it('classifies EmptyProviderResponseError as empty_response + fallbackable', () => {
    const err = Object.assign(new Error('no content'), { name: 'EmptyProviderResponseError' });
    const c = classifyError(err);
    expect(c.category).toBe('empty_response');
    expect(c.code).toBe('empty_response');
    expect(c.retryable).toBe(false);
    expect(c.fallbackable).toBe(true);
  });

  it('classifies pause_turn as pause_turn category', () => {
    const err = { error: { type: 'pause_turn' }, message: 'pause_turn' };
    const c = classifyError(err);
    expect(c.category).toBe('pause_turn');
    expect(c.retryable).toBe(false);
    expect(c.fallbackable).toBe(false);
  });

  it('classifies generic 5xx as server_error/retryable', () => {
    const err = { status: 502, message: 'bad gateway' };
    const c = classifyError(err);
    expect(c.category).toBe('server_error');
    expect(c.retryable).toBe(true);
  });

  it('classifies generic 4xx as client_error/non-retryable', () => {
    const err = { status: 422, message: 'unprocessable entity' };
    const c = classifyError(err);
    expect(c.category).toBe('client_error');
    expect(c.retryable).toBe(false);
  });

  it('classifies a 429 with an insufficient_quota code as quota_exhausted, not rate_limit', () => {
    const err = { status: 429, code: 'insufficient_quota', message: 'You exceeded your quota' };
    const c = classifyError(err);
    expect(c.category).toBe('quota_exhausted');
    expect(c.retryable).toBe(false);
    expect(c.fallbackable).toBe(true);
  });

  it('classifies a 429 whose status is RESOURCE_EXHAUSTED as quota_exhausted', () => {
    const err = { status: 429, error: { status: 'RESOURCE_EXHAUSTED' }, message: 'no capacity' };
    const c = classifyError(err);
    expect(c.category).toBe('quota_exhausted');
  });

  it('classifies a 429 naming only a spending cap as quota_exhausted with the spending-cap hint', () => {
    const err = { status: 429, message: 'You have hit your spending cap for this project' };
    const c = classifyError(err);
    expect(c.category).toBe('quota_exhausted');
    expect(c.fallbackable).toBe(true);
    expect(c.providerHint).toBe(SPENDING_CAP_PROVIDER_HINT);
  });

  it('classifies a plain 429 with neither a quota code nor spending-cap wording as rate_limit', () => {
    const err = { status: 429, message: 'Too many requests, please slow down' };
    const c = classifyError(err);
    expect(c.category).toBe('rate_limit');
    expect(c.providerHint).toBeUndefined();
  });

  it('classifies an out-of-funds message without a 429 status as billing_exhausted, distinct from quota_exhausted', () => {
    const err = { message: 'Your credit balance is too low to make this request' };
    const c = classifyError(err);
    expect(c.category).toBe('billing_exhausted');
    expect(c.retryable).toBe(false);
    expect(c.fallbackable).toBe(false);
  });

  it('classifies a 402 as billing_exhausted', () => {
    const c = classifyError({ status: 402, message: 'Payment required' });
    expect(c.category).toBe('billing_exhausted');
  });

  it('classifies unknown errors as unknown', () => {
    const c = classifyError({});
    expect(c.category).toBe('unknown');
  });

  it('preserves status field when known', () => {
    const c = classifyError({ status: 400, message: 'bad' });
    expect(c.status).toBe(400);
  });
});

describe('parseContextOverflow', () => {
  it('extracts numeric triple from Anthropic-shape message', () => {
    const r = parseContextOverflow(
      'input length and `max_tokens` exceed context limit: 195000 + 8192 > 200000',
    );
    expect(r).toEqual({
      inputTokens: 195000,
      requestedMaxTokens: 8192,
      contextLimit: 200000,
    });
  });

  it('returns null when no numeric triple', () => {
    expect(parseContextOverflow('something else')).toBeNull();
    expect(parseContextOverflow('context_length_exceeded only')).toBeNull();
  });
});

describe('CannotRetryError', () => {
  it('preserves originalError stack', () => {
    const orig = new Error('underlying');
    const c = {
      category: 'auth' as const,
      code: 'auth_401',
      retryable: false,
      fallbackable: false,
      message: 'auth fail',
    };
    const err = new CannotRetryError(orig, c);
    expect(err.originalError).toBe(orig);
    expect(err.classified).toBe(c);
    expect(err.stack).toBe(orig.stack);
  });
});

describe('FallbackTriggeredError', () => {
  it('renders both models in message', () => {
    const c = {
      category: 'server_overload' as const,
      code: 'overloaded_529',
      retryable: true,
      fallbackable: true,
      message: '529',
    };
    const err = new FallbackTriggeredError(
      PRIMARY_FIXTURE_MODEL_ID,
      FALLBACK_FIXTURE_MODEL_ID,
      c,
      new Error(),
    );
    expect(err.message).toContain(PRIMARY_FIXTURE_MODEL_ID);
    expect(err.message).toContain(FALLBACK_FIXTURE_MODEL_ID);
    expect(err.originalModel).toBe(PRIMARY_FIXTURE_MODEL_ID);
    expect(err.fallbackModel).toBe(FALLBACK_FIXTURE_MODEL_ID);
  });
});

describe('EmptyProviderResponseError', () => {
  it('names the finish reason in its message', () => {
    const err = new EmptyProviderResponseError('length');
    expect(err.name).toBe('EmptyProviderResponseError');
    expect(err.message).toContain('length');
  });

  it('falls back to "none" for a null finish reason', () => {
    const err = new EmptyProviderResponseError(null);
    expect(err.message).toContain('none');
  });
});

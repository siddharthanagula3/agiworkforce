import { describe, expect, it } from 'vitest';

import {
  CannotRetryError,
  FallbackTriggeredError,
  classifyError,
  parseContextOverflow,
} from '../errors';

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
    const err = { status: 400, message: 'model gpt-99 not found' };
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
    const err = new FallbackTriggeredError('claude-opus-4.6', 'claude-sonnet-4.6', c, new Error());
    expect(err.message).toContain('claude-opus-4.6');
    expect(err.message).toContain('claude-sonnet-4.6');
    expect(err.originalModel).toBe('claude-opus-4.6');
    expect(err.fallbackModel).toBe('claude-sonnet-4.6');
  });
});

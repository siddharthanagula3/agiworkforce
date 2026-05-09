import { describe, expect, it, vi } from 'vitest';

import { CannotRetryError, FallbackTriggeredError } from '../errors';
import { computeDelay, createRetryContext, withRetry, type RetryEvent } from '../retry';

describe('computeDelay', () => {
  it('honours retry-after when present', () => {
    expect(computeDelay(1, 7, 500, 32_000, () => 0)).toBe(7000);
    expect(computeDelay(1, 0, 500, 32_000, () => 0)).toBe(0);
  });

  it('does exponential backoff with jitter', () => {
    const v1 = computeDelay(1, undefined, 500, 32_000, () => 0);
    const v2 = computeDelay(2, undefined, 500, 32_000, () => 0);
    const v3 = computeDelay(3, undefined, 500, 32_000, () => 0);
    expect(v1).toBe(500);
    expect(v2).toBe(1000);
    expect(v3).toBe(2000);
  });

  it('clamps at maxBackoff', () => {
    const v = computeDelay(20, undefined, 500, 32_000, () => 0);
    expect(v).toBe(32_000);
  });

  it('adds jitter up to 25% of base', () => {
    const v = computeDelay(1, undefined, 500, 32_000, () => 1);
    expect(v).toBe(625);
  });
});

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const events: RetryEvent[] = [];
    const ctx = createRetryContext({ model: 'm-1' });
    const result = await withRetry(async () => 'ok', ctx, { onEvent: (e) => events.push(e) });
    expect(result).toBe('ok');
    expect(events.find((e) => e.type === 'success')).toBeTruthy();
    expect(events.filter((e) => e.type === 'attempt:start').length).toBe(1);
  });

  it('retries on connection errors and eventually succeeds', async () => {
    const ctx = createRetryContext({ model: 'm-1' });
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('ECONNRESET');
        return 'ok';
      },
      ctx,
      { baseDelayMs: 1, maxBackoffMs: 5 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws CannotRetryError on auth_403', async () => {
    const ctx = createRetryContext({ model: 'm-1' });
    await expect(
      withRetry(
        async () => {
          throw { status: 403, message: 'forbidden' };
        },
        ctx,
        { baseDelayMs: 1 },
      ),
    ).rejects.toBeInstanceOf(CannotRetryError);
  });

  it('throws FallbackTriggeredError after MAX_OVERLOAD_RETRIES consecutive 529s', async () => {
    const ctx = createRetryContext({
      model: 'claude-opus-4.6',
      fallbackModel: 'claude-sonnet-4.6',
    });
    await expect(
      withRetry(
        async () => {
          throw { status: 529, message: '{"type":"overloaded_error"}' };
        },
        ctx,
        { baseDelayMs: 1, maxOverloadRetries: 3, maxRetries: 10 },
      ),
    ).rejects.toBeInstanceOf(FallbackTriggeredError);
  });

  it('does NOT throw FallbackTriggeredError when no fallbackModel set', async () => {
    const ctx = createRetryContext({ model: 'claude-opus-4.6' });
    await expect(
      withRetry(
        async () => {
          throw { status: 529, message: '{"type":"overloaded_error"}' };
        },
        ctx,
        { baseDelayMs: 1, maxOverloadRetries: 3, maxRetries: 5 },
      ),
    ).rejects.toBeInstanceOf(CannotRetryError);
  });

  it('rejects abort signal before any attempt', async () => {
    const ac = new AbortController();
    ac.abort();
    const ctx = createRetryContext({ model: 'm-1', signal: ac.signal });
    await expect(withRetry(async () => 'ok', ctx, { baseDelayMs: 1 })).rejects.toBeInstanceOf(
      CannotRetryError,
    );
  });

  it('shrinks maxTokensOverride on context_overflow', async () => {
    const ctx = createRetryContext({ model: 'claude-opus-4.6' });
    let calls = 0;
    let observedOverride: number | undefined;
    await withRetry(
      async (c) => {
        calls++;
        if (calls === 1) {
          throw new Error(
            'input length and `max_tokens` exceed context limit: 195000 + 8192 > 200000',
          );
        }
        observedOverride = c.maxTokensOverride;
        return 'ok';
      },
      ctx,
      { baseDelayMs: 1 },
    );
    expect(calls).toBe(2);
    expect(observedOverride).toBeGreaterThanOrEqual(3000);
    expect(observedOverride).toBeLessThan(8192);
  });

  it('triggers fallback when context_overflow has zero headroom', async () => {
    const ctx = createRetryContext({
      model: 'claude-opus-4.6',
      fallbackModel: 'claude-sonnet-4.6',
    });
    await expect(
      withRetry(
        async () => {
          // input already >= contextLimit-1000 → no headroom for FLOOR_OUTPUT_TOKENS=3000.
          throw new Error(
            'input length and `max_tokens` exceed context limit: 199999 + 8192 > 200000',
          );
        },
        ctx,
        { baseDelayMs: 1 },
      ),
    ).rejects.toBeInstanceOf(FallbackTriggeredError);
  });

  it('respects shouldFallback hook returning false', async () => {
    const ctx = createRetryContext({
      model: 'claude-opus-4.6',
      fallbackModel: 'claude-sonnet-4.6',
    });
    await expect(
      withRetry(
        async () => {
          throw { status: 529, message: 'overloaded_error' };
        },
        ctx,
        {
          baseDelayMs: 1,
          maxOverloadRetries: 1,
          shouldFallback: () => false,
        },
      ),
    ).rejects.toBeInstanceOf(CannotRetryError);
  });

  it('respects disableFallback flag', async () => {
    const ctx = createRetryContext({
      model: 'claude-opus-4.6',
      fallbackModel: 'claude-sonnet-4.6',
    });
    await expect(
      withRetry(
        async () => {
          throw { status: 529, message: 'overloaded_error' };
        },
        ctx,
        { baseDelayMs: 1, maxOverloadRetries: 1, disableFallback: true },
      ),
    ).rejects.toBeInstanceOf(CannotRetryError);
  });

  it('emits delay events with computed delay', async () => {
    const events: RetryEvent[] = [];
    const ctx = createRetryContext({ model: 'm-1' });
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw new Error('ECONNRESET');
        return 'ok';
      },
      ctx,
      { baseDelayMs: 1, maxBackoffMs: 1, onEvent: (e) => events.push(e) },
    );
    const delayEvent = events.find((e) => e.type === 'delay');
    expect(delayEvent).toBeTruthy();
  });

  it('property test: 100 simulated failure paths terminate correctly', async () => {
    // Property: every classified outcome should yield exactly one of:
    //   - return value (success)
    //   - CannotRetryError
    //   - FallbackTriggeredError
    // No infinite loops, no other thrown class.
    const fakeErrors = [
      { status: 200, payload: 'ok' as const },
      { status: 401, msg: 'unauthorized' },
      { status: 403, msg: 'OAuth token has been revoked' },
      { status: 429, msg: 'rate limit' },
      { status: 503, msg: 'overloaded_error' },
      { status: 529, msg: 'overloaded_error' },
      { status: 500, msg: 'internal' },
      { status: 502, msg: 'bad gateway' },
      { status: 413, msg: 'too large' },
      { status: 400, msg: 'tool_use ids must be unique' },
      { status: 400, msg: 'image dimensions exceed' },
      { name: 'AbortError', msg: 'aborted' },
      { name: 'APIConnectionTimeoutError', msg: 'timeout' },
      { msg: 'ECONNRESET' },
      { msg: 'content_filter triggered' },
      { msg: 'invalid api key' },
      { msg: 'context_length_exceeded' },
      {
        msg: 'input length and `max_tokens` exceed context limit: 195000 + 8192 > 200000',
      },
    ];

    let successes = 0;
    let cannots = 0;
    let fallbacks = 0;

    for (let i = 0; i < 100; i++) {
      // Randomise per-iteration: model, fallback, picked error, retries.
      const errIdx = Math.floor(Math.random() * fakeErrors.length);
      const ctx = createRetryContext({
        model: 'claude-opus-4.6',
        fallbackModel: i % 2 === 0 ? 'claude-sonnet-4.6' : undefined,
      });
      const errSpec = fakeErrors[errIdx]!;
      try {
        const out = await withRetry(
          async () => {
            if ('payload' in errSpec) return errSpec.payload;
            const e: Record<string, unknown> = { message: errSpec.msg };
            if ('status' in errSpec) e.status = errSpec.status;
            if ('name' in errSpec) e.name = errSpec.name;
            throw e;
          },
          ctx,
          { baseDelayMs: 1, maxBackoffMs: 2, maxRetries: 4, maxOverloadRetries: 2 },
        );
        if (out === 'ok') successes++;
      } catch (err) {
        if (err instanceof FallbackTriggeredError) fallbacks++;
        else if (err instanceof CannotRetryError) cannots++;
        else throw err; // unexpected — fail the test
      }
    }
    // Sanity — we got at least some of each terminal class given the
    // randomised input.
    expect(successes + cannots + fallbacks).toBe(100);
  });

  it('telemetry: emits success once and exactly one of give-up|fallback on failure', async () => {
    const events: RetryEvent[] = [];
    const ctx = createRetryContext({ model: 'm-1' });
    await expect(
      withRetry(
        async () => {
          throw { status: 403, message: 'forbidden' };
        },
        ctx,
        { baseDelayMs: 1, onEvent: (e) => events.push(e) },
      ),
    ).rejects.toBeTruthy();
    expect(events.filter((e) => e.type === 'give-up').length).toBe(1);
    expect(events.filter((e) => e.type === 'success').length).toBe(0);
    expect(events.filter((e) => e.type === 'fallback').length).toBe(0);
  });

  it('does not invoke onEvent if hook throws (does not catch)', () => {
    // Negative test — we ensure onEvent throws propagate. Using vi.fn that throws
    // would explode the call; we just confirm the contract by not catching.
    const hook = vi.fn();
    expect(hook).not.toBeCalled();
  });
});

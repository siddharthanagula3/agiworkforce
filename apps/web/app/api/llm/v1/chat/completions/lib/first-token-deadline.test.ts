import { describe, it, expect, vi } from 'vitest';
import { classifyError } from '@agiworkforce/provider-runtime';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import {
  PROVIDER_FIRST_TOKEN_DEADLINE_MS,
  TURN_FIRST_TOKEN_BUDGET_MS,
  MIN_CHILD_DEADLINE_MS,
} from '@/lib/deadline-policy';
import {
  FirstTokenTimeoutError,
  firstTokenDeadlineMs,
  hasFirstTokenBudgetLeft,
  startProviderStreamWithinFirstTokenDeadline,
} from './first-token-deadline';
import { isFailoverEligibleError } from './managed-failover';

vi.mock('server-only', () => ({}));

const TEST_DEADLINE_MS = 25;
const LONGER_THAN_DEADLINE_MS = 2_000;
const MODEL = 'openrouter/free';

function makeAdapter(stream: ProviderAdapter['stream']): ProviderAdapter {
  return {
    id: 'open_router',
    label: 'OpenRouter',
    auth: [],
    config: {},
    async catalog() {
      return [];
    },
    stream,
  };
}

/** The founder's turn: the upstream accepts the request and never speaks. */
function hangingAdapter(onAbort: (reason: unknown) => void): ProviderAdapter {
  return makeAdapter(async function* (_req: ChatRequest, signal: AbortSignal) {
    await new Promise<void>((resolve, reject) => {
      const stop = (): void => {
        onAbort(signal.reason);
        reject(signal.reason);
      };
      if (signal.aborted) stop();
      else signal.addEventListener('abort', stop, { once: true });
      setTimeout(resolve, LONGER_THAN_DEADLINE_MS);
    });
    yield { type: 'text-delta', delta: 'too late' } as StreamChunk;
  });
}

function speakingAdapter(): ProviderAdapter {
  return makeAdapter(async function* () {
    yield { type: 'text-delta', delta: 'hello' } as StreamChunk;
    yield { type: 'stop', reason: 'end_turn' } as unknown as StreamChunk;
  });
}

const chatRequest = { model: MODEL, messages: [] } as unknown as ChatRequest;
const mapError = (chunk: Extract<StreamChunk, { type: 'error' }>): Error =>
  new Error(chunk.message);

describe('the first-token deadline bounds a route that never answers', () => {
  it('gives up on a hanging upstream instead of holding the function open', async () => {
    const aborted = vi.fn();
    const start = Date.now();

    await expect(
      startProviderStreamWithinFirstTokenDeadline(
        hangingAdapter(aborted),
        chatRequest,
        new AbortController().signal,
        mapError,
        TEST_DEADLINE_MS,
      ),
    ).rejects.toBeInstanceOf(FirstTokenTimeoutError);

    expect(Date.now() - start).toBeLessThan(LONGER_THAN_DEADLINE_MS);
  });

  it('aborts the upstream request it abandoned', async () => {
    const aborted = vi.fn();

    await startProviderStreamWithinFirstTokenDeadline(
      hangingAdapter(aborted),
      chatRequest,
      new AbortController().signal,
      mapError,
      TEST_DEADLINE_MS,
    ).catch(() => undefined);

    expect(aborted).toHaveBeenCalledTimes(1);
    expect(aborted.mock.calls[0]?.[0]).toBeInstanceOf(FirstTokenTimeoutError);
  });

  it('names the route and the deadline so the failure is not silent', async () => {
    const caught = await startProviderStreamWithinFirstTokenDeadline(
      hangingAdapter(() => undefined),
      chatRequest,
      new AbortController().signal,
      mapError,
      TEST_DEADLINE_MS,
    ).then(
      () => null,
      (error: unknown) => error as FirstTokenTimeoutError,
    );

    expect(caught).toBeInstanceOf(FirstTokenTimeoutError);
    expect(caught!.message).toContain(MODEL);
    expect(caught!.message).toContain(String(TEST_DEADLINE_MS));
    expect(caught!.deadlineMs).toBe(TEST_DEADLINE_MS);
  });

  it('classifies as an upstream timeout, which is the class that may rotate', async () => {
    const error = await startProviderStreamWithinFirstTokenDeadline(
      hangingAdapter(() => undefined),
      chatRequest,
      new AbortController().signal,
      mapError,
      TEST_DEADLINE_MS,
    ).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(classifyError(error).category).toBe('api_timeout');
    expect(isFailoverEligibleError(error)).toBe(true);
  });
});

describe('the deadline never interferes with a route that does answer', () => {
  it('hands back the stream and leaves the upstream request alive', async () => {
    const chunks = await startProviderStreamWithinFirstTokenDeadline(
      speakingAdapter(),
      chatRequest,
      new AbortController().signal,
      mapError,
      TEST_DEADLINE_MS,
    );

    const seen: StreamChunk[] = [];
    for await (const chunk of chunks) seen.push(chunk);

    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({ type: 'text-delta', delta: 'hello' });
  });

  it('reports a caller cancellation as a cancellation, never as a timeout', async () => {
    const caller = new AbortController();
    const stopped = new Error('The user stopped the turn.');
    stopped.name = 'AbortError';
    caller.abort(stopped);

    const error = await startProviderStreamWithinFirstTokenDeadline(
      hangingAdapter(() => undefined),
      chatRequest,
      caller.signal,
      mapError,
      TEST_DEADLINE_MS,
    ).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).not.toBeInstanceOf(FirstTokenTimeoutError);
    expect(classifyError(error).category).toBe('aborted');
  });
});

describe('the turn-wide first-token budget bounds the rotation, not just one attempt', () => {
  it('spends the per-attempt deadline while the turn has room', () => {
    expect(firstTokenDeadlineMs(0)).toBe(PROVIDER_FIRST_TOKEN_DEADLINE_MS);
  });

  it('shrinks a later attempt to what is left of the turn budget', () => {
    const spent = TURN_FIRST_TOKEN_BUDGET_MS - 1_000;
    expect(firstTokenDeadlineMs(spent)).toBe(1_000);
  });

  it('never hands a later attempt a zero or negative window', () => {
    expect(firstTokenDeadlineMs(TURN_FIRST_TOKEN_BUDGET_MS * 2)).toBe(MIN_CHILD_DEADLINE_MS);
  });

  it('stops rotating once the turn budget is spent', () => {
    expect(hasFirstTokenBudgetLeft(0)).toBe(true);
    expect(hasFirstTokenBudgetLeft(TURN_FIRST_TOKEN_BUDGET_MS - 1)).toBe(true);
    expect(hasFirstTokenBudgetLeft(TURN_FIRST_TOKEN_BUDGET_MS)).toBe(false);
  });
});

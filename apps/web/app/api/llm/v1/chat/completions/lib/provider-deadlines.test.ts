import { describe, it, expect, vi } from 'vitest';
import { classifyError } from '@agiworkforce/provider-runtime';
import {
  listCanonicalModels,
  type ChatRequest,
  type ProviderAdapter,
  type StreamChunk,
} from '@agiworkforce/types';
import {
  PROVIDER_FIRST_TOKEN_DEADLINE_MS,
  TURN_FIRST_TOKEN_BUDGET_MS,
  MIN_CHILD_DEADLINE_MS,
} from '@/lib/deadline-policy';
import {
  ProviderFirstTokenDeadlineError,
  ProviderStreamDeadlineError,
  firstTokenDeadlineMs,
  hasFirstTokenBudgetLeft,
  markFirstProviderChunk,
  startProviderStreamWithinTurnDeadlines,
} from './provider-deadlines';
import { isFailoverEligibleError } from './managed-failover';

vi.mock('server-only', () => ({}));

const TEST_DEADLINE_MS = 25;
const LONGER_THAN_DEADLINE_MS = 2_000;
const ZERO_COST_MODEL = (() => {
  const model = listCanonicalModels().find(
    (candidate) => candidate.inputCost === 0 && candidate.outputCost === 0 && candidate.apiModelId,
  );
  if (!model) throw new Error('The catalog must expose a zero-cost model with an api id');
  return model;
})();

const MODEL = ZERO_COST_MODEL.apiModelId;

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
      startProviderStreamWithinTurnDeadlines(
        hangingAdapter(aborted),
        chatRequest,
        new AbortController().signal,
        mapError,
        { firstTokenMs: TEST_DEADLINE_MS },
      ),
    ).rejects.toBeInstanceOf(ProviderFirstTokenDeadlineError);

    expect(Date.now() - start).toBeLessThan(LONGER_THAN_DEADLINE_MS);
  });

  it('aborts the upstream request it abandoned', async () => {
    const aborted = vi.fn();

    await startProviderStreamWithinTurnDeadlines(
      hangingAdapter(aborted),
      chatRequest,
      new AbortController().signal,
      mapError,
      { firstTokenMs: TEST_DEADLINE_MS },
    ).catch(() => undefined);

    expect(aborted).toHaveBeenCalledTimes(1);
    expect(aborted.mock.calls[0]?.[0]).toBeInstanceOf(ProviderFirstTokenDeadlineError);
  });

  it('names the route and the deadline so the failure is not silent', async () => {
    const caught = await startProviderStreamWithinTurnDeadlines(
      hangingAdapter(() => undefined),
      chatRequest,
      new AbortController().signal,
      mapError,
      { firstTokenMs: TEST_DEADLINE_MS },
    ).then(
      () => null,
      (error: unknown) => error as ProviderFirstTokenDeadlineError,
    );

    expect(caught).toBeInstanceOf(ProviderFirstTokenDeadlineError);
    expect(caught!.message).toContain(MODEL);
    expect(caught!.message).toContain(String(TEST_DEADLINE_MS));
    expect(caught!.deadlineMs).toBe(TEST_DEADLINE_MS);
  });

  it('classifies as an upstream timeout, which is the class that may rotate', async () => {
    const error = await startProviderStreamWithinTurnDeadlines(
      hangingAdapter(() => undefined),
      chatRequest,
      new AbortController().signal,
      mapError,
      { firstTokenMs: TEST_DEADLINE_MS },
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
    const chunks = await startProviderStreamWithinTurnDeadlines(
      speakingAdapter(),
      chatRequest,
      new AbortController().signal,
      mapError,
      { firstTokenMs: TEST_DEADLINE_MS },
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

    const error = await startProviderStreamWithinTurnDeadlines(
      hangingAdapter(() => undefined),
      chatRequest,
      caller.signal,
      mapError,
      { firstTokenMs: TEST_DEADLINE_MS },
    ).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).not.toBeInstanceOf(ProviderFirstTokenDeadlineError);
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

/**
 * Production, 30 days: 1,785 invocations killed at 800 s. The first-chunk peek
 * used to end the deadline window AND the client-disconnect forwarding, so from
 * the first chunk on nothing bounded the upstream fetch but the platform.
 */
describe('the bounds outlive the first chunk, not just the peek', () => {
  function slowTailAdapter(onAbort: (reason: unknown) => void): ProviderAdapter {
    return makeAdapter(async function* (_req: ChatRequest, signal: AbortSignal) {
      yield { type: 'text-delta', delta: 'first' } as StreamChunk;
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

  it('aborts the upstream when the client disconnects mid-stream', async () => {
    const aborted = vi.fn();
    const caller = new AbortController();
    const chunks = await startProviderStreamWithinTurnDeadlines(
      slowTailAdapter(aborted),
      chatRequest,
      caller.signal,
      mapError,
      { firstTokenMs: TEST_DEADLINE_MS, streamMs: LONGER_THAN_DEADLINE_MS * 2 },
    );

    const seen: StreamChunk[] = [];
    await expect(
      (async () => {
        for await (const chunk of chunks) {
          seen.push(chunk);
          caller.abort(new Error('the client went away'));
        }
      })(),
    ).rejects.toBeDefined();

    expect(seen).toHaveLength(1);
    expect(aborted).toHaveBeenCalledTimes(1);
  });

  it('stops a stream that runs past the turn budget and names the deadline', async () => {
    const aborted = vi.fn();
    const chunks = await startProviderStreamWithinTurnDeadlines(
      slowTailAdapter(aborted),
      chatRequest,
      new AbortController().signal,
      mapError,
      { firstTokenMs: TEST_DEADLINE_MS, streamMs: TEST_DEADLINE_MS * 2 },
    );

    const drain = (async () => {
      for await (const chunk of chunks) void chunk;
    })();

    await expect(drain).rejects.toBeInstanceOf(ProviderStreamDeadlineError);
    expect(aborted).toHaveBeenCalledTimes(1);
  });

  it('never lets the first-token timer fire once a chunk has arrived', async () => {
    const chunks = await startProviderStreamWithinTurnDeadlines(
      slowTailAdapter(() => undefined),
      chatRequest,
      new AbortController().signal,
      mapError,
      { firstTokenMs: TEST_DEADLINE_MS, streamMs: TEST_DEADLINE_MS * 3 },
    );

    const error = await (async () => {
      for await (const chunk of chunks) void chunk;
      return null;
    })().catch((caught: unknown) => caught);

    expect(error).not.toBeInstanceOf(ProviderFirstTokenDeadlineError);
    expect(error).toBeInstanceOf(ProviderStreamDeadlineError);
  });
});

describe('a caller that drains the stream itself still disarms the first-token timer', () => {
  it('marks the first chunk and leaves the rest of the drain to the stream deadline', async () => {
    const marked = vi.fn();
    async function* source(): AsyncIterable<StreamChunk> {
      yield { type: 'text-delta', delta: 'a' } as StreamChunk;
      yield { type: 'text-delta', delta: 'b' } as StreamChunk;
    }

    const seen: StreamChunk[] = [];
    for await (const chunk of markFirstProviderChunk(source(), marked)) seen.push(chunk);

    expect(seen).toHaveLength(2);
    expect(marked).toHaveBeenCalledTimes(1);
  });
});

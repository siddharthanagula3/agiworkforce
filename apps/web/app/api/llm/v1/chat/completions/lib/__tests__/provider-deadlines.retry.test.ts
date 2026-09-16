import { describe, it, expect, vi, afterEach } from 'vitest';
import { MAX_OVERLOAD_RETRIES } from '@agiworkforce/provider-runtime';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';
import { MIN_CHILD_DEADLINE_MS } from '@/lib/deadline-policy';
import {
  ProviderFirstTokenDeadlineError,
  MAX_SAME_ROUTE_RETRY_ATTEMPTS,
  startProviderStreamWithinTurnDeadlines,
} from '../provider-deadlines';

vi.mock('server-only', () => ({}));

const MODEL = 'test-model';
const GRANTED_FIRST_TOKEN_MS = 2_000;
const LONGER_THAN_ANY_DEADLINE_MS = 30_000;

const chatRequest = { model: MODEL, messages: [] } as unknown as ChatRequest;

interface UpstreamFailure {
  status: number;
  message: string;
  retryAfterSeconds?: number;
}

/**
 * The seam's own `mapError`: the route's adapters reconstruct an `Error` from
 * the first chunk, carrying the status and any Retry-After the provider sent.
 */
const mapError = (chunk: Extract<StreamChunk, { type: 'error' }>): Error => {
  const error = new Error(chunk.message) as Error & { retryAfterSeconds?: number };
  const retryAfter = (chunk as { retryAfterSeconds?: number }).retryAfterSeconds;
  if (retryAfter !== undefined) error.retryAfterSeconds = retryAfter;
  return error;
};

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

/** Fails the first-chunk peek with `failures[n]`, then speaks on the next attempt. */
function failingAdapter(
  failures: readonly UpstreamFailure[],
  attempts: { count: number },
): ProviderAdapter {
  return makeAdapter(async function* () {
    const failure = failures[attempts.count];
    attempts.count += 1;
    if (failure) {
      yield {
        type: 'error',
        code: String(failure.status),
        message: failure.message,
        ...(failure.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: failure.retryAfterSeconds }
          : {}),
      } as unknown as StreamChunk;
      return;
    }
    yield { type: 'text-delta', delta: 'hello' } as StreamChunk;
    yield { type: 'text-delta', delta: ' world' } as StreamChunk;
  });
}

const overload = (message: string, retryAfterSeconds?: number): UpstreamFailure => ({
  status: 529,
  message,
  ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
});

async function drain(chunks: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const seen: StreamChunk[] = [];
  for await (const chunk of chunks) seen.push(chunk);
  return seen;
}

function start(
  adapter: ProviderAdapter,
  signal: AbortSignal,
  firstTokenMs = GRANTED_FIRST_TOKEN_MS,
): Promise<AsyncIterable<StreamChunk>> {
  return startProviderStreamWithinTurnDeadlines(adapter, chatRequest, signal, mapError, {
    firstTokenMs,
    streamMs: LONGER_THAN_ANY_DEADLINE_MS,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a transient failure at stream start costs a retry, not the route', () => {
  it('retries a 529 on the same route and returns the second attempt', async () => {
    const attempts = { count: 0 };
    const chunks = await start(
      failingAdapter([overload('overloaded', 0)], attempts),
      new AbortController().signal,
    );

    expect(await drain(chunks)).toEqual([
      { type: 'text-delta', delta: 'hello' },
      { type: 'text-delta', delta: ' world' },
    ]);
    expect(attempts.count).toBe(2);
  });

  it('does not retry a 401, which the same key would only fail again', async () => {
    const attempts = { count: 0 };

    await expect(
      start(
        failingAdapter(
          [{ status: 401, message: 'invalid x-api-key' }, overload('unreachable', 0)],
          attempts,
        ),
        new AbortController().signal,
      ),
    ).rejects.toThrow('invalid x-api-key');

    expect(attempts.count).toBe(1);
  });

  it('caps a route that always fails and surfaces the last attempt, not the first', async () => {
    const attempts = { count: 0 };
    const failures = Array.from({ length: MAX_OVERLOAD_RETRIES + 2 }, (_unused, index) =>
      overload(`overloaded attempt ${index + 1}`, 0),
    );

    await expect(
      start(failingAdapter(failures, attempts), new AbortController().signal),
    ).rejects.toThrow(`overloaded attempt ${MAX_OVERLOAD_RETRIES}`);

    expect(attempts.count).toBe(MAX_OVERLOAD_RETRIES);
  });

  it('spends fewer attempts on a class that is not an overload', async () => {
    const attempts = { count: 0 };
    const failures = Array.from({ length: 5 }, (_unused, index) => ({
      status: 500,
      message: `internal error ${index + 1}`,
      retryAfterSeconds: 0,
    }));

    await expect(
      start(failingAdapter(failures, attempts), new AbortController().signal),
    ).rejects.toThrow(`internal error ${MAX_SAME_ROUTE_RETRY_ATTEMPTS}`);

    expect(attempts.count).toBe(MAX_SAME_ROUTE_RETRY_ATTEMPTS);
    expect(MAX_SAME_ROUTE_RETRY_ATTEMPTS).toBeLessThan(MAX_OVERLOAD_RETRIES);
  });
});

describe('the caller keeps control of a turn that is waiting to retry', () => {
  it('stops the backoff on an aborted signal and never tries again', async () => {
    const attempts = { count: 0 };
    const caller = new AbortController();
    const adapter = makeAdapter(async function* () {
      attempts.count += 1;
      caller.abort(new Error('the user stopped the turn'));
      yield {
        type: 'error',
        code: '529',
        message: 'overloaded',
        retryAfterSeconds: 10,
      } as unknown as StreamChunk;
    });

    const startedAt = Date.now();
    await expect(start(adapter, caller.signal)).rejects.toThrow('overloaded');

    expect(attempts.count).toBe(1);
    expect(Date.now() - startedAt).toBeLessThan(GRANTED_FIRST_TOKEN_MS);
  });
});

describe('a retry never buys the turn more time than the caller granted', () => {
  it('arms the second attempt with a smaller first-token deadline than the first', async () => {
    const attempts = { count: 0 };
    const waitSeconds = 1;
    const adapter = makeAdapter(async function* (_request: ChatRequest, signal: AbortSignal) {
      attempts.count += 1;
      if (attempts.count === 1) {
        yield {
          type: 'error',
          code: '529',
          message: 'overloaded',
          retryAfterSeconds: waitSeconds,
        } as unknown as StreamChunk;
        return;
      }
      // The second attempt never answers, so the deadline it was armed with
      // is the one that fires and names itself.
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      yield { type: 'text-delta', delta: 'too late' } as StreamChunk;
    });

    const failure = await start(adapter, new AbortController().signal).then(
      () => null,
      (error: unknown) => error as ProviderFirstTokenDeadlineError,
    );

    expect(failure).toBeInstanceOf(ProviderFirstTokenDeadlineError);
    expect(failure!.deadlineMs).toBeLessThan(GRANTED_FIRST_TOKEN_MS);
    expect(failure!.deadlineMs).toBeLessThanOrEqual(GRANTED_FIRST_TOKEN_MS - waitSeconds * 1_000);
    expect(attempts.count).toBe(2);
  });

  it('clamps a long Retry-After to what is left rather than overrunning the turn', async () => {
    const attempts = { count: 0 };
    const startedAt = Date.now();
    const chunks = await start(
      failingAdapter([overload('overloaded', 60)], attempts),
      new AbortController().signal,
    );

    expect(await drain(chunks)).toHaveLength(2);
    expect(attempts.count).toBe(2);
    expect(Date.now() - startedAt).toBeLessThan(GRANTED_FIRST_TOKEN_MS);
  });

  it('refuses a retry when the turn has only the child-deadline floor left', async () => {
    const attempts = { count: 0 };

    await expect(
      start(
        failingAdapter([overload('overloaded', 0), overload('unreachable', 0)], attempts),
        new AbortController().signal,
        MIN_CHILD_DEADLINE_MS,
      ),
    ).rejects.toThrow('overloaded');

    expect(attempts.count).toBe(1);
  });

  it('does not retry a deadline expiry, which is the rotation layer to decide', async () => {
    const attempts = { count: 0 };
    const adapter = makeAdapter(async function* (_request: ChatRequest, signal: AbortSignal) {
      attempts.count += 1;
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      yield { type: 'text-delta', delta: 'too late' } as StreamChunk;
    });

    await expect(start(adapter, new AbortController().signal, 50)).rejects.toBeInstanceOf(
      ProviderFirstTokenDeadlineError,
    );

    expect(attempts.count).toBe(1);
  });
});

describe('a failed attempt leaves no timer behind', () => {
  it('releases the deadlines it armed for every attempt it abandoned', async () => {
    const live = new Set<unknown>();
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      handler: any,
      ms?: number,
      ...args: any[]
    ) => {
      const id = realSetTimeout(() => {
        live.delete(id);
        handler(...args);
      }, ms);
      live.add(id);
      return id;
    }) as any);
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((id: unknown) => {
      live.delete(id);
      realClearTimeout(id as Parameters<typeof clearTimeout>[0]);
    }) as any);

    const attempts = { count: 0 };
    const chunks = await start(
      failingAdapter([overload('overloaded', 0), overload('overloaded again', 0)], attempts),
      new AbortController().signal,
    );
    await drain(chunks);

    expect(attempts.count).toBe(3);
    expect([...live]).toEqual([]);
  });
});

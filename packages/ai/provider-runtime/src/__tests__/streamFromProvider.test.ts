import { describe, expect, it, vi } from 'vitest';

import { streamFromProvider, type StreamFromProviderOptions } from '../client/streamFromProvider';
import { StreamIdleTimeoutError } from '../watchdog';

type Chunk = Record<string, unknown>;

const FIXTURE_MODEL_ID = 'fixture-stream-model';

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

function sseStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function okResponse(sseText: string): Response {
  return {
    ok: true,
    status: 200,
    body: sseStream(sseText),
    text: () => Promise.resolve(sseText),
  } as unknown as Response;
}

function errorResponse(status: number, bodyText: string): Response {
  return {
    ok: false,
    status,
    body: null,
    text: () => Promise.resolve(bodyText),
  } as unknown as Response;
}

function fetchMockResolving(response: Response) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => response,
  ) as unknown as StreamFromProviderOptions<unknown>['fetchImpl'];
}

const BASE: Omit<StreamFromProviderOptions<{ model: string }>, 'fetchImpl'> = {
  providerId: 'anthropic',
  authToken: 'test-token',
  request: { model: FIXTURE_MODEL_ID },
  clientTag: 'agiworkforce-test',
};

describe('streamFromProvider — normal SSE streaming', () => {
  it('yields text-delta chunks and stops on [DONE]', async () => {
    const sseText =
      'data: {"type":"text-delta","delta":"Hello"}\n\n' +
      'data: {"type":"text-delta","delta":" world"}\n\n' +
      'data: [DONE]\n\n';
    const fetchImpl = fetchMockResolving(okResponse(sseText));

    const chunks = await collect<Chunk>(streamFromProvider({ ...BASE, fetchImpl }));

    expect(chunks).toEqual([
      { type: 'text-delta', delta: 'Hello' },
      { type: 'text-delta', delta: ' world' },
    ]);
  });

  it('stops cleanly on a stop chunk followed by [DONE]', async () => {
    const sseText = 'data: {"type":"stop","reason":"end_turn"}\n\n' + 'data: [DONE]\n\n';
    const fetchImpl = fetchMockResolving(okResponse(sseText));

    const chunks = await collect<Chunk>(streamFromProvider({ ...BASE, fetchImpl }));

    expect(chunks).toEqual([{ type: 'stop', reason: 'end_turn' }]);
  });

  it('passes tool-call delta frames through unmodified', async () => {
    const sseText =
      'data: {"type":"tool-use-start","toolUseId":"t1","name":"search"}\n\n' +
      'data: {"type":"tool-use-delta","toolUseId":"t1","deltaJson":"{\\"q\\":\\"x\\"}"}\n\n' +
      'data: {"type":"tool-use-end","toolUseId":"t1"}\n\n' +
      'data: {"type":"stop","reason":"tool_use"}\n\n';
    const fetchImpl = fetchMockResolving(okResponse(sseText));

    const chunks = await collect<Chunk>(streamFromProvider({ ...BASE, fetchImpl }));

    expect(chunks).toEqual([
      { type: 'tool-use-start', toolUseId: 't1', name: 'search' },
      { type: 'tool-use-delta', toolUseId: 't1', deltaJson: '{"q":"x"}' },
      { type: 'tool-use-end', toolUseId: 't1' },
      { type: 'stop', reason: 'tool_use' },
    ]);
  });

  it('splits multi-line data: frames and joins them with newlines', async () => {
    const sseText = 'data: {"type":"text-delta",\ndata: "delta":"multi"}\n\n' + 'data: [DONE]\n\n';
    const fetchImpl = fetchMockResolving(okResponse(sseText));

    const chunks = await collect<Chunk>(streamFromProvider({ ...BASE, fetchImpl }));

    expect(chunks).toEqual([{ type: 'text-delta', delta: 'multi' }]);
  });
});

describe('streamFromProvider — request construction', () => {
  it('POSTs to baseUrl + /api/v1/providers/:id/stream with auth + clientTag headers', async () => {
    const fetchImpl = fetchMockResolving(okResponse('data: [DONE]\n\n'));

    await collect(
      streamFromProvider({
        ...BASE,
        providerId: 'moonshot',
        baseUrl: 'https://api.agi.test/',
        fetchImpl,
      }),
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.agi.test/api/v1/providers/moonshot/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          authorization: 'Bearer test-token',
          'x-requested-with': 'agiworkforce-test',
        }),
        body: JSON.stringify({ model: FIXTURE_MODEL_ID }),
      }),
    );
  });

  it('defaults baseUrl to same-origin relative URL when omitted', async () => {
    const fetchImpl = fetchMockResolving(okResponse('data: [DONE]\n\n'));

    await collect(streamFromProvider({ ...BASE, fetchImpl }));

    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/providers/anthropic/stream', expect.anything());
  });

  it('falls back to the global fetch when fetchImpl is omitted', async () => {
    const globalFetch = vi.fn(async () => okResponse('data: [DONE]\n\n'));
    vi.stubGlobal('fetch', globalFetch);
    try {
      await collect(streamFromProvider(BASE));
      expect(globalFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('omits the signal key entirely when no signal is supplied', async () => {
    const fetchImpl = fetchMockResolving(okResponse('data: [DONE]\n\n'));
    await collect(streamFromProvider({ ...BASE, fetchImpl }));
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect('signal' in init).toBe(false);
  });
});

describe('streamFromProvider — non-200 error classification', () => {
  it('yields a retryable error chunk for a 5xx response', async () => {
    const fetchImpl = fetchMockResolving(errorResponse(503, 'model overloaded'));

    const chunks = await collect<Chunk>(streamFromProvider({ ...BASE, fetchImpl }));

    expect(chunks).toEqual([
      { type: 'error', message: 'model overloaded', retryable: true },
      { type: 'stop', reason: 'error' },
    ]);
  });

  it('yields a non-retryable error chunk for a 4xx response', async () => {
    const fetchImpl = fetchMockResolving(errorResponse(400, 'bad request'));

    const chunks = await collect<Chunk>(streamFromProvider({ ...BASE, fetchImpl }));

    expect(chunks).toEqual([
      { type: 'error', message: 'bad request' },
      { type: 'stop', reason: 'error' },
    ]);
  });

  it('falls back to a generic "Upstream error N" message when the body is empty', async () => {
    const fetchImpl = fetchMockResolving(errorResponse(429, ''));

    const chunks = await collect<Chunk>(streamFromProvider({ ...BASE, fetchImpl }));

    expect(chunks[0]).toEqual({ type: 'error', message: 'Upstream error 429' });
  });
});

describe('streamFromProvider — paywall detection (opt-in)', () => {
  const paywallBody = JSON.stringify({
    kind: 'paywall',
    feature: 'token_cap',
    requiredTier: 'pro',
    reason: '2M token monthly cap reached',
  });

  it('does NOT detect paywall bodies by default', async () => {
    const fetchImpl = fetchMockResolving(errorResponse(429, paywallBody));

    const chunks = await collect<Chunk>(streamFromProvider({ ...BASE, fetchImpl }));

    expect(chunks[0]).toMatchObject({ type: 'error' });
    expect(chunks.some((c) => c.type === 'paywall')).toBe(false);
  });

  it('yields a paywall chunk for a 429 + {kind:"paywall",...} body when detectPaywall is on', async () => {
    const fetchImpl = fetchMockResolving(errorResponse(429, paywallBody));

    const chunks = await collect<Chunk>(
      streamFromProvider({ ...BASE, fetchImpl, detectPaywall: true }),
    );

    expect(chunks).toEqual([
      {
        type: 'paywall',
        feature: 'token_cap',
        requiredTier: 'pro',
        reason: '2M token monthly cap reached',
      },
      { type: 'stop', reason: 'error' },
    ]);
  });

  it('omits the reason field when absent from the paywall body', async () => {
    const body = JSON.stringify({ kind: 'paywall', feature: 'image_quota', requiredTier: 'hobby' });
    const fetchImpl = fetchMockResolving(errorResponse(429, body));

    const chunks = await collect<Chunk>(
      streamFromProvider({ ...BASE, fetchImpl, detectPaywall: true }),
    );

    expect(chunks[0]).toEqual({ type: 'paywall', feature: 'image_quota', requiredTier: 'hobby' });
  });

  it('falls back to a generic error when the paywall body has the wrong kind', async () => {
    const body = JSON.stringify({ kind: 'downgrade', modelOverride: FIXTURE_MODEL_ID });
    const fetchImpl = fetchMockResolving(errorResponse(429, body));

    const chunks = await collect<Chunk>(
      streamFromProvider({ ...BASE, fetchImpl, detectPaywall: true }),
    );

    expect(chunks[0]).toMatchObject({ type: 'error' });
    expect(chunks.some((c) => c.type === 'paywall')).toBe(false);
  });

  it('does not treat a non-429 status as a paywall even with a paywall-shaped body', async () => {
    const fetchImpl = fetchMockResolving(errorResponse(503, paywallBody));

    const chunks = await collect<Chunk>(
      streamFromProvider({ ...BASE, fetchImpl, detectPaywall: true }),
    );

    expect(chunks[0]).toMatchObject({ type: 'error', retryable: true });
    expect(chunks.some((c) => c.type === 'paywall')).toBe(false);
  });
});

describe('streamFromProvider — malformed SSE frames', () => {
  it('silently skips a malformed frame by default and keeps reading', async () => {
    const sseText =
      'data: {"bad json"\n\n' + 'data: {"type":"text-delta","delta":"ok"}\n\n' + 'data: [DONE]\n\n';
    const fetchImpl = fetchMockResolving(okResponse(sseText));

    const chunks = await collect<Chunk>(streamFromProvider({ ...BASE, fetchImpl }));

    expect(chunks).toEqual([{ type: 'text-delta', delta: 'ok' }]);
  });

  it('surfaces a MALFORMED_SSE_FRAME error chunk and continues when surfaceMalformedFrames is on', async () => {
    const sseText =
      'data: {"bad json"\n\n' + 'data: {"type":"text-delta","delta":"ok"}\n\n' + 'data: [DONE]\n\n';
    const fetchImpl = fetchMockResolving(okResponse(sseText));

    const chunks = await collect<Chunk>(
      streamFromProvider({ ...BASE, fetchImpl, surfaceMalformedFrames: true }),
    );

    expect(chunks[0]).toMatchObject({
      type: 'error',
      code: 'MALFORMED_SSE_FRAME',
      retryable: false,
    });
    expect(chunks[1]).toEqual({ type: 'text-delta', delta: 'ok' });
  });
});

describe('streamFromProvider — catchTransportErrors', () => {
  it('propagates a fetch rejection as a thrown error by default', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as StreamFromProviderOptions<unknown>['fetchImpl'];

    await expect(collect(streamFromProvider({ ...BASE, fetchImpl }))).rejects.toThrow(
      'network down',
    );
  });

  it('converts a fetch rejection into a retryable error+stop chunk pair when enabled', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as StreamFromProviderOptions<unknown>['fetchImpl'];

    const chunks = await collect<Chunk>(
      streamFromProvider({ ...BASE, fetchImpl, catchTransportErrors: true }),
    );

    expect(chunks).toEqual([
      { type: 'error', code: 'STREAM_FETCH_ERROR', message: 'network down', retryable: true },
      { type: 'stop', reason: 'error' },
    ]);
  });

  it('marks the error non-retryable with a cancel stop when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => {
      throw new Error('cancelled');
    }) as unknown as StreamFromProviderOptions<unknown>['fetchImpl'];

    const chunks = await collect<Chunk>(
      streamFromProvider({
        ...BASE,
        fetchImpl,
        catchTransportErrors: true,
        signal: controller.signal,
      }),
    );

    expect(chunks).toEqual([
      {
        type: 'error',
        code: 'STREAM_TIMEOUT_OR_ABORT',
        message: 'cancelled',
        retryable: false,
      },
      { type: 'stop', reason: 'cancel' },
    ]);
  });

  it('classifies a mid-stream read failure as STREAM_READ_ERROR (distinct from a fetch-phase failure)', async () => {
    const encoder = new TextEncoder();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(encoder.encode('data: {"type":"text-delta","delta":"a"}\n\n'));
          return;
        }
        controller.error(new Error('socket reset'));
      },
    });
    const fetchImpl = fetchMockResolving({
      ok: true,
      status: 200,
      body,
      text: () => Promise.resolve(''),
    } as unknown as Response);

    const chunks = await collect<Chunk>(
      streamFromProvider({ ...BASE, fetchImpl, catchTransportErrors: true }),
    );

    expect(chunks[0]).toEqual({ type: 'text-delta', delta: 'a' });
    expect(chunks[1]).toEqual({
      type: 'error',
      code: 'STREAM_READ_ERROR',
      message: 'socket reset',
      retryable: true,
    });
    expect(chunks[2]).toEqual({ type: 'stop', reason: 'error' });
  });

  it('aborts mid-stream and reports a cancel stop when the caller aborts after the first chunk', async () => {
    const encoder = new TextEncoder();
    const controller = new AbortController();
    let errorController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        errorController = c;
        c.enqueue(encoder.encode('data: {"type":"text-delta","delta":"a"}\n\n'));
        // No close — the second read() hangs until the abort listener errors it below.
      },
    });
    controller.signal.addEventListener('abort', () => {
      try {
        errorController?.error(
          Object.assign(new Error('The operation was aborted.'), {
            name: 'AbortError',
          }),
        );
      } catch {
        /* already closed */
      }
    });
    const fetchImpl = fetchMockResolving({
      ok: true,
      status: 200,
      body,
      text: () => Promise.resolve(''),
    } as unknown as Response);

    const streamPromise = collect<Chunk>(
      streamFromProvider({
        ...BASE,
        fetchImpl,
        catchTransportErrors: true,
        signal: controller.signal,
      }),
    );

    // Give the first chunk a tick to be read, then abort.
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();

    const chunks = await streamPromise;
    expect(chunks[0]).toEqual({ type: 'text-delta', delta: 'a' });
    expect(chunks[1]).toMatchObject({
      type: 'error',
      code: 'STREAM_TIMEOUT_OR_ABORT',
      retryable: false,
    });
    expect(chunks[2]).toEqual({ type: 'stop', reason: 'cancel' });
  });
});

describe('streamFromProvider — idle watchdog (opt-in)', () => {
  /**
   * A real `fetch()` implementation errors the response body stream (rejecting any pending
   * `reader.read()`) when the request's `AbortSignal` fires — that's the actual mechanism
   * the watchdog relies on to tear down a stalled connection, not `reader.cancel()` (which
   * only resolves pending reads as a graceful `done`, silently swallowing the timeout). This
   * mock reproduces that real behaviour, rejecting with the signal's own `reason` (exactly
   * what a spec-compliant fetch does) so the watchdog's `StreamIdleTimeoutError` instance
   * round-trips back out.
   */
  function makeStallingFetch(onAbort: () => void): StreamFromProviderOptions<unknown>['fetchImpl'] {
    const encoder = new TextEncoder();
    return (async (_input: RequestInfo | URL, init?: RequestInit) => {
      let ctrl: ReadableStreamDefaultController<Uint8Array>;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          ctrl = controller;
          controller.enqueue(encoder.encode('data: {"type":"text-delta","delta":"first"}\n\n'));
          // No close — stalls until the signal aborts, simulating a silently dropped connection.
        },
      });
      init?.signal?.addEventListener('abort', () => {
        onAbort();
        try {
          ctrl.error(init.signal!.reason);
        } catch {
          /* already closed */
        }
      });
      return {
        ok: true,
        status: 200,
        body,
        text: () => Promise.resolve(''),
      } as unknown as Response;
    }) as unknown as StreamFromProviderOptions<unknown>['fetchImpl'];
  }

  it('does not attach any signal to the fetch call when idleWatchdog is off (default)', async () => {
    let aborted = false;
    const fetchImpl = makeStallingFetch(() => {
      aborted = true;
    });

    const iterator = streamFromProvider({ ...BASE, fetchImpl })[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toEqual({ type: 'text-delta', delta: 'first' });
    // Clean up without waiting on the hang forever.
    await iterator.return?.();
    expect(aborted).toBe(false);
  });

  it('aborts the request and throws StreamIdleTimeoutError when idle too long', async () => {
    let aborted = false;
    const fetchImpl = makeStallingFetch(() => {
      aborted = true;
    });

    const stream = streamFromProvider({
      ...BASE,
      fetchImpl,
      idleWatchdog: { idleMs: 20 },
    });

    const seen: Chunk[] = [];
    let thrown: unknown;
    try {
      for await (const chunk of stream) seen.push(chunk as Chunk);
    } catch (e) {
      thrown = e;
    }

    expect(seen).toEqual([{ type: 'text-delta', delta: 'first' }]);
    expect(thrown).toBeInstanceOf(StreamIdleTimeoutError);
    expect(aborted).toBe(true);
  });

  it('converts the idle timeout into a retryable error+stop pair when combined with catchTransportErrors', async () => {
    let aborted = false;
    const fetchImpl = makeStallingFetch(() => {
      aborted = true;
    });

    const chunks = await collect<Chunk>(
      streamFromProvider({
        ...BASE,
        fetchImpl,
        idleWatchdog: { idleMs: 20 },
        catchTransportErrors: true,
      }),
    );

    expect(chunks[0]).toEqual({ type: 'text-delta', delta: 'first' });
    expect(chunks[1]).toEqual({
      type: 'error',
      code: 'STREAM_TIMEOUT_OR_ABORT',
      message: expect.stringContaining('Stream idle timeout'),
      retryable: true,
    });
    expect(chunks[2]).toEqual({ type: 'stop', reason: 'error' });
    expect(aborted).toBe(true);
  });

  it('accepts idleWatchdog: true and uses watchdog defaults', async () => {
    const sseText = 'data: {"type":"text-delta","delta":"fast"}\n\n' + 'data: [DONE]\n\n';
    const fetchImpl = fetchMockResolving(okResponse(sseText));

    const chunks = await collect<Chunk>(
      streamFromProvider({ ...BASE, fetchImpl, idleWatchdog: true }),
    );

    expect(chunks).toEqual([{ type: 'text-delta', delta: 'fast' }]);
  });
});

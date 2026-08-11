import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requireProviderDefaultModel,
  type ChatRequest,
  type StreamChunk,
} from '@agiworkforce/types';

const ANTHROPIC_CHAT_MODEL = requireProviderDefaultModel('anthropic');

type AdapterMode =
  | 'success'
  | 'unconfigured'
  | 'terminal-error'
  | 'retryable-error'
  | 'error-after-token'
  | 'throw-before-token'
  | 'throw-after-token'
  | 'slow-before-token'
  | 'slow-until-client-abort'
  | 'backpressure'
  | 'backpressure-timeout'
  | 'backpressure-client-close'
  | 'close-before-success-terminal'
  | 'partial-without-stop'
  | 'malformed'
  | 'duplicate-terminal'
  | 'refusal-stop';

const state = vi.hoisted(() => ({
  capturedRequest: null as ChatRequest | null,
  capturedSignal: null as AbortSignal | null,
  adapterMode: 'success' as AdapterMode,
  buildCalls: [] as string[],
  usageRows: [] as Array<Record<string, unknown>>,
  abortClientCalls: 0,
  releaseCalls: 0,
  providerPulls: 0,
  pullsBeforeDrain: null as number | null,
  billingEvents: [] as string[],
  billingReserveStatus: 'ok' as 'ok' | 'unavailable' | 'insufficient',
  billingIdempotencyStatus: 'ok' as 'ok' | 'missing',
  finalizedUsage: null as Record<string, unknown> | null,
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { userId: 'user-1', token: 'jwt-token' };
    next();
  },
}));

vi.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

vi.mock('../../src/middleware/managedComputeGate', () => ({
  requireManagedComputeEligibility:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));

vi.mock('../../src/lib/neonClients', () => ({
  getUserScopedClient: () => ({
    from: (table: string) =>
      table === 'subscriptions'
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { plan_tier: 'max', status: 'active' },
                    error: null,
                  }),
              }),
            }),
          }
        : {
            insert: (row: Record<string, unknown>) => {
              state.usageRows.push(row);
              return Promise.resolve({ error: null });
            },
          },
  }),
}));

vi.mock('../../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/services/managedUsageBilling', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/managedUsageBilling')>();
  return {
    ...actual,
    parseManagedUsageIdempotencyKey: (header: string | string[] | undefined) => {
      if (state.billingIdempotencyStatus === 'missing') {
        throw new actual.ManagedUsageBillingError(
          'Idempotency-Key header is required',
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
        );
      }
      return typeof header === 'string' ? header : 'test-turn-12345678';
    },
    reserveManagedUsage: async () => {
      state.billingEvents.push('reserve');
      if (state.billingReserveStatus === 'unavailable') {
        throw new actual.ManagedUsageBillingError(
          'Managed usage billing is temporarily unavailable',
          503,
          'BILLING_UNAVAILABLE',
        );
      }
      if (state.billingReserveStatus === 'insufficient') {
        throw new actual.ManagedUsageBillingError(
          'Insufficient credits for this managed request',
          402,
          'INSUFFICIENT_CREDITS',
        );
      }
      return {
        idempotencyKey: 'test-turn-12345678',
        requestHash: 'a'.repeat(64),
        leaseToken: 'lease-1',
        estimatedCostCents: 2,
        requestStatus: 'reserved' as const,
      };
    },
    markManagedUsageProviderStarted: async () => {
      state.billingEvents.push('provider-started');
    },
    finalizeManagedUsage: async (input: {
      outcome: 'completed' | 'failed';
      usage?: Record<string, unknown>;
    }) => {
      state.billingEvents.push(`finalize-${input.outcome}`);
      state.finalizedUsage = input.usage ?? null;
      return {
        requestStatus: input.outcome === 'completed' ? 'completed' : 'released',
        operationResult: 'finalized',
        settlementStatus: 'succeeded',
        actualCostCents: input.outcome === 'completed' ? 1 : 0,
      };
    },
    markManagedUsageClientDelivered: async () => {
      state.billingEvents.push('client-delivered');
    },
  };
});

vi.mock('../../src/lib/streamLifecycle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/streamLifecycle')>();
  return {
    ...actual,
    createStreamLifecycle: ({ deadlineMs }: { deadlineMs: number }) => {
      const lifecycle = actual.createStreamLifecycle({
        deadlineMs:
          state.adapterMode === 'slow-until-client-abort' ||
          state.adapterMode === 'backpressure' ||
          state.adapterMode === 'backpressure-client-close'
            ? deadlineMs
            : Math.min(deadlineMs, 10),
      });
      return {
        ...lifecycle,
        abortClient: () => {
          state.abortClientCalls += 1;
          lifecycle.abortClient();
        },
        release: <T>(iterator: AsyncIterator<T>) => {
          state.releaseCalls += 1;
          lifecycle.release(iterator);
        },
      };
    },
  };
});

vi.mock('../../src/lib/providerAdapters', () => ({
  buildProviderAdapter: (providerId: string) => {
    state.buildCalls.push(providerId);
    if (state.adapterMode === 'unconfigured') return null;
    return {
      async *stream(chatRequest: ChatRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
        state.billingEvents.push('provider-stream');
        state.capturedSignal = signal ?? null;
        state.capturedRequest = chatRequest;
        if (
          state.adapterMode === 'backpressure' ||
          state.adapterMode === 'backpressure-timeout' ||
          state.adapterMode === 'backpressure-client-close'
        ) {
          state.providerPulls += 1;
          yield { type: 'text-delta', delta: 'first' };
          state.providerPulls += 1;
          yield { type: 'text-delta', delta: 'second' };
          state.providerPulls += 1;
          yield { type: 'usage', inputTokens: 2, outputTokens: 2 };
          state.providerPulls += 1;
          yield { type: 'stop', reason: 'end_turn' };
          return;
        }
        if (state.adapterMode === 'terminal-error') {
          yield {
            type: 'error',
            message: 'invalid provider credential',
            code: '401',
            retryable: false,
          };
          return;
        }
        if (state.adapterMode === 'retryable-error') {
          yield {
            type: 'error',
            message: 'provider rate limit',
            code: '429',
            retryable: true,
          };
          return;
        }
        if (state.adapterMode === 'throw-before-token') {
          throw Object.assign(
            new Error('upstream unavailable; Authorization: Bearer sk-test-secret'),
            { status: 503 },
          );
        }
        if (state.adapterMode === 'slow-before-token') {
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (signal?.aborted) throw signal.reason;
          return;
        }
        if (state.adapterMode === 'slow-until-client-abort') {
          await new Promise<void>((resolve) => {
            if (signal?.aborted) {
              resolve();
              return;
            }
            signal?.addEventListener('abort', () => resolve(), { once: true });
          });
          if (signal?.aborted) throw signal.reason;
          return;
        }
        if (state.adapterMode === 'malformed') {
          yield { type: 'not-a-stream-chunk', secret: 'sk-test-secret' } as unknown as StreamChunk;
          return;
        }
        yield { type: 'text-delta', delta: 'ok' };
        if (state.adapterMode === 'error-after-token') {
          yield {
            type: 'error',
            message: 'rate limited; Authorization: Bearer sk-test-secret',
            code: '429',
            retryable: true,
          };
          yield { type: 'stop', reason: 'error' };
          return;
        }
        if (state.adapterMode === 'throw-after-token') {
          throw Object.assign(new Error('socket failed with sk-test-secret'), {
            code: 'ECONNRESET',
          });
        }
        if (state.adapterMode === 'partial-without-stop') return;
        if (state.adapterMode === 'refusal-stop') {
          yield { type: 'stop', reason: 'refusal' };
          return;
        }
        if (state.adapterMode === 'duplicate-terminal') {
          yield { type: 'stop', reason: 'end_turn' };
          yield { type: 'stop', reason: 'end_turn' };
          return;
        }
        yield { type: 'usage', inputTokens: 2, outputTokens: 1 };
        yield { type: 'stop', reason: 'end_turn' };
      },
    };
  },
}));

const { llmRouter } = await import('../../src/routes/llm');
const { errorHandler } = await import('../../src/middleware/errorHandler');

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    if (state.adapterMode === 'close-before-success-terminal') {
      const originalWrite = res.write.bind(res);
      res.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
        const serialized = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        if (serialized.includes('"finish_reason":"stop"')) {
          res.destroy();
          return false;
        }
        return Reflect.apply(originalWrite, res, [chunk, ...args]) as boolean;
      }) as typeof res.write;
      next();
      return;
    }

    if (
      state.adapterMode !== 'backpressure' &&
      state.adapterMode !== 'backpressure-timeout' &&
      state.adapterMode !== 'backpressure-client-close'
    ) {
      next();
      return;
    }

    const originalWrite = res.write.bind(res);
    let pressureApplied = false;
    res.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
      const accepted = Reflect.apply(originalWrite, res, [chunk, ...args]) as boolean;
      if (pressureApplied) return accepted;

      pressureApplied = true;
      if (state.adapterMode === 'backpressure') {
        setTimeout(() => {
          state.pullsBeforeDrain = state.providerPulls;
          res.emit('drain');
        }, 25);
      } else if (state.adapterMode === 'backpressure-client-close') {
        setTimeout(() => {
          state.pullsBeforeDrain = state.providerPulls;
          res.destroy();
        }, 5);
      }
      return false;
    }) as typeof res.write;
    next();
  });
  app.use('/api/llm/v1', llmRouter);
  app.use(errorHandler);
  return app;
}

function sseData(response: request.Response): unknown[] {
  return response.text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .map((data) => (data === '[DONE]' ? data : JSON.parse(data)));
}

function streamErrorMarkers(events: unknown[]): unknown[] {
  return events
    .map(
      (event) =>
        (event as { choices?: Array<{ delta?: { x_stream_error?: unknown } }> })?.choices?.[0]
          ?.delta?.x_stream_error,
    )
    .filter((value) => value !== undefined);
}

function finishReasons(events: unknown[]): unknown[] {
  return events
    .map(
      (event) =>
        (event as { choices?: Array<{ finish_reason?: unknown }> })?.choices?.[0]?.finish_reason,
    )
    .filter((value) => value !== undefined && value !== null);
}

describe('Gateway OpenAI-compatible provider model IDs', () => {
  beforeEach(() => {
    state.capturedRequest = null;
    state.capturedSignal = null;
    state.adapterMode = 'success';
    state.buildCalls.length = 0;
    state.usageRows.length = 0;
    state.abortClientCalls = 0;
    state.releaseCalls = 0;
    state.providerPulls = 0;
    state.pullsBeforeDrain = null;
    state.billingEvents.length = 0;
    state.billingReserveStatus = 'ok';
    state.billingIdempotencyStatus = 'ok';
    state.finalizedUsage = null;
  });

  it('rejects a missing idempotency key as a safe 400 before reservation or provider work', async () => {
    state.billingIdempotencyStatus = 'missing';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Idempotency-Key header is required' });
    expect(state.billingEvents).toEqual([]);
    expect(state.capturedRequest).toBeNull();
  });

  it('maps only the upstream model while preserving response and usage attribution', async () => {
    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });

    expect(response.status).toBe(200);
    expect(state.capturedRequest?.model).toBe(ANTHROPIC_CHAT_MODEL);
    expect(state.capturedSignal).toBeInstanceOf(AbortSignal);
    expect(state.buildCalls).toEqual(['anthropic']);
    expect(response.body.model).toBe(ANTHROPIC_CHAT_MODEL);
    expect(state.billingEvents).toEqual([
      'reserve',
      'provider-started',
      'provider-stream',
      'finalize-completed',
      'client-delivered',
    ]);
    expect(state.finalizedUsage).toEqual(
      expect.objectContaining({ inputTokens: 2, outputTokens: 1 }),
    );
    expect(state.usageRows).toContainEqual(
      expect.objectContaining({
        model: ANTHROPIC_CHAT_MODEL,
        provider: 'anthropic',
        event_type: 'llm_completion',
        prompt_tokens: 2,
        completion_tokens: 1,
      }),
    );
  });

  it.each([
    ['unavailable', 503],
    ['insufficient', 402],
  ] as const)('never starts provider work when durable reservation is %s', async (mode, status) => {
    state.billingReserveStatus = mode;

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set('Idempotency-Key', 'test-turn-12345678')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });

    expect(response.status).toBe(status);
    expect(state.billingEvents).toEqual(['reserve']);
    expect(state.capturedRequest).toBeNull();
  });

  it('fails closed when the selected provider has no managed configuration', async () => {
    state.adapterMode = 'unconfigured';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(response.status).toBe(502);
    expect(state.buildCalls).toEqual(['anthropic']);
    expect(state.capturedRequest).toBeNull();
    expect(state.usageRows).toEqual([]);
  });

  it.each([
    ['terminal credential failure', 'terminal-error', 502],
    ['retriable provider rate limit', 'retryable-error', 429],
  ] as const)('never cross-provider-falls back after a %s', async (_label, adapterMode, status) => {
    state.adapterMode = adapterMode;

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(response.status).toBe(status);
    expect(state.buildCalls).toEqual(['anthropic']);
    expect(state.usageRows).toEqual([]);
  });

  it('returns an HTTP error before committing SSE when the provider throws before output', async () => {
    state.adapterMode = 'throw-before-token';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.text).not.toContain('sk-test-secret');
    expect(response.body).toEqual({
      error: 'Upstream provider is temporarily unavailable. Please retry.',
    });
    expect(state.billingEvents.filter((event) => event === 'finalize-failed')).toHaveLength(1);
  });

  it('enforces the gateway-owned provider deadline before committing SSE', async () => {
    state.adapterMode = 'slow-before-token';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });

    expect(response.status).toBe(504);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body).toEqual({
      error: 'The upstream provider timed out. Please retry.',
    });
    expect(state.billingEvents.filter((event) => event === 'finalize-failed')).toHaveLength(1);
  });

  it('cancels and releases the upstream iterator when the client disconnects', async () => {
    state.adapterMode = 'slow-until-client-abort';

    const outbound = request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const settled = outbound.then(
      () => 'response' as const,
      () => 'aborted' as const,
    );

    await vi.waitFor(() => expect(state.capturedSignal).toBeInstanceOf(AbortSignal));
    outbound.abort();

    await settled;
    await vi.waitFor(() => {
      expect(state.capturedSignal?.aborted).toBe(true);
      expect(state.abortClientCalls).toBe(1);
      expect(state.releaseCalls).toBe(1);
      expect(state.billingEvents.filter((event) => event === 'finalize-failed')).toHaveLength(1);
    });
  });

  it('stops pulling provider chunks until a backpressured response drains', async () => {
    state.adapterMode = 'backpressure';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const events = sseData(response);

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(state.pullsBeforeDrain).not.toBeNull());
    expect(state.pullsBeforeDrain).toBe(1);
    expect(state.providerPulls).toBe(4);
    expect(finishReasons(events)).toEqual(['stop']);
    expect(events.filter((event) => event === '[DONE]')).toHaveLength(1);
  });

  it('uses the gateway deadline while waiting for response drain', async () => {
    state.adapterMode = 'backpressure-timeout';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const events = sseData(response);

    expect(response.status).toBe(200);
    expect(state.providerPulls).toBe(1);
    expect(streamErrorMarkers(events)).toEqual([
      {
        message: 'The upstream provider timed out. Please retry.',
        code: 'gateway_deadline_exceeded',
        retryable: true,
      },
    ]);
    expect(events).not.toContain('[DONE]');
  });

  it('aborts and releases without another provider pull when the socket closes during drain', async () => {
    state.adapterMode = 'backpressure-client-close';

    const outbound = request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const settled = outbound.then(
      () => 'response' as const,
      () => 'aborted' as const,
    );

    await settled;
    await vi.waitFor(() => {
      expect(state.pullsBeforeDrain).toBe(1);
      expect(state.providerPulls).toBe(1);
      expect(state.abortClientCalls).toBe(1);
      expect(state.releaseCalls).toBe(1);
    });
  });

  it('keeps durable success when the client disconnects after provider success but before terminal flush', async () => {
    state.adapterMode = 'close-before-success-terminal';

    const outbound = request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const settled = outbound.then(
      () => 'response' as const,
      () => 'aborted' as const,
    );

    await settled;
    await vi.waitFor(() => {
      expect(state.billingEvents.filter((event) => event === 'finalize-completed')).toHaveLength(1);
      expect(state.billingEvents.filter((event) => event === 'finalize-failed')).toHaveLength(0);
      expect(state.billingEvents.filter((event) => event === 'client-delivered')).toHaveLength(0);
      expect(state.releaseCalls).toBe(1);
    });
  });

  it('emits one truthful error terminal after output and never emits success DONE', async () => {
    state.adapterMode = 'error-after-token';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const events = sseData(response);

    expect(response.status).toBe(200);
    expect(response.text).not.toContain('sk-test-secret');
    expect(streamErrorMarkers(events)).toEqual([
      {
        message: 'Upstream provider rate limit exceeded. Please retry later.',
        code: 'rate_limit_429',
        retryable: true,
      },
    ]);
    expect(finishReasons(events)).toEqual(['stop']);
    expect(events).not.toContain('[DONE]');
  });

  it('normalizes a thrown error after output into one safe client-visible terminal', async () => {
    state.adapterMode = 'throw-after-token';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const events = sseData(response);

    expect(response.status).toBe(200);
    expect(response.text).not.toContain('sk-test-secret');
    expect(streamErrorMarkers(events)).toEqual([
      {
        message: 'The upstream provider connection failed. Please retry.',
        code: 'connection_error',
        retryable: true,
      },
    ]);
    expect(finishReasons(events)).toEqual(['stop']);
    expect(events).not.toContain('[DONE]');
  });

  it.each([
    ['a partial stream without a stop event', 'partial-without-stop'],
    ['a malformed canonical event', 'malformed'],
  ] as const)('fails truthfully for %s', async (_label, adapterMode) => {
    state.adapterMode = adapterMode;

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });

    if (adapterMode === 'malformed') {
      expect(response.status).toBe(502);
      expect(response.text).not.toContain('sk-test-secret');
      return;
    }

    const events = sseData(response);
    expect(response.status).toBe(200);
    expect(streamErrorMarkers(events)).toEqual([
      {
        message: 'The upstream provider stream ended unexpectedly. Please retry.',
        code: 'incomplete_stream',
        retryable: true,
      },
    ]);
    expect(events).not.toContain('[DONE]');
  });

  it('deduplicates repeated provider stop events and emits one success sentinel', async () => {
    state.adapterMode = 'duplicate-terminal';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const events = sseData(response);

    expect(response.status).toBe(200);
    expect(finishReasons(events)).toEqual(['stop']);
    expect(events.filter((event) => event === '[DONE]')).toHaveLength(1);
    expect(streamErrorMarkers(events)).toEqual([]);
    expect(state.billingEvents.filter((event) => event === 'finalize-completed')).toHaveLength(1);
  });

  it('treats a refusal stop as a billable honest terminal, never a failed attempt', async () => {
    state.adapterMode = 'refusal-stop';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const events = sseData(response);

    expect(response.status).toBe(200);
    // Refusal survives stream validation (STOP_REASONS) and reaches the wire
    // as OpenAI's safety vocabulary, not a generic error terminal.
    expect(finishReasons(events)).toEqual(['content_filter']);
    expect(streamErrorMarkers(events)).toEqual([]);
    expect(events.filter((event) => event === '[DONE]')).toHaveLength(1);
    // Billable honest stop: settle as completed; the refund/retry failure
    // branches (reason error/cancel) must not fire.
    expect(state.billingEvents.filter((event) => event === 'finalize-completed')).toHaveLength(1);
    expect(state.billingEvents.filter((event) => event === 'finalize-failed')).toHaveLength(0);
  });

  it('keeps non-streaming provider errors as one safe HTTP failure', async () => {
    state.adapterMode = 'throw-before-token';

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: ANTHROPIC_CHAT_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.text).not.toContain('sk-test-secret');
  });
});

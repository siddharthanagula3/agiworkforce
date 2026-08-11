/**
 * @file Managed gateway failover — the gateway consumes the canonical
 * resolver's ordered cross-provider fallback plan (AUTO-ROUTER-MIGRATION-01).
 *
 * The plan arrives as catalog model IDs in the `x-agi-fallback-models`
 * header; its absence means the selection is an explicit user contract and
 * the gateway must never rotate providers. These tests pin the failover
 * boundary alongside the safety pins in llm-provider-model-id.test.ts:
 * rotation happens only pre-first-byte and only for an availability failure
 * or a credential rejection (which condemns the rejected provider's own
 * remaining routes too), every attempt re-passes tier admission, billing
 * settles once with the serving attempt's usage, and the response attributes
 * the model that actually served the request.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listCanonicalModels, type ChatRequest, type StreamChunk } from '@agiworkforce/types';

type AdapterMode =
  | 'success'
  | 'throw-503'
  | 'terminal-error'
  | 'retryable-error'
  | 'throw-after-token'
  | 'partial-usage-then-connreset'
  | 'slow-before-token';

const state = vi.hoisted(() => ({
  adapterModes: [] as AdapterMode[],
  buildCalls: [] as string[],
  streamedModels: [] as string[],
  usageRows: [] as Array<Record<string, unknown>>,
  billingEvents: [] as string[],
  finalizedUsage: null as Record<string, unknown> | null,
  finalizedModel: null as string | null,
  planTier: 'max' as string,
  shrinkDeadline: false,
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
                    data: { plan_tier: state.planTier, status: 'active' },
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
    parseManagedUsageIdempotencyKey: () => 'test-turn-12345678',
    reserveManagedUsage: async () => {
      state.billingEvents.push('reserve');
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
      model: string;
      usage?: Record<string, unknown>;
    }) => {
      state.billingEvents.push(`finalize-${input.outcome}`);
      state.finalizedUsage = input.usage ?? null;
      state.finalizedModel = input.model;
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
    createStreamLifecycle: ({ deadlineMs }: { deadlineMs: number }) =>
      actual.createStreamLifecycle({
        deadlineMs: state.shrinkDeadline ? Math.min(deadlineMs, 10) : deadlineMs,
      }),
  };
});

vi.mock('../../src/lib/providerAdapters', () => ({
  buildProviderAdapter: (providerId: string) => {
    state.buildCalls.push(providerId);
    return {
      async *stream(chatRequest: ChatRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
        const mode = state.adapterModes.shift() ?? 'success';
        state.streamedModels.push(chatRequest.model);
        state.billingEvents.push('provider-stream');
        if (mode === 'throw-503') {
          throw Object.assign(new Error('upstream unavailable'), { status: 503 });
        }
        if (mode === 'terminal-error') {
          yield {
            type: 'error',
            message: 'invalid provider credential',
            code: '401',
            retryable: false,
          };
          return;
        }
        if (mode === 'retryable-error') {
          yield { type: 'error', message: 'provider rate limit', code: '429', retryable: true };
          return;
        }
        if (mode === 'throw-after-token') {
          yield { type: 'text-delta', delta: 'partial' };
          throw Object.assign(new Error('socket failed'), { code: 'ECONNRESET' });
        }
        if (mode === 'partial-usage-then-connreset') {
          yield { type: 'text-delta', delta: 'partial' };
          yield { type: 'usage', inputTokens: 99, outputTokens: 9 };
          throw Object.assign(new Error('socket failed'), { code: 'ECONNRESET' });
        }
        if (mode === 'slow-before-token') {
          await new Promise((resolve) => setTimeout(resolve, 50));
          if (signal?.aborted) throw signal.reason;
          return;
        }
        yield { type: 'text-delta', delta: 'ok' };
        yield { type: 'usage', inputTokens: 2, outputTokens: 1 };
        yield { type: 'stop', reason: 'end_turn' };
      },
    };
  },
}));

const { llmRouter, MANAGED_FALLBACK_MODELS_HEADER } = await import('../../src/routes/llm');
const { errorHandler } = await import('../../src/middleware/errorHandler');

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
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

function eventModels(events: unknown[]): string[] {
  return [
    ...new Set(
      events
        .map((event) => (event as { model?: string })?.model)
        .filter((model): model is string => typeof model === 'string'),
    ),
  ];
}

const CATALOG_MODELS = listCanonicalModels();
function requireCatalogModel(
  predicate: (model: (typeof CATALOG_MODELS)[number]) => boolean,
  description: string,
) {
  const model = CATALOG_MODELS.find(predicate);
  if (!model) throw new Error(`Canonical ${description} fixture is missing`);
  return model.id;
}

const ANTHROPIC_FLAGSHIPS = CATALOG_MODELS.filter(
  (model) => model.provider === 'anthropic' && model.tierPolicy?.minTier === 'max',
);
if (ANTHROPIC_FLAGSHIPS.length < 2) {
  throw new Error('Canonical same-provider flagship fixtures are missing');
}
const PRIMARY_FLAGSHIP = ANTHROPIC_FLAGSHIPS[0]!.id;
const SAME_PROVIDER_FLAGSHIP = ANTHROPIC_FLAGSHIPS[1]!.id;
const FALLBACK_FLAGSHIP = requireCatalogModel(
  (model) => model.provider === 'openai' && model.tierPolicy?.minTier === 'max',
  'cross-provider flagship',
);
const PRIMARY_PRO = requireCatalogModel(
  (model) => model.provider === 'anthropic' && model.tierPolicy?.minTier === 'pro',
  'Anthropic Pro',
);
const FALLBACK_PRO = requireCatalogModel(
  (model) =>
    model.provider === 'google' && ['basic', 'pro'].includes(model.tierPolicy?.minTier ?? ''),
  'Google Pro-admitted',
);

describe('Managed gateway failover — resolver fallback plan consumption', () => {
  beforeEach(() => {
    state.adapterModes.length = 0;
    state.buildCalls.length = 0;
    state.streamedModels.length = 0;
    state.usageRows.length = 0;
    state.billingEvents.length = 0;
    state.finalizedUsage = null;
    state.finalizedModel = null;
    state.planTier = 'max';
    state.shrinkDeadline = false;
  });

  it('serves the next fallback route after a pre-first-byte availability failure (streaming)', async () => {
    state.adapterModes.push('throw-503', 'success');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, FALLBACK_FLAGSHIP)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const events = sseData(response);

    expect(response.status).toBe(200);
    expect(state.buildCalls).toEqual(['anthropic', 'openai']);
    // Attribution: every client-visible wire event names the model that
    // actually served the stream, never the failed primary.
    expect(eventModels(events)).toEqual([FALLBACK_FLAGSHIP]);
    expect(events.filter((event) => event === '[DONE]')).toHaveLength(1);
    expect(state.billingEvents).toEqual([
      'reserve',
      'provider-started',
      'provider-stream',
      'provider-stream',
      'finalize-completed',
      'client-delivered',
    ]);
    expect(state.usageRows).toContainEqual(
      expect.objectContaining({
        model: FALLBACK_FLAGSHIP,
        provider: 'openai',
        event_type: 'llm_stream',
      }),
    );
  });

  it('attributes the non-streaming response body and billing to the serving fallback model', async () => {
    state.adapterModes.push('throw-503', 'success');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, FALLBACK_FLAGSHIP)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.model).toBe(FALLBACK_FLAGSHIP);
    expect(state.buildCalls).toEqual(['anthropic', 'openai']);
    expect(state.finalizedModel).toBe(FALLBACK_FLAGSHIP);
    expect(state.usageRows).toContainEqual(
      expect.objectContaining({
        model: FALLBACK_FLAGSHIP,
        provider: 'openai',
        event_type: 'llm_completion',
        prompt_tokens: 2,
        completion_tokens: 1,
      }),
    );
  });

  it('rotates after a credential failure: a rejected key condemns one provider, not the turn', async () => {
    state.adapterModes.push('terminal-error', 'success');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, FALLBACK_FLAGSHIP)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(response.status).toBe(200);
    expect(state.buildCalls).toEqual(['anthropic', 'openai']);
    expect(response.body.model).toBe(FALLBACK_FLAGSHIP);
    expect(state.billingEvents.filter((event) => event === 'finalize-completed')).toHaveLength(1);
  });

  it('skips remaining routes on the provider whose credential was rejected', async () => {
    // The second anthropic route would replay the same rejected key; only the
    // google route can authenticate, so it is the one that serves.
    state.adapterModes.push('terminal-error', 'success');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, `${SAME_PROVIDER_FLAGSHIP},${FALLBACK_PRO}`)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(response.status).toBe(200);
    expect(state.buildCalls).toEqual(['anthropic', 'google']);
    expect(response.body.model).toBe(FALLBACK_PRO);
  });

  it('surfaces the credential failure when every remaining route is the rejected provider', async () => {
    state.adapterModes.push('terminal-error');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, SAME_PROVIDER_FLAGSHIP)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(response.status).toBe(502);
    expect(state.buildCalls).toEqual(['anthropic']);
    expect(state.billingEvents.filter((event) => event === 'provider-stream')).toHaveLength(1);
    expect(state.billingEvents.filter((event) => event === 'finalize-failed')).toHaveLength(1);
  });

  it('never rotates after a retriable provider rate limit even when a plan is present', async () => {
    state.adapterModes.push('retryable-error');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, FALLBACK_FLAGSHIP)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(response.status).toBe(429);
    expect(state.buildCalls).toEqual(['anthropic']);
    expect(state.billingEvents.filter((event) => event === 'provider-stream')).toHaveLength(1);
  });

  it('never rotates mid-stream: after the first client byte an eligible failure surfaces as a terminal', async () => {
    state.adapterModes.push('throw-after-token', 'success');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, FALLBACK_FLAGSHIP)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });
    const events = sseData(response);

    expect(response.status).toBe(200);
    expect(state.buildCalls).toEqual(['anthropic']);
    expect(eventModels(events)).toEqual([PRIMARY_FLAGSHIP]);
    expect(events).not.toContain('[DONE]');
    expect(state.billingEvents.filter((event) => event === 'finalize-failed')).toHaveLength(1);
  });

  it('never rotates without a fallback plan: explicit selection is a contract', async () => {
    state.adapterModes.push('throw-503');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });

    expect(response.status).toBe(503);
    expect(state.buildCalls).toEqual(['anthropic']);
    expect(state.billingEvents.filter((event) => event === 'finalize-failed')).toHaveLength(1);
  });

  it('never rotates after the gateway-owned deadline expires', async () => {
    state.shrinkDeadline = true;
    state.adapterModes.push('slow-before-token', 'success');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, FALLBACK_FLAGSHIP)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });

    expect(response.status).toBe(504);
    expect(state.buildCalls).toEqual(['anthropic']);
  });

  it('re-checks tier admission per attempt: a flagship fallback is skipped on a pro-class tier', async () => {
    state.planTier = 'pro';
    state.adapterModes.push('throw-503', 'success');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, `${FALLBACK_FLAGSHIP},${FALLBACK_PRO}`)
      .send({
        model: PRIMARY_PRO,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });

    expect(response.status).toBe(200);
    // The flagship candidate fails the per-attempt enforcePlanTier re-check,
    // so its provider adapter is never even built.
    expect(state.buildCalls).toEqual(['anthropic', 'google']);
    expect(response.body.model).toBe(FALLBACK_PRO);
    expect(state.usageRows).toContainEqual(
      expect.objectContaining({ model: FALLBACK_PRO, provider: 'google', tier: 'pro' }),
    );
  });

  it('settles billing once with the serving attempt usage, discarding a failed attempt usage', async () => {
    state.adapterModes.push('partial-usage-then-connreset', 'success');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, FALLBACK_FLAGSHIP)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.model).toBe(FALLBACK_FLAGSHIP);
    // The failed attempt's partial output never reaches the client…
    expect(response.body.choices[0].message.content).toBe('ok');
    // …and its usage never reaches settlement.
    expect(state.billingEvents.filter((event) => event === 'finalize-completed')).toHaveLength(1);
    expect(state.billingEvents.filter((event) => event === 'finalize-failed')).toHaveLength(0);
    expect(state.finalizedUsage).toEqual(
      expect.objectContaining({ inputTokens: 2, outputTokens: 1 }),
    );
  });

  it('surfaces the last failure when the fallback plan is exhausted', async () => {
    state.adapterModes.push('throw-503', 'throw-503');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, FALLBACK_FLAGSHIP)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      });

    expect(response.status).toBe(503);
    expect(state.buildCalls).toEqual(['anthropic', 'openai']);
    expect(state.billingEvents.filter((event) => event === 'finalize-failed')).toHaveLength(1);
  });

  it('rejects a malformed fallback plan with a 400 before any reservation or provider work', async () => {
    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, 'not a valid model id!!')
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(response.status).toBe(400);
    expect(state.billingEvents).toEqual([]);
    expect(state.buildCalls).toEqual([]);
  });

  it('rejects an oversized fallback plan with a 400: the attempt loop stays bounded', async () => {
    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, 'model-1,model-2,model-3,model-4,model-5')
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(response.status).toBe(400);
    expect(state.billingEvents).toEqual([]);
    expect(state.buildCalls).toEqual([]);
  });

  it('skips catalog-unknown fallback candidates and serves the next admitted route', async () => {
    state.adapterModes.push('throw-503', 'success');

    const response = await request(createApp())
      .post('/api/llm/v1/chat/completions')
      .set(MANAGED_FALLBACK_MODELS_HEADER, `not-a-real-model,${FALLBACK_FLAGSHIP}`)
      .send({
        model: PRIMARY_FLAGSHIP,
        messages: [{ role: 'user', content: 'hello' }],
        stream: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.model).toBe(FALLBACK_FLAGSHIP);
    expect(state.buildCalls).toEqual(['anthropic', 'openai']);
  });
});

/**
 * @file Managed gateway settlement when the client hangs up mid-stream.
 *
 * A disconnect used to reach `releaseFailedReservation`, which finalizes the
 * reservation as `failed` — a full refund that also erases the request from the
 * rolling five-hour / weekly windows. The provider had already generated the
 * tokens streamed up to that point, so every abandoned turn was free inference
 * and a caller could hang up one chunk before the end of every turn forever.
 *
 * These tests drive a real socket disconnect against the real billing service
 * over a fake RPC client that mirrors migration 0056's settlement arithmetic
 * (`reserve` deducts the estimate; `finalize` applies `actual - estimate` on
 * completion and refunds the estimate on failure), so "counts toward the
 * rolling window" is asserted as a ledger balance, not as a call shape.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatRequest, StreamChunk } from '@agiworkforce/types';

type AdapterMode = 'stream-then-hang' | 'hang-before-token' | 'flood' | 'tool-call-then-hang';

const state = vi.hoisted(() => ({
  adapterMode: 'stream-then-hang' as AdapterMode,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  /** Net managed-usage deduction the rolling windows would sum, in cents. */
  ledgerCents: 0,
  /** Stands in for the route's 10-minute provider deadline. */
  deadlineMs: 30_000,
}));

/**
 * Keep the REAL stream lifecycle — its abort wiring and `StreamDeadlineError`
 * are what the stalled-client branch keys on — and only shorten the deadline so
 * a test can reach it. The route is exercised unmodified.
 */
vi.mock('../../src/lib/streamLifecycle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/streamLifecycle')>();
  return {
    ...actual,
    createStreamLifecycle: (options: { deadlineMs: number }) =>
      actual.createStreamLifecycle({ ...options, deadlineMs: state.deadlineMs }),
  };
});

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

vi.mock('../../src/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/lib/neonClients', () => ({
  getUserScopedClient: () => ({
    from: (table: string) =>
      table === 'subscriptions'
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { plan_tier: 'max', status: 'active' }, error: null }),
              }),
            }),
          }
        : { insert: () => Promise.resolve({ error: null }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      if (fn === 'reserve_managed_usage_request_with_limits') {
        state.ledgerCents += args['p_estimated_cost_cents'] as number;
        return {
          data: [
            {
              reservation_decision: 'acquired',
              request_status: 'reserved',
              lease_token: args['p_lease_token'],
              estimated_cost_cents: args['p_estimated_cost_cents'],
              settlement_status: null,
              error_code: null,
            },
          ],
          error: null,
        };
      }
      if (fn === 'finalize_managed_usage_request') {
        const completed = args['p_outcome'] === 'completed';
        const actual = completed ? (args['p_actual_cost_cents'] as number) : 0;
        state.ledgerCents += actual - estimatedCostCents();
        return {
          data: [
            {
              request_status: completed ? 'completed' : 'released',
              operation_result: 'finalized',
              settlement_status: 'succeeded',
              actual_cost_cents: actual,
              error_code: null,
            },
          ],
          error: null,
        };
      }
      return {
        data: [{ request_status: 'provider_started', operation_result: 'updated' }],
        error: null,
      };
    },
  }),
}));

vi.mock('../../src/lib/providerAdapters', () => ({
  buildProviderAdapter: () => ({
    async *stream(_chatRequest: ChatRequest, signal?: AbortSignal): AsyncIterable<StreamChunk> {
      if (state.adapterMode === 'flood') {
        // Enough output to overrun the response socket's write buffer while the
        // client refuses to read, which is what parks the route in waitForDrain.
        for (let block = 0; block < 96; block += 1) {
          if (signal?.aborted) throw signal.reason;
          yield { type: 'text-delta', delta: 'x'.repeat(64 * 1024) };
        }
      }
      if (state.adapterMode === 'stream-then-hang') {
        yield { type: 'text-delta', delta: 'the provider already generated this sentence' };
      }
      if (state.adapterMode === 'tool-call-then-hang') {
        // Output the provider was paid for that carries no delta text.
        yield { type: 'tool-use-start', toolUseId: 'call_1', name: 'search_repository_files' };
      }
      // Bounded stand-in for a provider that keeps generating after the client
      // walks away; the gateway's abort-aware read ends it, not this loop.
      for (let tick = 0; tick < 100; tick += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (signal?.aborted) throw signal.reason;
      }
      yield { type: 'stop', reason: 'end_turn' };
    },
  }),
}));

const { llmRouter } = await import('../../src/routes/llm');
const { errorHandler } = await import('../../src/middleware/errorHandler');

const MODEL = 'claude-sonnet-5';

function rpcArgs(fn: string): Record<string, unknown> | undefined {
  return state.rpcCalls.find((call) => call.fn === fn)?.args;
}

function estimatedCostCents(): number {
  return (rpcArgs('reserve_managed_usage_request_with_limits')?.['p_estimated_cost_cents'] ??
    0) as number;
}

let server: http.Server;

async function startServer(): Promise<number> {
  const app = express();
  app.use(express.json());
  app.use('/api/llm/v1', llmRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return (server.address() as AddressInfo).port;
}

/**
 * POST a completion and destroy the socket on the first byte the gateway
 * writes. When no byte is coming — a non-streaming request, or a provider that
 * never produced output — the hang-up is unprompted instead.
 */
async function postAndHangUp(
  port: number,
  options: { maxTokens?: number; stream?: boolean } = {},
): Promise<void> {
  const { maxTokens, stream = true } = options;
  await new Promise<void>((resolve) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/llm/v1/chat/completions',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'abort-turn-12345678' },
      },
      (response) => {
        response.on('data', () => {
          request.destroy();
          resolve();
        });
        response.on('error', () => resolve());
      },
    );
    request.on('error', () => resolve());
    request.end(
      JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'write me a long essay' }],
        stream,
        ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      }),
    );
    if (!stream || state.adapterMode === 'hang-before-token') {
      setTimeout(() => {
        request.destroy();
        resolve();
      }, 60);
    }
  });
}

/**
 * POST a streaming completion and then never read the response body, leaving
 * the socket open. Node keeps the response paused until something consumes it,
 * so the server's writes back up and park in `waitForDrain`.
 */
async function postAndStall(port: number): Promise<http.ClientRequest> {
  const request = http.request({
    host: '127.0.0.1',
    port,
    path: '/api/llm/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'stall-turn-12345678' },
  });
  request.on('error', () => undefined);
  // Deliberately no 'response' data listener: the body is never consumed.
  request.on('response', (response) => {
    response.on('error', () => undefined);
  });
  request.end(
    JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: 'write me a long essay' }],
      stream: true,
    }),
  );
  return request;
}

async function waitForFinalization(): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const args = rpcArgs('finalize_managed_usage_request');
    if (args) return args;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('the gateway never finalized the managed usage reservation');
}

describe('Managed gateway — client disconnect mid-stream', () => {
  beforeEach(() => {
    state.adapterMode = 'stream-then-hang';
    state.rpcCalls.length = 0;
    state.ledgerCents = 0;
    state.deadlineMs = 30_000;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('settles the generated output as completed instead of refunding it', async () => {
    const port = await startServer();
    await postAndHangUp(port);
    const finalize = await waitForFinalization();

    expect(finalize['p_outcome']).toBe('completed');
    expect(finalize['p_actual_cost_cents']).toBeGreaterThan(0);
    // The tokens the provider generated stay deducted, so the request counts
    // against the rolling five-hour and weekly windows like any served turn.
    expect(state.ledgerCents).toBeGreaterThan(0);
    // The client never received a terminated response, so the delivery marker
    // must stay unset even though billing settled.
    expect(state.rpcCalls.map((call) => call.fn)).not.toContain(
      'mark_managed_usage_client_delivered',
    );
  });

  it('settles an abandoned non-streaming request on the same rule', async () => {
    const port = await startServer();
    await postAndHangUp(port, { stream: false });
    const finalize = await waitForFinalization();

    expect(finalize['p_outcome']).toBe('completed');
    expect(finalize['p_actual_cost_cents']).toBeGreaterThan(0);
    expect(state.ledgerCents).toBeGreaterThan(0);
  });

  it('charges the output actually streamed, not the reserved max_tokens estimate', async () => {
    const port = await startServer();
    await postAndHangUp(port, { maxTokens: 32_000 });
    const finalize = await waitForFinalization();

    const actual = finalize['p_actual_cost_cents'] as number;
    expect(actual).toBeGreaterThan(0);
    expect(actual).toBeLessThan(estimatedCostCents());
  });

  it('settles a client that stalls the socket instead of closing it', async () => {
    // The sibling of a hang-up: the client stops reading and never sends FIN,
    // so req.aborted and res.destroyed both stay false and only the gateway
    // deadline ends the turn. Without the stalled-reader branch this refunds in
    // full after the provider generated megabytes of output.
    state.adapterMode = 'flood';
    state.deadlineMs = 400;
    const port = await startServer();
    const request = await postAndStall(port);
    const finalize = await waitForFinalization();
    request.destroy();

    expect(finalize['p_outcome']).toBe('completed');
    expect(finalize['p_actual_cost_cents']).toBeGreaterThan(0);
    expect(state.ledgerCents).toBeGreaterThan(0);
    expect(state.rpcCalls.map((call) => call.fn)).not.toContain(
      'mark_managed_usage_client_delivered',
    );
  });

  it('settles a disconnect that lands right after a tool call opened', async () => {
    // `tool-use-start` carries the tool name and no delta, so counting only
    // deltas would leave this turn at zero served output and refund it in full.
    state.adapterMode = 'tool-call-then-hang';
    const port = await startServer();
    await postAndHangUp(port);
    const finalize = await waitForFinalization();

    expect(finalize['p_outcome']).toBe('completed');
    expect(finalize['p_actual_cost_cents']).toBeGreaterThan(0);
    expect(state.ledgerCents).toBeGreaterThan(0);
  });

  it('still releases in full when the client leaves before any output token', async () => {
    state.adapterMode = 'hang-before-token';
    const port = await startServer();
    await postAndHangUp(port);
    const finalize = await waitForFinalization();

    expect(finalize['p_outcome']).toBe('failed');
    expect(finalize['p_actual_cost_cents']).toBe(0);
    expect(state.ledgerCents).toBe(0);
  });
});

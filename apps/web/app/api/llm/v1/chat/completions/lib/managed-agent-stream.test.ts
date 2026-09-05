import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const persistenceMocks = vi.hoisted(() => ({
  execute: vi.fn(async (..._args: unknown[]) => undefined),
  // A conversation that has never branched: the single-statement write.
  query: vi.fn(async (..._args: unknown[]) => [{ active_leaf_message_id: null }]),
}));
vi.mock('@/lib/server/neon-db', () => {
  const pool = {
    execute: persistenceMocks.execute,
    query: persistenceMocks.query,
    transaction: (run: (tx: unknown) => Promise<unknown>) => run(pool),
  };
  return { getNeonDb: () => pool };
});

const events: string[] = [];
const finalize = vi.fn(async (_input: unknown) => {
  events.push('settled');
  return {
    requestStatus: 'completed' as const,
    operationResult: 'finalized' as const,
    settlementStatus: 'succeeded' as const,
    actualCostCents: 11,
  };
});
const delivered = vi.fn(async (_input: unknown) => {
  events.push('delivered');
});
const settleFreeTrialRequest = vi.fn(async (_input: unknown) => {
  events.push('free-settled');
});
const appendCloudAgentEvents = vi.fn(
  async (_db: unknown, input: { envelopes: readonly { event: { state?: string } }[] }) => {
    events.push('event-persisted');
    return { state: input.envelopes.at(-1)?.event.state ?? 'running' };
  },
);
const transitionCloudAgentRun = vi.fn(async (_db: unknown, input: { state: string }) => ({
  state: input.state,
}));
const recordCloudAgentRunSettledUsage = vi.fn(async (_db: unknown, _input: unknown) => {
  events.push('usage-recorded');
  return null;
});

vi.mock('@/lib/services/managed-usage-accounting-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-accounting-service')>()),
  finalizeObservedManagedUsage: (input: unknown) => finalize(input),
}));

vi.mock('@/lib/services/managed-usage-request-service', () => ({
  markManagedUsageClientDelivered: (input: unknown) => delivered(input),
  MANAGED_CHAT_CONTRACT_VERSION: 'fixture-contract-version',
  ManagedUsageRequestError: class ManagedUsageRequestError extends Error {
    constructor(
      message: string,
      public status: number,
      public code: string,
    ) {
      super(message);
      this.name = 'ManagedUsageRequestError';
    }
  },
  createManagedUsageErrorBody: vi.fn(),
  fingerprintManagedUsageRequest: vi.fn(() => 'fixture-fingerprint'),
  parseManagedUsageIdempotencyKey: vi.fn(
    (header: string | null) => header ?? 'fixture-idempotency-key',
  ),
  reserveManagedUsageRequest: vi.fn(),
  resolveManagedQuotaRecovery: vi.fn(() => null),
}));

vi.mock('@/lib/services/free-trial-service', () => ({
  settleFreeTrialRequest: (input: unknown) => settleFreeTrialRequest(input),
  FREE_TRIAL_MODEL: 'fixture-free-trial-model',
  isFreePlanTier: () => false,
  isFreeTrialRequest: () => false,
  beginFreeTrialRequest: vi.fn(),
  applyFreeTrialProviderBudget: vi.fn(),
}));

vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  appendCloudAgentEvents: (db: unknown, input: unknown) =>
    appendCloudAgentEvents(db, input as { envelopes: readonly { event: { state?: string } }[] }),
  transitionCloudAgentRun: (db: unknown, input: unknown) =>
    transitionCloudAgentRun(db, input as { state: string }),
  recordCloudAgentRunSettledUsage: (db: unknown, input: unknown) =>
    recordCloudAgentRunSettledUsage(db, input),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  accumulateObservedProviderUsage,
  createObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import { buildManagedAgentStream } from './managed-agent-stream';
import type { ProcessedRequest } from './request-processor';
import { INTERACTIVE_CARDS_MAX_PER_MESSAGE } from '@agiworkforce/types';

const processed = {
  provider: 'anthropic',
  chatRequest: { model: 'claude-test' },
  managedUsage: {
    db: { query: vi.fn() },
    userId: 'user-1',
    idempotencyKey: 'agi.chat.web.send.message-1',
    requestHash: 'hash-1',
    leaseToken: 'lease-1',
    estimatedCostCents: 4,
  },
} as unknown as ProcessedRequest;

async function* completedGenerator(): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  yield encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n');
  yield encoder.encode('data: [DONE]\n\n');
}

async function* failedGenerator(): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  yield encoder.encode(
    'data: {"choices":[{"delta":{"x_stream_error":{"message":"upstream failed"}}}]}\n\n',
  );
  yield encoder.encode('data: [DONE]\n\n');
}

async function* canonicalEventGenerator(): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  yield encoder.encode(
    `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            x_agent_event: {
              schemaVersion: 4,
              sessionId: 'conversation-1',
              turnId: 'turn-1',
              sequence: 0,
              emittedAtMs: 1_752_780_000_000,
              event: {
                type: 'task-state-changed',
                taskId: 'turn-1',
                state: 'awaiting_input',
                summary: 'Approval required',
              },
            },
          },
          index: 0,
        },
      ],
    })}\n\n`,
  );
  yield encoder.encode('data: [DONE]\n\n');
}

async function* cardGenerator(count = 1): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  yield encoder.encode('data: {"choices":[{"delta":{"content":"Choose a map."}}]}\n\n');
  for (let index = 0; index < count; index += 1) {
    const cardId = `tool-map-fixture-${index}`;
    yield encoder.encode(
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              x_interactive_card: {
                card: {
                  schemaVersion: 1,
                  cardId,
                  kind: 'map-search.v1',
                  createdAt: '2026-08-11T00:00:00.000Z',
                  fallback: { headline: 'Map search', text: 'Map search: coffee near Austin' },
                  producedBy: { toolCallId: cardId, toolName: 'search_maps' },
                  body: {
                    title: 'Coffee near Austin',
                    query: 'coffee near Austin',
                    actions: [
                      {
                        provider: 'google_maps',
                        label: 'Open in Google Maps',
                        url: 'https://www.google.com/maps/search/?api=1&query=coffee%20near%20Austin',
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
      })}\n\n`,
    );
  }
  yield encoder.encode('data: [DONE]\n\n');
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';
  while (true) {
    const next = await reader.read();
    if (next.done) return output;
    output += decoder.decode(next.value);
    if (output.includes('[DONE]')) events.push('terminal-visible');
  }
}

describe('managed agent stream', () => {
  it('withholds the generator terminal event until durable settlement succeeds', async () => {
    events.length = 0;
    finalize.mockClear();
    delivered.mockClear();

    const stream = buildManagedAgentStream({
      generator: completedGenerator(),
      processed,
      usage: createObservedProviderUsage(),
      completionReason: 'tool_loop_completed',
      cancellationReason: 'client_cancelled_tool_loop',
    });

    const output = await readAll(stream);

    expect(output.match(/data: \[DONE\]/g)).toHaveLength(1);
    expect(events).toEqual(['settled', 'delivered', 'terminal-visible']);
  });

  it('finalizes cancellation without emitting a terminal event', async () => {
    events.length = 0;
    finalize.mockClear();
    const generator = completedGenerator();
    const stream = buildManagedAgentStream({
      generator,
      processed,
      usage: createObservedProviderUsage(),
      completionReason: 'research_completed',
      cancellationReason: 'client_cancelled_research',
    });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'client_cancelled_research', cancelled: true }),
    );
  });

  it('releases an error response with no observed usage instead of charging an estimate', async () => {
    finalize.mockClear();
    const stream = buildManagedAgentStream({
      generator: failedGenerator(),
      processed,
      usage: createObservedProviderUsage(),
      completionReason: 'tool_loop_completed',
      cancellationReason: 'client_cancelled_tool_loop',
    });

    const output = await readAll(stream);

    expect(output).toContain('x_stream_error');
    expect(output).toContain('data: [DONE]');
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'tool_loop_completed_reported_failure',
        cancelled: true,
      }),
    );
  });

  it('leaves the delivery marker alone on a released turn the provider rejected', async () => {
    events.length = 0;
    finalize.mockClear();
    delivered.mockClear();

    const stream = buildManagedAgentStream({
      generator: failedGenerator(),
      processed,
      usage: createObservedProviderUsage(),
      completionReason: 'tool_loop_completed',
      cancellationReason: 'client_cancelled_tool_loop',
    });

    await readAll(stream);

    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true }));
    expect(delivered).not.toHaveBeenCalled();
    expect(events).not.toContain('delivered');
  });

  it('records all observed provider tokens for a free-tier tool loop before completion', async () => {
    events.length = 0;
    settleFreeTrialRequest.mockClear();
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(usage, { inputTokens: 90, outputTokens: 30 });
    const freeProcessed = {
      ...processed,
      managedUsage: undefined,
      freeTrial: {
        kind: 'free_trial',
        userId: 'free-user',
        requestId: 'free-request',
      },
    } as ProcessedRequest;

    const stream = buildManagedAgentStream({
      generator: completedGenerator(),
      processed: freeProcessed,
      usage,
      completionReason: 'tool_loop_completed',
      cancellationReason: 'client_cancelled_tool_loop',
    });

    await readAll(stream);

    expect(settleFreeTrialRequest).toHaveBeenCalledWith({
      reservation: {
        kind: 'free_trial',
        userId: 'free-user',
        requestId: 'free-request',
      },
      outcome: 'completed',
      provider: 'anthropic',
      model: 'claude-test',
      measuredCostDollars: expect.any(Number),
      usage: expect.objectContaining({
        promptTokens: 90,
        completionTokens: 30,
        totalTokens: 120,
      }),
    });
    expect(events).toEqual(['free-settled', 'terminal-visible']);
  });

  it('releases a free-tier reservation when the tool loop fails before usage', async () => {
    settleFreeTrialRequest.mockClear();
    const freeProcessed = {
      ...processed,
      managedUsage: undefined,
      freeTrial: {
        kind: 'free_trial',
        userId: 'free-user',
        requestId: 'free-failed-request',
      },
    } as ProcessedRequest;

    await readAll(
      buildManagedAgentStream({
        generator: failedGenerator(),
        processed: freeProcessed,
        usage: createObservedProviderUsage(),
        completionReason: 'tool_loop_completed',
        cancellationReason: 'client_cancelled_tool_loop',
      }),
    );

    expect(settleFreeTrialRequest).toHaveBeenCalledWith({
      reservation: freeProcessed.freeTrial,
      outcome: 'failed',
      provider: 'anthropic',
      model: 'claude-test',
      measuredCostDollars: 0,
      usage: expect.objectContaining({ totalTokens: 0 }),
    });
  });

  it('persists canonical activity before making it visible and preserves an awaiting-input terminal', async () => {
    events.length = 0;
    appendCloudAgentEvents.mockClear();
    transitionCloudAgentRun.mockClear();

    const stream = buildManagedAgentStream({
      generator: canonicalEventGenerator(),
      processed,
      usage: createObservedProviderUsage(),
      completionReason: 'tool_loop_completed',
      cancellationReason: 'client_cancelled_tool_loop',
      runJournal: {
        db: processed.managedUsage!.db,
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
      },
    });

    const output = await readAll(stream);

    expect(output).toContain('x_agent_event');
    expect(events[0]).toBe('event-persisted');
    expect(appendCloudAgentEvents).toHaveBeenCalledOnce();
    expect(transitionCloudAgentRun).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ state: 'ready_for_review' }),
    );
  });

  it('prices a journaled in-request run from the same settlement that charged the user', async () => {
    recordCloudAgentRunSettledUsage.mockClear();
    const usage = createObservedProviderUsage();
    accumulateObservedProviderUsage(usage, {
      inputTokens: 820,
      outputTokens: 260,
      reasoningTokens: 40,
    });
    const stream = buildManagedAgentStream({
      generator: completedGenerator(),
      processed,
      usage,
      completionReason: 'tool_loop_completed',
      cancellationReason: 'client_cancelled_tool_loop',
      runJournal: {
        db: processed.managedUsage!.db,
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
      },
    });

    await readAll(stream);

    expect(recordCloudAgentRunSettledUsage).toHaveBeenCalledWith(processed.managedUsage!.db, {
      userId: 'user-1',
      runId: '0190a000-0000-7000-8000-000000000001',
      billingIdempotencyKey: 'agi.chat.web.send.message-1',
      usage: {
        providerCalls: 1,
        inputTokens: 820,
        outputTokens: 260,
        reasoningTokens: 40,
        costCents: 11,
      },
    });
  });

  it('marks a journaled run cancelled when its client stream disconnects', async () => {
    transitionCloudAgentRun.mockClear();
    const stream = buildManagedAgentStream({
      generator: completedGenerator(),
      processed,
      usage: createObservedProviderUsage(),
      completionReason: 'tool_loop_completed',
      cancellationReason: 'client_cancelled_tool_loop',
      runJournal: {
        db: processed.managedUsage!.db,
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
      },
    });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    expect(transitionCloudAgentRun).toHaveBeenCalledWith(processed.managedUsage!.db, {
      userId: 'user-1',
      runId: '0190a000-0000-7000-8000-000000000001',
      state: 'cancelled',
    });
  });

  it('reports the durable terminal outcome after settlement and before the terminal event', async () => {
    events.length = 0;
    const onTerminal = vi.fn(async (outcome: string) => {
      events.push(`checkpoint-${outcome}`);
    });
    const stream = buildManagedAgentStream({
      generator: completedGenerator(),
      processed,
      usage: createObservedProviderUsage(),
      completionReason: 'tool_resume_completed',
      cancellationReason: 'client_cancelled_tool_resume',
      onTerminal,
    });

    await readAll(stream);

    expect(onTerminal).toHaveBeenCalledWith('completed');
    expect(events).toEqual(['settled', 'delivered', 'checkpoint-completed', 'terminal-visible']);
  });

  it('reports cancellation to the durable checkpoint owner', async () => {
    const onTerminal = vi.fn(async () => undefined);
    const stream = buildManagedAgentStream({
      generator: completedGenerator(),
      processed,
      usage: createObservedProviderUsage(),
      completionReason: 'tool_resume_completed',
      cancellationReason: 'client_cancelled_tool_resume',
      onTerminal,
    });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    expect(onTerminal).toHaveBeenCalledWith('cancelled');
  });

  it('persists validated cards for a detached turn and caps them before metadata serialization', async () => {
    persistenceMocks.execute.mockClear();
    const persistable = {
      ...processed,
      requestId: 'request-map-fixture',
      conversationId: '0190a000-0000-7000-8000-000000000003',
      assistantMessageId: '0190a000-0000-7000-8000-000000000004',
      conversationIsTemporary: false,
    } as ProcessedRequest;

    await readAll(
      buildManagedAgentStream({
        generator: cardGenerator(INTERACTIVE_CARDS_MAX_PER_MESSAGE + 2),
        processed: persistable,
        usage: createObservedProviderUsage(),
        completionReason: 'tool_loop_completed',
        cancellationReason: 'client_cancelled_tool_loop',
        userId: 'user-fixture',
      }),
    );

    const call = persistenceMocks.execute.mock.calls.find(([sql]) =>
      String(sql).includes('insert into web_messages'),
    );
    expect(call).toBeDefined();
    const params = call?.[1] as unknown[] | undefined;
    const metadata = JSON.parse(String(params?.[7])) as Record<string, unknown>;
    expect(metadata['interactiveCards']).toHaveLength(INTERACTIVE_CARDS_MAX_PER_MESSAGE);
  });

  it('preserves awaiting-input when disconnect follows a durable approval checkpoint', async () => {
    transitionCloudAgentRun.mockClear();
    const stream = buildManagedAgentStream({
      generator: canonicalEventGenerator(),
      processed,
      usage: createObservedProviderUsage(),
      completionReason: 'tool_resume_completed',
      cancellationReason: 'client_cancelled_tool_resume',
      runJournal: {
        db: processed.managedUsage!.db,
        userId: 'user-1',
        runId: '0190a000-0000-7000-8000-000000000001',
      },
      preserveAwaitingInputOnCancel: () => true,
    });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    expect(transitionCloudAgentRun).not.toHaveBeenCalledWith(
      processed.managedUsage!.db,
      expect.objectContaining({ state: 'cancelled' }),
    );
  });
});

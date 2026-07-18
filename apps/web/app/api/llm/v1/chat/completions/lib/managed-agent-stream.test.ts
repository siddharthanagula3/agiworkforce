import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const events: string[] = [];
const finalize = vi.fn(async (_input: unknown) => {
  events.push('settled');
});
const delivered = vi.fn(async (_input: unknown) => {
  events.push('delivered');
});
const recordFreeTrialTokens = vi.fn(async (_input: unknown) => {
  events.push('free-recorded');
});
const appendCloudAgentEvent = vi.fn(async (_db: unknown, input: { envelope: unknown }) => {
  events.push('event-persisted');
  return { state: (input.envelope as { event: { state?: string } }).event.state ?? 'running' };
});
const transitionCloudAgentRun = vi.fn(async (_db: unknown, input: { state: string }) => ({
  state: input.state,
}));

vi.mock('@/lib/services/managed-usage-accounting-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-accounting-service')>()),
  finalizeObservedManagedUsage: (input: unknown) => finalize(input),
}));

vi.mock('@/lib/services/managed-usage-request-service', () => ({
  markManagedUsageClientDelivered: (input: unknown) => delivered(input),
}));

vi.mock('@/lib/services/free-trial-service', () => ({
  recordFreeTrialTokens: (input: unknown) => recordFreeTrialTokens(input),
}));

vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  appendCloudAgentEvent: (db: unknown, input: unknown) =>
    appendCloudAgentEvent(db, input as { envelope: unknown }),
  transitionCloudAgentRun: (db: unknown, input: unknown) =>
    transitionCloudAgentRun(db, input as { state: string }),
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
              schemaVersion: 3,
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

  it('records all observed provider tokens for a free-tier tool loop before completion', async () => {
    events.length = 0;
    recordFreeTrialTokens.mockClear();
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

    expect(recordFreeTrialTokens).toHaveBeenCalledWith({
      userId: 'free-user',
      requestId: 'free-request',
      tokens: 120,
    });
    expect(events).toEqual(['free-recorded', 'terminal-visible']);
  });

  it('persists canonical activity before making it visible and preserves an awaiting-input terminal', async () => {
    events.length = 0;
    appendCloudAgentEvent.mockClear();
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
    expect(appendCloudAgentEvent).toHaveBeenCalledOnce();
    expect(transitionCloudAgentRun).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ state: 'ready_for_review' }),
    );
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
});

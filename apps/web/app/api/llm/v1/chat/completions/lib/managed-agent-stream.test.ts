import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const events: string[] = [];
const finalize = vi.fn(async (_input: unknown) => {
  events.push('settled');
});
const delivered = vi.fn(async (_input: unknown) => {
  events.push('delivered');
});

vi.mock('@/lib/services/managed-usage-accounting-service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/services/managed-usage-accounting-service')
  >()),
  finalizeObservedManagedUsage: (input: unknown) => finalize(input),
}));

vi.mock('@/lib/services/managed-usage-request-service', () => ({
  markManagedUsageClientDelivered: (input: unknown) => delivered(input),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
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
});

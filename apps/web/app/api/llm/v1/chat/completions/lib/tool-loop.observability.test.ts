import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const provider = vi.hoisted(() => ({ stream: vi.fn() }));
const outcomes = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock('@/lib/logger', () => {
  const capture = (record: unknown) => {
    if (record && typeof record === 'object') emitted.push(record as Record<string, unknown>);
  };
  const logger = { info: capture, error: capture, warn: capture, debug: capture };
  return { logger, default: logger };
});
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: provider.stream,
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn().mockResolvedValue(null),
  pauseE2BSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  BLOCK_APPEAL_PATH: '/support',
}));
vi.mock('@/lib/observability/metrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/observability/metrics')>()),
  recordToolOutcome: outcomes.record,
}));

import { runToolLoop, toolSpanStatus } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

const CONVERSATION_ID = 'conv-observability-1';
const REQUEST_ID = 'req-observability-1';

function stream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')),
      );
      controller.close();
    },
  });
}

function toolCallStream(name: string, args: Record<string, unknown>) {
  return stream([
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call-observed-1',
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
          index: 0,
        },
      ],
      model: 'fixture-model',
    },
    { choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], model: 'fixture-model' },
  ]);
}

function callerTool(name: string) {
  return {
    type: 'function',
    function: { name, description: name, parameters: { type: 'object', properties: {} } },
  };
}

function makeProcessed(callerTools: unknown[]): ProcessedRequest {
  const messages = [{ role: 'user', content: 'Open the pricing page.' }];
  return {
    chatSurface: 'chrome' as const,
    requestId: REQUEST_ID,
    chatRequest: { model: 'fixture-model', messages, stream: true, tools: callerTools },
    conversationId: CONVERSATION_ID,
    requestedModel: 'fixture-model',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 512,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'fixture-model',
    resolvedTaskType: 'general',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'fixture-model',
      messages,
      max_tokens: 512,
      stream: true,
      tools: callerTools,
    },
  } as ProcessedRequest;
}

async function drain(generator: AsyncGenerator<Uint8Array>): Promise<void> {
  for await (const chunk of generator) void chunk;
}

function span(name: string): Record<string, unknown> {
  const record = emitted.find((entry) => entry['event'] === 'span' && entry['span_name'] === name);
  if (!record) throw new Error(`no span record named ${name}`);
  return record;
}

describe('tool loop observability', () => {
  beforeEach(() => {
    emitted.length = 0;
    provider.stream.mockReset();
    outcomes.record.mockReset();
  });

  it('traces a browser command handed to the extension with its browser task and session ids', async () => {
    provider.stream.mockResolvedValueOnce(
      toolCallStream('browser_navigate', { url: 'https://example.com' }),
    );

    await drain(
      runToolLoop(makeProcessed([callerTool('browser_navigate')]), { approvalMode: 'auto' }),
    );

    const handoff = span('browser.command.handoff');
    expect(handoff['agi.browser.task_id']).toBe(REQUEST_ID);
    expect(handoff['session.id']).toBe(CONVERSATION_ID);
    expect(handoff['agi.turn.id']).toBe(REQUEST_ID);
    expect(handoff['gen_ai.tool.call.id']).toBe('call-observed-1');
    expect(handoff['span_domain']).toBe('tool');
    expect(outcomes.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'computer-use', status: 'handed_off', remote: false }),
    );
  });

  it('does not open a browser task span for a caller tool that is not a browser command', async () => {
    provider.stream.mockResolvedValueOnce(toolCallStream('write_note', { text: 'x' }));

    await drain(runToolLoop(makeProcessed([callerTool('write_note')]), { approvalMode: 'auto' }));

    expect(emitted.some((entry) => entry['span_name'] === 'browser.command.handoff')).toBe(false);
    expect(outcomes.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'handed_off' }));
  });

  it('logs first-provider-line latency for the serving route and attempt', async () => {
    const timestamps = [0, 100, 200, 350, 400];
    provider.stream.mockResolvedValueOnce(
      stream([
        { choices: [{ delta: { content: 'Done.' }, index: 0 }], model: 'fixture-model' },
        { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'fixture-model' },
      ]),
    );

    await drain(
      runToolLoop(makeProcessed([]), {
        approvalMode: 'auto',
        now: () => timestamps.shift() ?? 400,
      }),
    );

    expect(emitted).toContainEqual(
      expect.objectContaining({
        event: 'llm_ttft_observed',
        request_id: REQUEST_ID,
        operation_id: expect.any(String),
        attempt_id: expect.any(String),
        attempt: 1,
        provider: 'openai',
        model: 'fixture-model',
        routeId: 'openai:fixture-model',
        ttftMs: 200,
        sloTargetMs: expect.any(Number),
        sloBreachMs: expect.any(Number),
      }),
    );
  });
});

describe('hosted tool execution span', () => {
  beforeEach(() => {
    emitted.length = 0;
    provider.stream.mockReset();
    outcomes.record.mockReset();
  });

  it('carries the tool call, session and turn ids on the execution span', async () => {
    provider.stream
      .mockResolvedValueOnce(toolCallStream('ask_clarifying_questions', {}))
      .mockResolvedValue(
        stream([
          { choices: [{ delta: { content: 'Done.' }, index: 0 }], model: 'fixture-model' },
          { choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'fixture-model' },
        ]),
      );
    const processed = makeProcessed([]);
    processed.chatSurface = 'web';
    processed.llmRequest.tools = [callerTool('ask_clarifying_questions')] as never;

    await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    const execution = span('gen_ai.execute_tool');
    expect(execution['gen_ai.tool.name']).toBe('ask_clarifying_questions');
    expect(execution['gen_ai.tool.call.id']).toBe('call-observed-1');
    expect(execution['session.id']).toBe(CONVERSATION_ID);
    expect(execution['agi.turn.id']).toBe(REQUEST_ID);
    expect(execution['agi.tool.status']).toEqual(expect.any(String));
    expect(outcomes.record).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: expect.any(Number), remote: false }),
    );
  });
});

describe('toolSpanStatus', () => {
  it('distinguishes a paused, unavailable, failed and completed call', () => {
    expect(
      toolSpanStatus({
        content: '',
        isError: false,
        inputRequired: { inputRequests: {} } as never,
      }),
    ).toBe('input_required');
    expect(toolSpanStatus({ content: '', isError: true, unavailable: true })).toBe('unavailable');
    expect(toolSpanStatus({ content: '', isError: true })).toBe('failed');
    expect(toolSpanStatus({ content: 'ok', isError: false })).toBe('completed');
  });
});

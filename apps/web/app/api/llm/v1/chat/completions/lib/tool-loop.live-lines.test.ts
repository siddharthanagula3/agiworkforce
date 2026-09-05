import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
}));

vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>();
  return {
    ...actual,
    reserveManagedUsageProviderStep: vi.fn(),
    ManagedUsageRequestError: class ManagedUsageRequestError extends Error {},
  };
});

import { runToolLoop, type ToolLoopFailoverPlan } from './tool-loop';
import { WEB_SEARCH_CITATION_DELTA_KEY } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

const THINKING_OPEN = '<thinking>';
const SETTLE_TICKS = 6;

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    model: 'test-model',
  })}\n\n`;
}

function openStream(): {
  stream: ReadableStream;
  push: (line: string) => void;
  fail: (error: unknown) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(self) {
      controller = self;
    },
  });
  return {
    stream,
    push: (line) => controller.enqueue(encoder.encode(line)),
    fail: (error) => controller.error(error),
    close: () => controller.close(),
  };
}

function closedStream(lines: string[]): ReadableStream {
  const provider = openStream();
  for (const line of lines) provider.push(line);
  provider.close();
  return provider.stream;
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < SETTLE_TICKS; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-live-lines-1',
    chatRequest: { model: 'gpt-test', messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: 'gpt-test',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'gpt-test',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'answer the question' }],
      max_tokens: 1000,
      stream: true,
      tools: [
        {
          type: 'function',
          function: {
            name: 'web_search',
            description: 'Search the web.',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
        },
      ],
    } as never,
  } as ProcessedRequest;
}

function consume(generator: AsyncGenerator<Uint8Array>): {
  seen: () => string;
  done: Promise<void>;
} {
  const decoder = new TextDecoder();
  let out = '';
  const done = (async () => {
    for await (const value of generator) out += decoder.decode(value);
  })();
  return { seen: () => out, done };
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function rotatedOncePlan(): { next: Mock<ToolLoopFailoverPlan['next']> } {
  const rotated = { ...makeProcessed(), provider: 'anthropic' } as ProcessedRequest;
  let rotations = 0;
  return {
    next: vi.fn<ToolLoopFailoverPlan['next']>(() => {
      rotations += 1;
      return rotations > 1 ? null : { provider: 'anthropic', processed: rotated };
    }),
  };
}

describe('runToolLoop, provider lines reach the client while the step is still running', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
  });

  it('yields each line as it is parsed, in order, without dropping or repeating one', async () => {
    const provider = openStream();
    mockBuildToolLoopStream.mockResolvedValue(provider.stream);

    const reader = consume(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));
    provider.push(chunk({ content: 'first' }));
    await settle();

    expect(reader.seen()).toContain('"content":"first"');

    provider.push(chunk({ content: 'second' }));
    provider.push(chunk({}, 'stop'));
    provider.close();
    await reader.done;

    const output = reader.seen();
    expect(occurrences(output, '"content":"first"')).toBe(1);
    expect(occurrences(output, '"content":"second"')).toBe(1);
    expect(output.indexOf('"content":"first"')).toBeLessThan(output.indexOf('"content":"second"'));
  });

  it('surfaces the stream error instead of failing over once a thinking delta has shipped', async () => {
    const provider = openStream();
    mockBuildToolLoopStream
      .mockResolvedValueOnce(provider.stream)
      .mockResolvedValue(closedStream([chunk({ content: 'rescued' }), chunk({}, 'stop')]));
    const failover = rotatedOncePlan();

    const reader = consume(runToolLoop(makeProcessed(), { approvalMode: 'auto', failover }));
    provider.push(chunk({ content: THINKING_OPEN }));
    provider.push(chunk({ content: 'weighing the options' }));
    await settle();
    provider.fail(new Error('provider dropped the connection'));
    await reader.done;

    expect(failover.next).not.toHaveBeenCalled();
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(reader.seen()).toContain('x_stream_error');
  });

  it('emits a canonical reasoning-delta agent event for text inside a thinking block', async () => {
    const provider = closedStream([
      chunk({ content: THINKING_OPEN }),
      chunk({ content: 'weighing the options' }),
      chunk({ content: '</thinking>' }),
      chunk({ content: 'the answer' }),
      chunk({}, 'stop'),
    ]);
    mockBuildToolLoopStream.mockResolvedValueOnce(provider);

    const reader = consume(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));
    await reader.done;

    const output = reader.seen();
    const reasoningEvents = output
      .split('\n')
      .filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'))
      .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
      .map(
        (frame) =>
          (frame['choices'] as Array<{ delta?: Record<string, unknown> }> | undefined)?.[0]
            ?.delta?.['x_agent_event'],
      )
      .filter((event): event is Record<string, unknown> => Boolean(event))
      .map((envelope) => envelope['event'] as Record<string, unknown>)
      .filter((event) => event['type'] === 'reasoning-delta');

    expect(reasoningEvents.map((event) => event['delta']).join('')).toBe('weighing the options');
    expect(output).toContain('"content":"the answer"');
  });

  it('does not fail over once a citation line has shipped', async () => {
    const provider = openStream();
    mockBuildToolLoopStream
      .mockResolvedValueOnce(provider.stream)
      .mockResolvedValue(closedStream([chunk({ content: 'rescued' }), chunk({}, 'stop')]));
    const failover = rotatedOncePlan();

    const reader = consume(runToolLoop(makeProcessed(), { approvalMode: 'auto', failover }));
    provider.push(
      chunk({ [WEB_SEARCH_CITATION_DELTA_KEY]: { url: 'https://example.com', title: 'Example' } }),
    );
    await settle();
    provider.fail(new Error('provider dropped the connection'));
    await reader.done;

    expect(failover.next).not.toHaveBeenCalled();
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(reader.seen()).toContain('x_stream_error');
  });

  it('still fails over when the stream dies before any line reaches the client', async () => {
    const provider = openStream();
    mockBuildToolLoopStream
      .mockResolvedValueOnce(provider.stream)
      .mockResolvedValueOnce(closedStream([chunk({ content: 'rescued' }), chunk({}, 'stop')]));
    const failover = rotatedOncePlan();

    const reader = consume(runToolLoop(makeProcessed(), { approvalMode: 'auto', failover }));
    await settle();
    provider.fail(new Error('provider dropped the connection'));
    await reader.done;

    expect(failover.next).toHaveBeenCalledWith(expect.any(Error), { step: 1 });
    expect(reader.seen()).toContain('"content":"rescued"');
    expect(reader.seen()).not.toContain('x_stream_error');
  });

  it('hands the consumer every line of a tool-call step before the tool runs', async () => {
    const toolCallStep = closedStream([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'web_search', arguments: '' } }],
      }),
      chunk({
        tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ query: 'anything' }) } }],
      }),
      chunk({}, 'tool_calls'),
    ]);
    mockBuildToolLoopStream
      .mockResolvedValueOnce(toolCallStep)
      .mockResolvedValueOnce(closedStream([chunk({ content: 'done' }), chunk({}, 'stop')]));

    let seenWhenToolRan = '';
    const reader = consume(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        toolExecutor: async () => {
          await settle();
          seenWhenToolRan = reader.seen();
          return { content: 'ok', isError: false };
        },
      }),
    );
    await reader.done;

    expect(seenWhenToolRan).toContain('"name":"web_search"');
    expect(seenWhenToolRan).toContain('anything');
    expect(seenWhenToolRan).toContain('"finish_reason":"tool_calls"');
  });

  it('ends the generator when the consumer walks away mid-stream', async () => {
    const provider = openStream();
    mockBuildToolLoopStream.mockResolvedValue(provider.stream);

    const generator = runToolLoop(makeProcessed(), { approvalMode: 'auto' });
    const decoder = new TextDecoder();
    const abandoned = (async () => {
      for await (const value of generator) {
        if (decoder.decode(value).includes('"content":"first"')) break;
      }
    })();
    provider.push(chunk({ content: 'first' }));

    await expect(
      Promise.race([
        abandoned.then(() => 'ended'),
        new Promise((resolve) => setTimeout(() => resolve('hung'), 1000)),
      ]),
    ).resolves.toBe('ended');
  });

  it('does not strand the consumer when the provider read loop throws', async () => {
    const provider = openStream();
    mockBuildToolLoopStream.mockResolvedValue(provider.stream);

    const reader = consume(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));
    provider.push(chunk({ content: 'partial' }));
    await settle();
    provider.fail(new Error('read loop exploded'));

    await expect(
      Promise.race([
        reader.done.then(() => 'ended'),
        new Promise((resolve) => setTimeout(() => resolve('hung'), 1000)),
      ]),
    ).resolves.toBe('ended');
    expect(reader.seen()).toContain('"content":"partial"');
    expect(reader.seen()).toContain('data: [DONE]');
  });
});

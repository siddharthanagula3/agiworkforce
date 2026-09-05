import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { runToolLoop, withProviderStreamDeadline } from './tool-loop';
import { CHAT_TOOL_LOOP_BUDGET_MS, TOOL_CALL_DEADLINE_MS } from '@/lib/deadline-policy';
import type { ProcessedRequest } from './request-processor';

function sseStreamFrom(lines: string[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    model: 'test-model',
  })}\n\n`;
}

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-deadline-1',
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
      messages: [{ role: 'user', content: 'search for something' }],
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

async function drainWithFakeTimers(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  const drained = (async () => {
    for await (const value of gen) out += decoder.decode(value);
  })();
  for (let i = 0; i < 60; i += 1) {
    await vi.advanceTimersByTimeAsync(5_000);
  }
  await drained;
  return out;
}

describe('runToolLoop, per-tool deadline is clamped to the loop budget', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives a tool only the loop budget that is left, not the full 120 s cap', async () => {
    const toolCallStep = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'web_search', arguments: '' } }],
      }),
      chunk({
        tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ query: 'anything' }) } }],
      }),
      chunk({}, 'tool_calls'),
    ]);
    const finalStep = sseStreamFrom([chunk({ content: 'Done.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(toolCallStep).mockResolvedValueOnce(finalStep);

    const base = 1_000_000;
    let reads = 0;
    const now = (): number => (reads++ === 0 ? base : base + 235_000);

    const output = await drainWithFakeTimers(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        maxDurationMs: CHAT_TOOL_LOOP_BUDGET_MS,
        now,
        toolExecutor: () => new Promise(() => {}),
      }),
    );

    expect(output).toContain('timed out after 5s');
    expect(output).not.toContain(`timed out after ${TOOL_CALL_DEADLINE_MS / 1000}s`);
  });

  it('still allows the full per-call cap when the loop budget has room', async () => {
    const toolCallStep = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'web_search', arguments: '' } }],
      }),
      chunk({
        tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ query: 'anything' }) } }],
      }),
      chunk({}, 'tool_calls'),
    ]);
    const finalStep = sseStreamFrom([chunk({ content: 'Done.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(toolCallStep).mockResolvedValueOnce(finalStep);

    const base = 2_000_000;
    const now = (): number => base;

    const output = await drainWithFakeTimers(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        maxDurationMs: CHAT_TOOL_LOOP_BUDGET_MS,
        now,
        toolExecutor: () => new Promise(() => {}),
      }),
    );

    expect(output).toContain(`timed out after ${TOOL_CALL_DEADLINE_MS / 1000}s`);
  });
});

describe('runToolLoop, the provider stream is clamped to the loop budget too', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function neverSettlingStream(): ReadableStream {
    return new ReadableStream({ start() {} });
  }

  it('stops a wedged provider stream with the budget that is left, and still tears down', async () => {
    mockBuildToolLoopStream.mockResolvedValue(neverSettlingStream());

    const base = 3_000_000;
    let reads = 0;
    const now = (): number => (reads++ === 0 ? base : base + 235_000);

    const output = await drainWithFakeTimers(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        maxDurationMs: CHAT_TOOL_LOOP_BUDGET_MS,
        now,
        failover: {
          next: () => {
            throw new Error('failover consulted for a budget stop');
          },
        },
      }),
    );

    expect(output).toContain('The model took too long to respond');
    expect(output).toContain('"code":"provider_timeout"');
    expect(output).not.toContain("ran past this turn's remaining time budget");
    expect(output).toContain('[DONE]');
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
  });

  it('lets a fresh turn use the whole remaining budget before cutting the stream', async () => {
    mockBuildToolLoopStream.mockResolvedValue(neverSettlingStream());

    const base = 4_000_000;
    const now = (): number => base;

    const output = await drainWithFakeTimers(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        maxDurationMs: CHAT_TOOL_LOOP_BUDGET_MS,
        now,
      }),
    );

    expect(output).toContain('The model took too long to respond');
    expect(output).toContain('"code":"provider_timeout"');
  });
});

describe('runToolLoop, a provider stream deadline maps to plain user copy', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('streams the mapped api_timeout copy and code, not the raw deadline message', async () => {
    mockBuildToolLoopStream.mockResolvedValue(new ReadableStream({ start() {} }));

    const base = 5_000_000;
    const now = (): number => base;

    const output = await drainWithFakeTimers(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        maxDurationMs: CHAT_TOOL_LOOP_BUDGET_MS,
        now,
      }),
    );

    expect(output).toContain(
      'The model took too long to respond. Try again, or pick a faster model from the model picker.',
    );
    expect(output).toContain('"code":"provider_timeout"');
    expect(output).not.toContain("ran past this turn's remaining time budget");
  });
});

describe('withProviderStreamDeadline, the signal handed to the adapter', () => {
  it('aborts the adapter signal on expiry, with the deadline error as the reason', async () => {
    let adapterSignal: AbortSignal | undefined;
    const pending = withProviderStreamDeadline((signal) => {
      adapterSignal = signal;
      return new Promise<never>(() => {});
    }, 20);

    await expect(pending).rejects.toThrow(/ran past this turn's remaining time budget/);
    expect(adapterSignal?.aborted).toBe(true);
    expect((adapterSignal?.reason as Error).name).toBe('ProviderStreamDeadlineError');
  });

  it('forwards a client cancel onto the adapter signal with the client reason', async () => {
    const client = new AbortController();
    let adapterSignal: AbortSignal | undefined;
    const pending = withProviderStreamDeadline(
      (signal) => {
        adapterSignal = signal;
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true });
        });
      },
      60_000,
      client.signal,
    );

    client.abort(new Error('client disconnected'));

    await expect(pending).rejects.toThrow('client disconnected');
    expect(adapterSignal?.aborted).toBe(true);
  });

  it('hands the adapter an already-aborted signal when the cancel landed first', async () => {
    const client = new AbortController();
    client.abort(new Error('cancelled before dispatch'));
    let abortedAtDispatch: boolean | undefined;

    await expect(
      withProviderStreamDeadline(
        (signal) => {
          abortedAtDispatch = signal.aborted;
          return Promise.reject(signal.reason as Error);
        },
        60_000,
        client.signal,
      ),
    ).rejects.toThrow('cancelled before dispatch');
    expect(abortedAtDispatch).toBe(true);
  });

  it('clears the deadline timer when the stream finishes inside its budget', async () => {
    vi.useFakeTimers();
    try {
      await expect(
        withProviderStreamDeadline(() => Promise.resolve('drained'), CHAT_TOOL_LOOP_BUDGET_MS),
      ).resolves.toBe('drained');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

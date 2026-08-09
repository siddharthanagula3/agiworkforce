/**
 * HARD-008 — a child deadline must not outlive its parent.
 *
 * `runToolLoop` checks its wall-clock budget only at the TOP of a step. Before
 * this fix the per-tool-call cap was the fixed 120 s constant, so a tool call
 * admitted with a few seconds of budget left ran for a further two minutes and
 * pushed the invocation past `export const maxDuration = 300` on
 * `app/api/llm/v1/chat/completions/route.ts` — a platform SIGKILL, which skips
 * the generator `finally` that disposes the E2B sandbox and settles managed
 * usage.
 *
 * The loop clock is injected (`options.now`) so the scenario is deterministic:
 * the turn is 235 s into a 240 s budget when the tool starts, leaving 5 s. The
 * assertion is on the timeout MESSAGE ("timed out after 5s"), not on how long
 * the test takes, so the pre-fix behaviour fails loudly with "after 120s"
 * rather than merely hanging.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
}));

vi.mock('@/lib/services/managed-usage-request-service', () => ({
  reserveManagedUsageProviderStep: vi.fn(),
  ManagedUsageRequestError: class ManagedUsageRequestError extends Error {},
}));

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

/**
 * Drive the loop under fake timers, pushing the clock far past BOTH the
 * clamped deadline and the unclamped 120 s one so either variant terminates.
 */
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

describe('runToolLoop — per-tool deadline is clamped to the loop budget', () => {
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

    // First `now()` is the loop's own start stamp; every later read reports the
    // turn as 235 s into its 240 s budget, so 5 s remain when the tool starts.
    const base = 1_000_000;
    let reads = 0;
    const now = (): number => (reads++ === 0 ? base : base + 235_000);

    const output = await drainWithFakeTimers(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        maxDurationMs: CHAT_TOOL_LOOP_BUDGET_MS,
        now,
        // A tool that never settles: only the timeout can end it.
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

    // Fresh turn: the clamp must not shorten a call that legitimately fits.
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

/**
 * The provider call is the OTHER child started right after the same top-of-step
 * budget check, and it had no wall-clock bound at all: the only signal reaching
 * the adapter was the OPTIONAL client `AbortSignal`, and `buildToolLoopStream`
 * substitutes a never-triggered controller when the caller passes none (the
 * durable workflow path does). A wedged upstream therefore ran until the
 * platform killed the function — the same skipped-teardown outcome the tool
 * clamp exists to prevent.
 *
 * Without the clamp these two cases do not fail with a wrong message, they
 * never terminate: the loop awaits `collectProviderStream` on a stream that
 * never closes, so the suite fails on its own timeout.
 */
describe('runToolLoop — the provider stream is clamped to the loop budget too', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A provider stream that connects and then never emits or closes. */
  function neverSettlingStream(): ReadableStream {
    return new ReadableStream({ start() {} });
  }

  it('stops a wedged provider stream with the budget that is left, and still tears down', async () => {
    mockBuildToolLoopStream.mockResolvedValue(neverSettlingStream());

    // Same shape as the tool case above: 235 s into a 240 s budget, so the
    // provider call may have 5 s, not the rest of the platform's 300 s.
    const base = 3_000_000;
    let reads = 0;
    const now = (): number => (reads++ === 0 ? base : base + 235_000);

    const output = await drainWithFakeTimers(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        maxDurationMs: CHAT_TOOL_LOOP_BUDGET_MS,
        now,
        // A rotation must NOT be attempted: the budget is gone, not the
        // provider. If the loop consulted this, the assertion below on the
        // single call would fail.
        failover: {
          next: () => {
            throw new Error('failover consulted for a budget stop');
          },
        },
      }),
    );

    expect(output).toContain("ran past this turn's remaining time budget (5s)");
    // The teardown the budget exists to protect actually ran: the terminal
    // flush reached the client instead of being skipped by a SIGKILL.
    expect(output).toContain('[DONE]');
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
  });

  it('lets a fresh turn use the whole remaining budget before cutting the stream', async () => {
    mockBuildToolLoopStream.mockResolvedValue(neverSettlingStream());

    // Nothing spent yet: the cap is the loop budget itself, NOT some second
    // hand-picked per-call number.
    const base = 4_000_000;
    const now = (): number => base;

    const output = await drainWithFakeTimers(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        maxDurationMs: CHAT_TOOL_LOOP_BUDGET_MS,
        now,
      }),
    );

    expect(output).toContain(
      `ran past this turn's remaining time budget (${CHAT_TOOL_LOOP_BUDGET_MS / 1000}s)`,
    );
  });
});

/**
 * Three properties of the clamp that the SSE bytes above cannot show, because
 * they are about what happens to the UPSTREAM request rather than to the loop:
 *
 *  - on expiry the derived signal is aborted, so the provider connection is
 *    released instead of streaming (and billing) into a reader nobody drains;
 *  - a client cancel still reaches the adapter, which used to be true only
 *    because `options.signal` was passed straight through — the derived
 *    controller must not swallow it, including when the cancel landed before
 *    dispatch;
 *  - the deadline timer is cleared on the happy path, so a normal turn does
 *    not leave a 240 s timer pending behind it.
 */
describe('withProviderStreamDeadline — the signal handed to the adapter', () => {
  it('aborts the adapter signal on expiry, with the deadline error as the reason', async () => {
    let adapterSignal: AbortSignal | undefined;
    const pending = withProviderStreamDeadline((signal) => {
      adapterSignal = signal;
      // An upstream that ignores the clock entirely — only the clamp can
      // end this.
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
      // A leaked timer here would hold the invocation open for the rest of the
      // loop budget after the turn is already done.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

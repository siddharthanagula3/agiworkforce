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

import { runToolLoop } from './tool-loop';
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

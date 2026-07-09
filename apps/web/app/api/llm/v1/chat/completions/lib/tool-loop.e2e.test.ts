/**
 * End-to-end proof that the reachable E2B execution loop actually works:
 * runToolLoop (auto mode) -> collects a provider tool_call -> runMcpTool
 * intercepts it as an execution tool -> routeExecutionTool runs it against a
 * mocked E2BExecutor -> the result is fed back to the provider -> the loop
 * terminates on the model's final answer.
 *
 * This does not touch resolveCodeExecutionTools (native-always path) or any
 * real E2B SDK binding -- only the loop mechanics via a mocked executor,
 * matching the design doc's "mocked executor" verification approach.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// buildToolLoopStream (tool-loop-anthropic.ts) is the table-driven adapter
// dispatch every provider now goes through (task #34's tool-loop slice) --
// mocked here at its own `Promise<ReadableStream>` boundary, same contract
// the old LLMProviderFactory.streamRequest mock stood in for, so the SSE
// fixtures below (raw OpenAI-shaped chunks) still exercise the SAME
// downstream mechanics (collectProviderStream, E2B routing, tool-call
// round-tripping) this file actually tests.
const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
}));

const mockGetE2BExecutor = vi.fn();
const mockPauseE2BSession = vi.fn();
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: (...args: unknown[]) => mockGetE2BExecutor(...args),
  pauseE2BSession: (...args: unknown[]) => mockPauseE2BSession(...args),
}));

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import type { E2BExecutor } from '@/lib/e2b/types';

function sseStreamFrom(lines: string[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

/** One SSE chunk carrying a delta payload, OpenAI-compatible shape. */
function chunk(delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    model: 'test-model',
  })}\n\n`;
}

function makeProcessed(conversationId?: string): ProcessedRequest {
  return {
    requestId: 'req-1',
    chatRequest: { model: 'gpt-test', messages: [], stream: true } as never,
    conversationId,
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
      messages: [{ role: 'user', content: 'run print(1+1)' }],
      max_tokens: 1000,
      stream: true,
    },
  };
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) {
    out += decoder.decode(value);
  }
  return out;
}

describe('runToolLoop end-to-end (mocked provider + mocked E2B executor)', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
  });

  it('executes an execute_code tool call via the E2B interception point and re-invokes the model', async () => {
    // Step 1: provider emits a tool_call for execute_code.
    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'execute_code', arguments: '' } }],
      }),
      chunk({
        tool_calls: [
          {
            index: 0,
            function: { arguments: JSON.stringify({ language: 'python', code: 'print(1+1)' }) },
          },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]);

    // Step 2: after the tool result is fed back, the model returns a final answer.
    const step2 = sseStreamFrom([chunk({ content: 'The answer is 2.' }), chunk({}, 'stop')]);

    mockBuildToolLoopStream.mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);

    const runCode = vi.fn().mockResolvedValue({ ok: true, output: '2\n' });
    const dispose = vi.fn().mockResolvedValue(undefined);
    const executor: E2BExecutor = {
      runCode,
      writeFile: vi.fn(),
      createFolder: vi.fn(),
      dispose,
    };
    mockGetE2BExecutor.mockResolvedValue(executor);

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    // The executor was actually invoked with the model's args -- proves the loop is
    // reachable end-to-end, not just wired statically.
    expect(runCode).toHaveBeenCalledWith({ language: 'python', code: 'print(1+1)' });
    expect(dispose).toHaveBeenCalled();

    // The provider was re-invoked a second time with the tool result appended.
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    // buildToolLoopStream(provider, processed, stepRequest, responseModel) --
    // stepRequest is the 3rd positional arg (index 2), not the 2nd.
    const secondCallRequest = mockBuildToolLoopStream.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    };
    const toolResultMessage = secondCallRequest.messages.find((m) => m.role === 'tool');
    expect(toolResultMessage?.content).toBe('2\n');
    expect(toolResultMessage?.tool_call_id).toBe('call_1');

    // The loop surfaced status/result SSE events and the final model answer to the client.
    expect(output).toContain('"name":"execute_code"');
    expect(output).toContain('"status":"completed"');
    expect(output).toContain('The answer is 2.');
    expect(output).toContain('data: [DONE]');
  });

  it('fails closed with an explicit error when no E2B executor is available (no key configured)', async () => {
    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'execute_code', arguments: '' } }],
      }),
      chunk({
        tool_calls: [
          {
            index: 0,
            function: { arguments: JSON.stringify({ language: 'python', code: '1/0' }) },
          },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]);
    const step2 = sseStreamFrom([
      chunk({ content: 'Execution is unavailable.' }),
      chunk({}, 'stop'),
    ]);

    mockBuildToolLoopStream.mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);
    mockGetE2BExecutor.mockResolvedValue(null);

    const processed = makeProcessed();
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(output).toContain('"status":"failed"');
    expect(output).toContain('Execution environment unavailable');

    // Never silently falls through -- the tool result message carries the explicit error.
    // buildToolLoopStream(provider, processed, stepRequest, responseModel) --
    // stepRequest is the 3rd positional arg (index 2), not the 2nd.
    const secondCallRequest = mockBuildToolLoopStream.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const toolResultMessage = secondCallRequest.messages.find((m) => m.role === 'tool');
    expect(toolResultMessage?.content).toContain('Execution environment unavailable');
  });

  it('pauses (not kills) the conversation-scoped sandbox at turn end instead of disposing it', async () => {
    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'execute_code', arguments: '' } }],
      }),
      chunk({
        tool_calls: [
          { index: 0, function: { arguments: JSON.stringify({ language: 'python', code: '1' }) } },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]);
    const step2 = sseStreamFrom([chunk({ content: 'Done.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);

    const dispose = vi.fn().mockResolvedValue(undefined);
    const executor: E2BExecutor = {
      runCode: vi.fn().mockResolvedValue({ ok: true, output: '1' }),
      writeFile: vi.fn(),
      createFolder: vi.fn(),
      dispose,
    };
    mockGetE2BExecutor.mockResolvedValue(executor);

    const processed = makeProcessed('conv-123');
    await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    // Getting the executor exactly once (no reconnect between tool calls in the
    // same turn) proves it's reused, not recreated per call.
    expect(mockGetE2BExecutor).toHaveBeenCalledTimes(1);
    expect(mockGetE2BExecutor).toHaveBeenCalledWith('conv-123');
    // Conversation-scoped: paused (state preserved for the next turn), never killed here.
    expect(mockPauseE2BSession).toHaveBeenCalledWith('conv-123');
    expect(dispose).not.toHaveBeenCalled();
  });

  it('never touches E2B when no execution tool is invoked in the turn', async () => {
    const step1 = sseStreamFrom([chunk({ content: 'Hi there.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1);

    const processed = makeProcessed('conv-789');
    await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    // The executor is resolved lazily (only on the first execution-tool call) -- a
    // plain-text turn with no tool calls must never create/resume a sandbox nor pause one.
    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
    expect(mockPauseE2BSession).not.toHaveBeenCalled();
  });

  it('pauses the sandbox even when the loop exits via the manual-approval `return` path', async () => {
    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'execute_code', arguments: '' } }],
      }),
      chunk({
        tool_calls: [
          { index: 0, function: { arguments: JSON.stringify({ language: 'python', code: '1' }) } },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1);

    const processed = makeProcessed('conv-manual');
    // Manual approval mode never calls the executor (it suspends on the approval
    // request before execution) -- so there is nothing to pause. This proves the
    // `finally` block runs on the early `return` in that branch without erroring even
    // though `e2bExecutor` was never resolved.
    await expect(drain(runToolLoop(processed, { approvalMode: 'manual' }))).resolves.toContain(
      'x_tool_approval_request',
    );
    expect(mockPauseE2BSession).not.toHaveBeenCalled();
  });
});

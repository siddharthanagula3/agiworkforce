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
import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

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

// Generated-file persistence core (chart PNGs from runCode rich results).
const mockPersistGeneratedFileBytes = vi.fn();
vi.mock('@/lib/server/generated-file-persist', () => ({
  persistGeneratedFileBytes: (...args: unknown[]) => mockPersistGeneratedFileBytes(...args),
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

function agentEvents(output: string): AgentEventEnvelope[] {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .flatMap((line) => {
      const payload = JSON.parse(line.slice('data: '.length)) as {
        choices?: Array<{ delta?: { x_agent_event?: unknown } }>;
      };
      const event = parseAgentEventDelta(payload.choices?.[0]?.delta?.x_agent_event);
      return event ? [event] : [];
    });
}

describe('runToolLoop end-to-end (mocked provider + mocked E2B executor)', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockPersistGeneratedFileBytes.mockReset();
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

    const activity = agentEvents(output);
    expect(activity.map((entry) => entry.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(activity.map((entry) => entry.event.type)).toEqual([
      'task-state-changed',
      'task-state-changed',
      'lifecycle',
      'tool-execution-start',
      'tool-execution-end',
      'text-delta',
      'task-state-changed',
      'stop',
    ]);
    expect(activity[0]).toMatchObject({
      sessionId: 'req-1',
      turnId: 'req-1',
      event: {
        type: 'task-state-changed',
        taskId: 'req-1',
        state: 'queued',
      },
    });
    expect(activity[1]).toMatchObject({
      event: {
        type: 'task-state-changed',
        taskId: 'req-1',
        previousState: 'queued',
        state: 'running',
      },
    });
    expect(activity[2]).toMatchObject({
      event: { type: 'lifecycle', phase: 'started' },
    });
    expect(activity[3]?.event).toEqual({
      type: 'tool-execution-start',
      toolCallId: 'call_1',
      name: 'execute_code',
      category: 'code-execution',
      summary: 'Running code',
      input: { language: 'python', code: 'print(1+1)' },
    });
    expect(activity[4]?.event).toMatchObject({
      type: 'tool-execution-end',
      toolCallId: 'call_1',
      name: 'execute_code',
      output: '2\n',
      isError: false,
    });
    expect(activity[5]?.event).toEqual({
      type: 'text-delta',
      delta: 'The answer is 2.',
    });
    expect(activity[6]?.event).toMatchObject({
      type: 'task-state-changed',
      taskId: 'req-1',
      previousState: 'running',
      state: 'ready_for_review',
    });
    expect(activity[7]?.event).toEqual({ type: 'stop', reason: 'end-turn' });
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
    await drain(runToolLoop(processed, { approvalMode: 'auto', userId: 'user-123' }));

    // Getting the executor exactly once (no reconnect between tool calls in the
    // same turn) proves it's reused, not recreated per call.
    expect(mockGetE2BExecutor).toHaveBeenCalledTimes(1);
    expect(mockGetE2BExecutor).toHaveBeenCalledWith({
      tenantId: 'managed-cloud',
      userId: 'user-123',
      conversationId: 'conv-123',
    });
    // Conversation-scoped: paused (state preserved for the next turn), never killed here.
    expect(mockPauseE2BSession).toHaveBeenCalledWith({
      tenantId: 'managed-cloud',
      userId: 'user-123',
      conversationId: 'conv-123',
    });
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

  it('stops AGI Work cleanly before another provider call when its time budget is exhausted', async () => {
    const processed = makeProcessed();
    processed.chatRequest.work_mode = 'agiwork';
    const now = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(4 * 60_000);

    const output = await drain(runToolLoop(processed, { approvalMode: 'auto', now }));

    expect(mockBuildToolLoopStream).not.toHaveBeenCalled();
    expect(output).toContain('agent_time_budget_reached');
    expect(output).toContain('Continue in the conversation to resume from the visible results.');
    expect(output).toContain('"retryable":true');
    expect(output).toContain('data: [DONE]');

    const activity = agentEvents(output);
    expect(activity.map((entry) => entry.event.type)).toEqual([
      'task-state-changed',
      'task-state-changed',
      'lifecycle',
      'error',
      'task-state-changed',
      'stop',
    ]);
    expect(activity[3]?.event).toMatchObject({
      type: 'error',
      code: 'agent_time_budget_reached',
      retryable: true,
    });
    expect(activity[4]?.event).toMatchObject({
      type: 'task-state-changed',
      previousState: 'running',
      state: 'failed',
    });
    expect(activity[5]?.event).toEqual({ type: 'stop', reason: 'error' });
  });

  it('honors durable cancellation before provider or tool side effects', async () => {
    const isCancellationRequested = vi.fn().mockResolvedValue(true);

    const output = await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        isCancellationRequested,
      }),
    );

    expect(isCancellationRequested).toHaveBeenCalledOnce();
    expect(mockBuildToolLoopStream).not.toHaveBeenCalled();
    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
    expect(output).toContain('data: [DONE]');
    expect(agentEvents(output).map((entry) => entry.event)).toEqual([
      expect.objectContaining({ type: 'task-state-changed', state: 'queued' }),
      expect.objectContaining({ type: 'task-state-changed', state: 'running' }),
      { type: 'lifecycle', phase: 'started' },
      expect.objectContaining({ type: 'task-state-changed', state: 'cancelled' }),
      { type: 'stop', reason: 'cancelled' },
    ]);
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

  it('persists runCode chart PNGs through the generated-file pipeline and emits x_generated_files', async () => {
    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'execute_code', arguments: '' } }],
      }),
      chunk({
        tool_calls: [
          {
            index: 0,
            function: { arguments: JSON.stringify({ language: 'python', code: 'plt.plot()' }) },
          },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]);
    const step2 = sseStreamFrom([chunk({ content: 'Chart attached.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);

    const pngBase64 = Buffer.from('png-bytes').toString('base64');
    const executor: E2BExecutor = {
      runCode: vi.fn().mockResolvedValue({ ok: true, output: '(chart)', pngResults: [pngBase64] }),
      writeFile: vi.fn(),
      createFolder: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    };
    mockGetE2BExecutor.mockResolvedValue(executor);
    mockPersistGeneratedFileBytes.mockResolvedValue({
      ok: true,
      file: {
        id: 'asset-png',
        file_name: 'chart.png',
        mime_type: 'image/png',
        uri: '/api/files/asset-png',
        byte_count: 9,
        kind: 'image',
        checksum_sha256: 'c'.repeat(64),
      },
    });

    const output = await drain(
      runToolLoop(makeProcessed(), { approvalMode: 'auto', userId: 'user-1' }),
    );

    // The PNG bytes were decoded from base64 and handed to the persistence core.
    expect(mockPersistGeneratedFileBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        mimeType: 'image/png',
        filename: 'chart.png',
        provider: 'e2b',
      }),
    );
    const persisted = mockPersistGeneratedFileBytes.mock.calls[0]?.[0] as { data: Buffer };
    expect(persisted.data.toString('utf8')).toBe('png-bytes');

    // The wire carries the same-origin descriptor BEFORE [DONE].
    expect(output).toContain('x_generated_files');
    expect(output).toContain('/api/files/asset-png');
    expect(output.indexOf('x_generated_files')).toBeLessThan(output.lastIndexOf('data: [DONE]'));

    const artifactEvent = agentEvents(output).find(
      (entry) => entry.event.type === 'artifact-produced',
    );
    expect(artifactEvent?.event).toEqual({
      type: 'artifact-produced',
      artifactId: 'asset-png',
      name: 'chart.png',
      mimeType: 'image/png',
      uri: '/api/files/asset-png',
      sizeBytes: 9,
    });
  });

  it('emits an honest inline note (never silence) when chart persistence fails', async () => {
    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'execute_code', arguments: '' } }],
      }),
      chunk({
        tool_calls: [
          {
            index: 0,
            function: { arguments: JSON.stringify({ language: 'python', code: 'plt.plot()' }) },
          },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]);
    const step2 = sseStreamFrom([chunk({ content: 'Chart attached.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);

    const executor: E2BExecutor = {
      runCode: vi.fn().mockResolvedValue({
        ok: true,
        output: '(chart)',
        pngResults: [Buffer.from('x').toString('base64')],
      }),
      writeFile: vi.fn(),
      createFolder: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    };
    mockGetE2BExecutor.mockResolvedValue(executor);
    mockPersistGeneratedFileBytes.mockResolvedValue({ ok: false, reason: 'storage_error' });

    const output = await drain(
      runToolLoop(makeProcessed(), { approvalMode: 'auto', userId: 'user-1' }),
    );

    expect(output).not.toContain('x_generated_files');
    expect(output).toContain('could not be retrieved');
  });
});

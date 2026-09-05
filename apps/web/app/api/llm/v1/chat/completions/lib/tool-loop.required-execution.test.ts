import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

const mockGetE2BExecutor = vi.fn();
const mockPauseE2BSession = vi.fn();
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: (...args: unknown[]) => mockGetE2BExecutor(...args),
  pauseE2BSession: (...args: unknown[]) => mockPauseE2BSession(...args),
}));

import { runToolLoop } from './tool-loop';
import { EXECUTE_CODE_TOOL, e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';
import { webSearchToolDef } from '@/lib/web-search/web-search-tool';
import type { ProcessedRequest } from './request-processor';

const MODEL = 'model-under-test';
const EXECUTION_TOOL_CHOICE = { type: 'function', function: { name: EXECUTE_CODE_TOOL } };
const USER_TURN = 'Use Python to compute the sum of the first 200 prime numbers';

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
    model: MODEL,
  })}\n\n`;
}

function answerStep(text: string): ReadableStream {
  return sseStreamFrom([chunk({ content: text }), chunk({}, 'stop')]);
}

function executionToolCallStep(): ReadableStream {
  return sseStreamFrom([
    chunk({
      tool_calls: [
        { index: 0, id: 'call_1', function: { name: EXECUTE_CODE_TOOL, arguments: '' } },
      ],
    }),
    chunk({
      tool_calls: [
        {
          index: 0,
          function: { arguments: JSON.stringify({ language: 'python', code: 'print(1)' }) },
        },
      ],
    }),
    chunk({}, 'tool_calls'),
  ]);
}

function makeProcessed(overrides: {
  requirement?: ProcessedRequest['executionRequirement'];
  enforcement?: ProcessedRequest['executionEnforcement'];
  installedToolChoice?: unknown;
  requestedToolChoice?: unknown;
}): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-execution',
    chatRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: USER_TURN }],
      stream: true,
      code_execution: true,
      ...(overrides.requestedToolChoice !== undefined
        ? { tool_choice: overrides.requestedToolChoice }
        : {}),
    } as never,
    conversationId: undefined,
    requestedModel: MODEL,
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: MODEL,
    resolvedTaskType: 'coding' as never,
    executionRequirement: overrides.requirement ?? {
      required: true,
      source: 'explicit_intent' as const,
    },
    executionEnforcement: overrides.enforcement ?? {
      mode: 'tool-choice' as const,
      toolChoice: EXECUTION_TOOL_CHOICE,
      attachedTool: 'generic-function' as const,
    },
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: USER_TURN }],
      max_tokens: 1000,
      stream: true,
      tools: [...e2bExecutionToolDefs(), webSearchToolDef()],
      ...(overrides.installedToolChoice !== undefined
        ? { tool_choice: overrides.installedToolChoice }
        : {}),
    },
  } as unknown as ProcessedRequest;
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

function stepRequests(): Array<Record<string, unknown>> {
  return mockBuildToolLoopStream.mock.calls.map((call) => call[2] as Record<string, unknown>);
}

describe('runToolLoop, required code execution', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockGetE2BExecutor.mockResolvedValue(null);
  });

  it('carries the named execution choice into the first step', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Done.'));

    await drain(
      runToolLoop(makeProcessed({ installedToolChoice: EXECUTION_TOOL_CHOICE }), {
        approvalMode: 'auto',
        userId: 'user-1',
      }),
    );

    expect(stepRequests()[0]?.['tool_choice']).toEqual(EXECUTION_TOOL_CHOICE);
  });

  it('releases the named execution choice once the execution step is done', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(executionToolCallStep());
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('The sum is in the output above.'));

    await drain(
      runToolLoop(makeProcessed({ installedToolChoice: EXECUTION_TOOL_CHOICE }), {
        approvalMode: 'auto',
        userId: 'user-1',
      }),
    );

    const requests = stepRequests();
    expect(requests).toHaveLength(2);
    expect(requests[0]?.['tool_choice']).toEqual(EXECUTION_TOOL_CHOICE);
    expect(requests[1]?.['tool_choice']).toBe('auto');
  });

  it("holds a caller's own choice for the whole turn", async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(executionToolCallStep());
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Done.'));

    await drain(
      runToolLoop(
        makeProcessed({
          installedToolChoice: EXECUTION_TOOL_CHOICE,
          requestedToolChoice: EXECUTION_TOOL_CHOICE,
          enforcement: { mode: 'none', attachedTool: null },
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    const requests = stepRequests();
    expect(requests[0]?.['tool_choice']).toEqual(EXECUTION_TOOL_CHOICE);
    expect(requests[1]?.['tool_choice']).toEqual(EXECUTION_TOOL_CHOICE);
  });

  it('leaves a turn with no installed choice untouched', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('An ordinary answer.'));

    const output = await drain(
      runToolLoop(
        makeProcessed({
          requirement: { required: false, source: null },
          enforcement: { mode: 'none', attachedTool: null },
        }),
        { approvalMode: 'auto', userId: 'user-1' },
      ),
    );

    expect(stepRequests()[0]?.['tool_choice']).toBeUndefined();
    expect(output).toContain('An ordinary answer');
  });
});

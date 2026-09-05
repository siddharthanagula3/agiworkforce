import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (provider: string, model: string) => `${provider}/${model}`,
}));

const mockGetE2BExecutor = vi.fn();
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: (...args: unknown[]) => mockGetE2BExecutor(...args),
  pauseE2BSession: vi.fn(),
}));

vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  getCredentialCooldownSnapshot: vi.fn(async () => ({})),
  providerOfRouteId: (routeId: string) => routeId.split('/')[0],
  recordRouteOutcome: vi.fn(async () => undefined),
  recordServedRouteAffinity: vi.fn(async () => undefined),
  routeAffinityTtlMs: () => 3_600_000,
  getRouteHealthSnapshot: vi.fn(async () => ({})),
  getServedRouteAffinity: vi.fn(async () => null),
  getFreeLaneRuntimeState: vi.fn(async () => ({})),
}));

const mockRecordCapabilityObservation = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/services/free-lane/capability-health-service', () => ({
  recordCapabilityObservation: (...args: unknown[]) => mockRecordCapabilityObservation(...args),
  TOOL_CALLING_CAPABILITY: 'functionCalling',
}));

import { runToolLoop } from './tool-loop';
import { EXECUTE_CODE_TOOL, e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';
import type { ProcessedRequest } from './request-processor';

const MODEL = 'model-under-test';
const PROVIDER = 'openai';
const ROUTE_ID = `${PROVIDER}/${MODEL}`;
const TOOLS_CAPABILITY = 'functionCalling';
const USER_TURN = 'Use Python to compute the sum of the first 200 prime numbers';
const WELL_FORMED_ARGS = JSON.stringify({ language: 'python', code: 'print(1)' });
const MALFORMED_ARGS = '{"language": "python", "code":';

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

function executionToolCallStep(args: string): ReadableStream {
  return sseStreamFrom([
    chunk({
      tool_calls: [
        { index: 0, id: 'call_1', function: { name: EXECUTE_CODE_TOOL, arguments: '' } },
      ],
    }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: args } }] }),
    chunk({}, 'tool_calls'),
  ]);
}

function makeProcessed(
  overrides: { required?: boolean; withTools?: boolean } = {},
): ProcessedRequest {
  const withTools = overrides.withTools ?? true;
  return {
    chatSurface: 'web' as const,
    requestId: 'req-capability-adherence',
    chatRequest: {
      model: MODEL,
      messages: [{ role: 'user', content: USER_TURN }],
      stream: true,
      code_execution: withTools,
    } as never,
    conversationId: undefined,
    requestedModel: MODEL,
    provider: PROVIDER,
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: MODEL,
    resolvedTaskType: 'coding' as never,
    executionRequirement: {
      required: overrides.required ?? true,
      source: 'explicit_intent' as const,
    },
    executionEnforcement: {
      mode: 'nudge' as const,
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
      ...(withTools ? { tools: e2bExecutionToolDefs() } : {}),
    },
  } as unknown as ProcessedRequest;
}

async function drain(generator: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of generator) out += decoder.decode(value);
  return out;
}

describe('runToolLoop, learned tool support', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockRecordCapabilityObservation.mockClear();
  });

  it('records a miss when a required tool was offered and never called', async () => {
    mockBuildToolLoopStream.mockResolvedValue(answerStep('Here is the answer without running it.'));

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(mockRecordCapabilityObservation).toHaveBeenCalledWith(ROUTE_ID, TOOLS_CAPABILITY, false);
  });

  it('records the capability as honoured when the model made a well formed call', async () => {
    mockGetE2BExecutor.mockResolvedValue(null);
    mockBuildToolLoopStream
      .mockResolvedValueOnce(executionToolCallStep(WELL_FORMED_ARGS))
      .mockResolvedValue(answerStep('The sandbox is down, here is what I can say.'));

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(mockRecordCapabilityObservation).toHaveBeenCalledWith(ROUTE_ID, TOOLS_CAPABILITY, true);
  });

  it('does not blame the model when our sandbox is the thing that failed', async () => {
    mockGetE2BExecutor.mockResolvedValue(null);
    mockBuildToolLoopStream
      .mockResolvedValueOnce(executionToolCallStep(WELL_FORMED_ARGS))
      .mockResolvedValue(answerStep('Could not run it.'));

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(mockRecordCapabilityObservation).not.toHaveBeenCalledWith(
      ROUTE_ID,
      TOOLS_CAPABILITY,
      false,
    );
  });

  it('records a miss for a tool call whose arguments are not JSON', async () => {
    mockGetE2BExecutor.mockResolvedValue(null);
    mockBuildToolLoopStream
      .mockResolvedValueOnce(executionToolCallStep(MALFORMED_ARGS))
      .mockResolvedValue(answerStep('Done.'));

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(mockRecordCapabilityObservation).toHaveBeenCalledWith(ROUTE_ID, TOOLS_CAPABILITY, false);
  });

  it('records nothing when no tool was offered', async () => {
    mockBuildToolLoopStream.mockResolvedValue(answerStep('Plain answer.'));

    await drain(
      runToolLoop(makeProcessed({ withTools: false, required: false }), { approvalMode: 'auto' }),
    );

    expect(mockRecordCapabilityObservation).not.toHaveBeenCalled();
  });

  it('records nothing when a tool was offered, none required, and none called', async () => {
    mockBuildToolLoopStream.mockResolvedValue(answerStep('Plain answer.'));

    await drain(runToolLoop(makeProcessed({ required: false }), { approvalMode: 'auto' }));

    expect(mockRecordCapabilityObservation).not.toHaveBeenCalled();
  });

  it('records nothing for a turn the provider ended with an error', async () => {
    mockBuildToolLoopStream.mockRejectedValue(
      Object.assign(new Error('overloaded'), { status: 503 }),
    );

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(mockRecordCapabilityObservation).not.toHaveBeenCalled();
  });
});

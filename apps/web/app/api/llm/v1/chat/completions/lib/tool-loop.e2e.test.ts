import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import { listCanonicalModels, type ModelMetadata } from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

function requireCatalogModelId(predicate: (model: ModelMetadata) => boolean): string {
  const model = listCanonicalModels().find(predicate);
  if (!model) throw new Error('Canonical tool-loop billing fixture is missing');
  return model.id;
}

const FREE_QWEN_MODEL = requireCatalogModelId(
  (model) => model.provider === 'qwen' && model.capabilities.tools,
);
const FREE_OPENAI_MODEL = requireCatalogModelId(
  (model) => model.provider === 'openai' && model.tierPolicy?.minTier === 'free',
);
const PAID_OPENAI_MODEL = requireCatalogModelId(
  (model) => model.provider === 'openai' && model.tierPolicy?.minTier === 'pro',
);

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

const mockPersistGeneratedFileBytes = vi.fn();
vi.mock('@/lib/server/generated-file-persist', () => ({
  persistGeneratedFileBytes: (...args: unknown[]) => mockPersistGeneratedFileBytes(...args),
}));

const mockPersistGeneratedFiles = vi.fn();
vi.mock('@/lib/server/container-files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/container-files')>();
  return {
    ...actual,
    persistGeneratedFiles: (...args: unknown[]) => mockPersistGeneratedFiles(...args),
  };
});

const mockReserveManagedUsageProviderStep = vi.fn();
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>();
  return {
    ...actual,
    reserveManagedUsageProviderStep: (...args: unknown[]) =>
      mockReserveManagedUsageProviderStep(...args),
  };
});

import { runToolLoop, type ToolLoopProviderExecutor } from './tool-loop';
import type { ProcessedRequest } from './request-processor';
import type { E2BExecutor } from '@/lib/e2b/types';
import { e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';

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
    model: 'fixture-model',
  })}\n\n`;
}

function makeProcessed(conversationId?: string): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-1',
    chatRequest: { model: 'fixture-model', messages: [], stream: true } as never,
    conversationId,
    requestedModel: 'fixture-model',
    provider: 'openai',
    estimatedCostCents: 0,
    estimatedPromptTokens: 0,
    maxTokens: 1000,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'fixture-model',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as never,
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: undefined as never,
    llmRequest: {
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'run print(1+1)' }],
      max_tokens: 1000,
      stream: true,
      tools: e2bExecutionToolDefs(),
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
    mockPersistGeneratedFiles.mockReset();
    mockReserveManagedUsageProviderStep.mockReset();
    vi.stubEnv('AGI_E2B_EXECUTION', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('executes an execute_code tool call via the E2B interception point and re-invokes the model', async () => {
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
    processed.chatRequest.code_execution = true;
    processed.llmRequest.tool_choice = 'required';
    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));

    expect(runCode).toHaveBeenCalledWith({ language: 'python', code: 'print(1+1)' });
    expect(dispose).toHaveBeenCalled();

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    const secondCallRequest = mockBuildToolLoopStream.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
      tool_choice?: unknown;
    };
    const firstCallRequest = mockBuildToolLoopStream.mock.calls[0]?.[2] as {
      tool_choice?: unknown;
    };
    expect(firstCallRequest.tool_choice).toBe('required');
    expect(secondCallRequest.tool_choice).toBe('auto');
    const toolResultMessage = secondCallRequest.messages.find((m) => m.role === 'tool');
    expect(toolResultMessage?.content).toBe('2\n');
    expect(toolResultMessage?.tool_call_id).toBe('call_1');

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

  it('fail-closes a model-emitted execute_code when the cut-over flag is OFF (gate-bypass guard)', async () => {
    vi.stubEnv('AGI_E2B_EXECUTION', '');

    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'execute_code', arguments: '' } }],
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
    const step2 = sseStreamFrom([chunk({ content: 'ok' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);

    const runCode = vi.fn().mockResolvedValue({ ok: true, output: 'should-not-run' });
    mockGetE2BExecutor.mockResolvedValue({
      runCode,
      writeFile: vi.fn(),
      createFolder: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    } as E2BExecutor);

    await drain(runToolLoop(makeProcessed(), { approvalMode: 'auto' }));

    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
    expect(runCode).not.toHaveBeenCalled();
    const secondCallRequest = mockBuildToolLoopStream.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const toolResultMessage = secondCallRequest.messages.find((m) => m.role === 'tool');
    expect(toolResultMessage?.content).toContain('not available');
  });

  it('re-fits every Free provider turn against cumulative observed usage', async () => {
    const processed = makeProcessed();
    processed.provider = 'qwen';
    processed.chatRequest.model = FREE_QWEN_MODEL;
    processed.llmRequest.model = FREE_QWEN_MODEL;
    processed.llmRequest.max_tokens = 8_192;
    processed.maxTokens = 8_192;
    processed.freeTrial = {
      kind: 'free_trial',
      userId: 'free-user',
      requestId: 'free-loop',
      reservedMicrousd: 5_000,
    };

    const providerExecutor = vi.fn<ToolLoopProviderExecutor>(async (input) => {
      if (input.step === 1) {
        return {
          lines: [],
          finishReason: 'tool_calls',
          pendingToolCalls: [{ id: 'call_1', qualifiedName: 'execute_code', args: {} }],
          textContent: '',
          publicTextTail: '',
          generatedFileRefs: [],
          thinkingBlocks: [],
          canonicalText: '',
          usage: {
            providerCalls: 1,
            inputTokens: 10_000,
            outputTokens: 9_000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            cacheWrite1hTokens: 0,
            reasoningTokens: 0,
          },
        };
      }
      return {
        lines: [],
        finishReason: 'stop',
        pendingToolCalls: [],
        textContent: 'done',
        publicTextTail: '',
        generatedFileRefs: [],
        thinkingBlocks: [],
        canonicalText: 'done',
        usage: {
          providerCalls: 1,
          inputTokens: 100,
          outputTokens: 10,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cacheWrite1hTokens: 0,
          reasoningTokens: 0,
        },
      };
    });

    await drain(
      runToolLoop(processed, {
        approvalMode: 'auto',
        providerExecutor,
        toolExecutor: vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
      }),
    );

    expect(providerExecutor).toHaveBeenCalledTimes(2);
    const firstMax = providerExecutor.mock.calls[0]?.[0].request.max_tokens;
    const secondMax = providerExecutor.mock.calls[1]?.[0].request.max_tokens;
    expect(secondMax).toBeLessThan(firstMax ?? 0);
  });

  it('stops a Free tool loop before a provider turn that cannot fit', async () => {
    const processed = makeProcessed();
    processed.chatRequest.model = FREE_OPENAI_MODEL;
    processed.llmRequest.model = FREE_OPENAI_MODEL;
    processed.llmRequest.max_tokens = 8_192;
    processed.maxTokens = 8_192;
    processed.freeTrial = {
      kind: 'free_trial',
      userId: 'free-user',
      requestId: 'free-exhausted',
      reservedMicrousd: 5_000,
    };

    const providerExecutor = vi.fn<ToolLoopProviderExecutor>(async (input) => ({
      lines: [],
      finishReason: 'tool_calls',
      pendingToolCalls: [{ id: 'call_1', qualifiedName: 'execute_code', args: {} }],
      textContent: '',
      publicTextTail: '',
      generatedFileRefs: [],
      thinkingBlocks: [],
      canonicalText: '',
      usage: {
        providerCalls: 1,
        inputTokens: 100,
        outputTokens: input.request.max_tokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
        reasoningTokens: 0,
      },
    }));

    const output = await drain(
      runToolLoop(processed, {
        approvalMode: 'auto',
        providerExecutor,
        toolExecutor: vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
      }),
    );

    expect(providerExecutor).toHaveBeenCalledOnce();
    expect(output).toContain('free_trial_token_budget_reached');
    expect(output).not.toMatch(/microusd|reservedMicrousd|5000/i);
    expect(output).toContain('data: [DONE]');
  });

  it('reserves every paid provider operation before egress and extends later steps', async () => {
    const order: string[] = [];
    const processed = makeProcessed();
    processed.provider = 'openai';
    processed.chatRequest.model = PAID_OPENAI_MODEL;
    processed.llmRequest.model = PAID_OPENAI_MODEL;
    processed.subscriptionTier = 'pro';
    processed.managedUsage = {
      db: {} as never,
      userId: 'user-1',
      idempotencyKey: 'managed-paid-turn-1',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-paid-1',
      estimatedCostCents: 7,
    };
    mockReserveManagedUsageProviderStep.mockImplementation(async (input) => {
      const operationKey = input.operationKey as string;
      order.push(`reserve:${operationKey}`);
      const estimatedCostCents = operationKey === 'provider:1' ? 7 : 12;
      input.reservation.estimatedCostCents = estimatedCostCents;
      return {
        operationResult: operationKey === 'provider:1' ? 'covered' : 'extended',
        estimatedCostCents,
      };
    });
    const providerExecutor = vi.fn<ToolLoopProviderExecutor>(async ({ step }) => {
      order.push(`provider:${step}`);
      return {
        lines: [],
        finishReason: step === 1 ? 'tool_calls' : 'stop',
        pendingToolCalls:
          step === 1 ? [{ id: 'call_paid', qualifiedName: 'execute_code', args: {} }] : [],
        textContent: step === 1 ? '' : 'done',
        publicTextTail: '',
        generatedFileRefs: [],
        thinkingBlocks: [],
        canonicalText: step === 1 ? '' : 'done',
        usage: {
          providerCalls: 1,
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cacheWrite1hTokens: 0,
          reasoningTokens: 0,
        },
      };
    });

    await drain(
      runToolLoop(processed, {
        approvalMode: 'auto',
        providerExecutor,
        toolExecutor: vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
      }),
    );

    expect(order).toEqual(['reserve:provider:1', 'provider:1', 'reserve:provider:2', 'provider:2']);
    expect(processed.managedUsage.estimatedCostCents).toBe(12);
  });

  it('uses the stable global provider operation key on a durable continuation', async () => {
    const processed = makeProcessed();
    processed.subscriptionTier = 'pro';
    processed.managedUsage = {
      db: {} as never,
      userId: 'user-1',
      idempotencyKey: 'managed-paid-turn-2',
      requestHash: 'b'.repeat(64),
      leaseToken: 'lease-paid-2',
      estimatedCostCents: 7,
    };
    mockReserveManagedUsageProviderStep.mockResolvedValue({
      operationResult: 'covered',
      estimatedCostCents: 7,
    });

    await drain(
      runToolLoop(processed, {
        approvalMode: 'auto',
        initialCompletedSteps: 2,
        providerExecutor: vi.fn().mockResolvedValue({
          lines: [],
          finishReason: 'stop',
          pendingToolCalls: [],
          textContent: 'done',
          publicTextTail: '',
          generatedFileRefs: [],
          thinkingBlocks: [],
          canonicalText: 'done',
          usage: {
            providerCalls: 1,
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            cacheWrite1hTokens: 0,
            reasoningTokens: 0,
          },
        }),
      }),
    );

    expect(mockReserveManagedUsageProviderStep).toHaveBeenCalledWith(
      expect.objectContaining({ operationKey: 'provider:3' }),
    );
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
    expect(output).toContain('Code execution is unavailable');

    const secondCallRequest = mockBuildToolLoopStream.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const toolResultMessage = secondCallRequest.messages.find((m) => m.role === 'tool');
    expect(toolResultMessage?.content).toContain('Code execution is unavailable');
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

    expect(mockGetE2BExecutor).toHaveBeenCalledTimes(1);
    expect(mockGetE2BExecutor).toHaveBeenCalledWith({
      tenantId: 'managed-cloud',
      userId: 'user-123',
      conversationId: 'conv-123',
    });
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

    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
    expect(mockPauseE2BSession).not.toHaveBeenCalled();
  });

  it('streams durable, display-safe work phases for AGI Work without exposing reasoning', async () => {
    const step1 = sseStreamFrom([chunk({ content: 'Final answer.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1);

    const processed = makeProcessed('conv-work');
    processed.chatRequest.work_mode = 'agiwork';

    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));
    const progress = agentEvents(output)
      .map((entry) => entry.event)
      .filter((event) => event.type === 'progress-update');

    expect(progress).toEqual([
      {
        type: 'progress-update',
        progressId: 'provider-step:1',
        summary: 'Planning the work',
        status: 'running',
      },
      {
        type: 'progress-update',
        progressId: 'provider-step:1',
        summary: 'Prepared the response',
        status: 'completed',
      },
    ]);
    expect(JSON.stringify(progress)).not.toContain('run print(1+1)');
    expect(output).toContain('Final answer.');
  });

  it('adds a separate safe work phase after tool results in a multi-step AGI Work run', async () => {
    const toolStep = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: 'execute_code', arguments: '' } }],
      }),
      chunk({
        tool_calls: [
          {
            index: 0,
            function: { arguments: JSON.stringify({ language: 'python', code: '2+2' }) },
          },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]);
    const answerStep = sseStreamFrom([chunk({ content: 'Four.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(toolStep).mockResolvedValueOnce(answerStep);

    const processed = makeProcessed('conv-work');
    processed.chatRequest.work_mode = 'agiwork';
    const output = await drain(
      runToolLoop(processed, {
        approvalMode: 'auto',
        toolExecutor: vi.fn().mockResolvedValue({ content: '4', isError: false }),
      }),
    );

    expect(
      agentEvents(output)
        .map((entry) => entry.event)
        .filter((event) => event.type === 'progress-update'),
    ).toEqual([
      {
        type: 'progress-update',
        progressId: 'provider-step:1',
        summary: 'Planning the work',
        status: 'running',
      },
      {
        type: 'progress-update',
        progressId: 'provider-step:1',
        summary: 'Selected 1 next action',
        status: 'completed',
      },
      {
        type: 'progress-update',
        progressId: 'provider-step:2',
        summary: 'Reviewing results and choosing next steps',
        status: 'running',
      },
      {
        type: 'progress-update',
        progressId: 'provider-step:2',
        summary: 'Prepared the response',
        status: 'completed',
      },
    ]);
  });

  it('closes the visible AGI Work phase when a provider step fails', async () => {
    mockBuildToolLoopStream.mockRejectedValueOnce(new Error('provider unavailable'));
    const processed = makeProcessed('conv-work');
    processed.chatRequest.work_mode = 'agiwork';

    const output = await drain(runToolLoop(processed, { approvalMode: 'auto' }));
    const progress = agentEvents(output)
      .map((entry) => entry.event)
      .filter((event) => event.type === 'progress-update');

    expect(progress.at(-1)).toEqual({
      type: 'progress-update',
      progressId: 'provider-step:1',
      summary: 'Could not complete this step',
      status: 'failed',
    });
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

  it('checkpoints AGI Work at the invocation budget without failing or closing the workflow stream', async () => {
    const processed = makeProcessed();
    processed.chatRequest.work_mode = 'agiwork';
    const now = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(4 * 60_000);
    const onInvocationCheckpoint = vi.fn().mockResolvedValue(undefined);

    const output = await drain(
      runToolLoop(processed, {
        approvalMode: 'auto',
        now,
        onInvocationCheckpoint,
      }),
    );

    expect(mockBuildToolLoopStream).not.toHaveBeenCalled();
    expect(onInvocationCheckpoint).toHaveBeenCalledWith({
      sessionId: 'req-1',
      turnId: 'req-1',
      nextEventSequence: 3,
      completedSteps: 0,
      messages: [{ role: 'user', content: 'run print(1+1)' }],
    });
    expect(output).not.toContain('agent_time_budget_reached');
    expect(output).not.toContain('data: [DONE]');
    expect(agentEvents(output).map((entry) => entry.event.type)).toEqual([
      'task-state-changed',
      'task-state-changed',
      'lifecycle',
    ]);
  });

  function stepBudgetFixture(): { processed: ProcessedRequest; runCode: ReturnType<typeof vi.fn> } {
    const toolStep = sseStreamFrom([
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
    mockBuildToolLoopStream.mockResolvedValue(toolStep);
    const runCode = vi.fn().mockResolvedValue({ ok: true, output: '2\n' });
    mockGetE2BExecutor.mockResolvedValue({
      runCode,
      writeFile: vi.fn(),
      createFolder: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    } satisfies E2BExecutor);
    const processed = makeProcessed();
    processed.chatRequest.code_execution = true;
    return { processed, runCode };
  }

  it('checkpoints the run when the cumulative step budget is spent instead of killing it', async () => {
    const { processed, runCode } = stepBudgetFixture();
    const onStepBudgetCheckpoint = vi.fn().mockResolvedValue(undefined);

    const output = await drain(
      runToolLoop(processed, { approvalMode: 'auto', maxSteps: 1, onStepBudgetCheckpoint }),
    );

    expect(runCode).toHaveBeenCalledTimes(1);
    expect(onStepBudgetCheckpoint).toHaveBeenCalledTimes(1);
    const checkpoint = onStepBudgetCheckpoint.mock.calls[0]?.[0] as {
      sessionId: string;
      turnId: string;
      completedSteps: number;
      stepBudget: number;
      messages: Array<{ role: string; tool_call_id?: string }>;
      events: AgentEventEnvelope[];
    };
    expect(checkpoint.sessionId).toBe('req-1');
    expect(checkpoint.turnId).toBe('req-1');
    expect(checkpoint.completedSteps).toBe(1);
    expect(checkpoint.stepBudget).toBe(1);
    // The whole thread the run would otherwise have thrown away.
    expect(checkpoint.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
    ]);
    expect(checkpoint.messages[2]?.tool_call_id).toBe('call_1');
    expect(checkpoint.events.map((entry) => entry.event.type)).toEqual([
      'progress-update',
      'task-state-changed',
      'lifecycle',
    ]);

    // Paused, not failed: no error event and no terminal stop.
    expect(output).not.toContain('max_agent_steps_reached');
    const types = agentEvents(output).map((entry) => entry.event.type);
    expect(types).not.toContain('error');
    expect(types).not.toContain('stop');
    expect(types.slice(-3)).toEqual(['progress-update', 'task-state-changed', 'lifecycle']);
    const activity = agentEvents(output);
    expect(activity[activity.length - 2]?.event).toMatchObject({
      type: 'task-state-changed',
      previousState: 'running',
      state: 'awaiting_input',
    });
    expect(activity[activity.length - 1]?.event).toEqual({ type: 'lifecycle', phase: 'paused' });
    expect(output).toContain('Paused at the 1-step execution limit');
    expect(output).toContain('data: [DONE]');
  });

  it('refuses to pause again when a resume carried the spent steps without raising the budget', async () => {
    const { processed } = stepBudgetFixture();
    const onStepBudgetCheckpoint = vi.fn().mockResolvedValue(undefined);

    const output = await drain(
      runToolLoop(processed, {
        approvalMode: 'auto',
        maxSteps: 1,
        initialCompletedSteps: 1,
        onStepBudgetCheckpoint,
      }),
    );

    // A second checkpoint would hand the caller the same dead resume forever.
    expect(onStepBudgetCheckpoint).not.toHaveBeenCalled();
    expect(mockBuildToolLoopStream).not.toHaveBeenCalled();
    expect(output).toContain('max_agent_steps_reached');
    expect(output).toContain('"retryable":false');
    const activity = agentEvents(output);
    expect(activity[activity.length - 1]?.event).toEqual({ type: 'stop', reason: 'error' });
  });

  it('still fails terminally at the step limit when the caller cannot store a checkpoint', async () => {
    const { processed } = stepBudgetFixture();

    const output = await drain(runToolLoop(processed, { approvalMode: 'auto', maxSteps: 1 }));

    expect(output).toContain('max_agent_steps_reached');
    expect(output).toContain('Agent stopped after reaching the 1-step execution limit.');
    const activity = agentEvents(output);
    expect(activity[activity.length - 1]?.event).toEqual({ type: 'stop', reason: 'error' });
  });

  it('delegates provider and tool operations through replay-aware executors', async () => {
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
    const step2 = sseStreamFrom([chunk({ content: 'Cached answer.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);

    const providerExecutor = vi.fn<ToolLoopProviderExecutor>(async (input) => input.execute());
    const toolExecutor = vi.fn().mockResolvedValue({
      content: '2\n',
      isError: false,
    });

    const output = await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        providerExecutor,
        toolExecutor,
      }),
    );

    expect(providerExecutor).toHaveBeenCalledTimes(2);
    expect(providerExecutor.mock.calls.map((call) => call[0].operationKey)).toEqual([
      'provider:1',
      'provider:2',
    ]);
    expect(toolExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: 'tool:call_1',
        retrySafety: 'unsafe',
        toolCall: expect.objectContaining({ id: 'call_1', qualifiedName: 'execute_code' }),
      }),
    );
    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
    expect(output).toContain('Cached answer.');
  });

  it('propagates workflow control errors instead of converting them into a terminal chat error', async () => {
    const controlError = new Error('durable provider receipt is still leased');
    const providerExecutor = vi.fn().mockRejectedValue(controlError);

    await expect(
      drain(
        runToolLoop(makeProcessed(), {
          approvalMode: 'auto',
          providerExecutor,
          shouldPropagateExecutionError: (error) => error === controlError,
        }),
      ),
    ).rejects.toBe(controlError);
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

  it('persists provider-native file refs and emits a downloadable artifact before DONE', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([
        chunk({
          x_code_result: {
            content: [{ type: 'code_execution_output', file_id: 'file_provider' }],
          },
        }),
        chunk({}, 'stop'),
      ]),
    );
    mockPersistGeneratedFiles.mockResolvedValue({
      failedCount: 0,
      files: [
        {
          wire: {
            id: 'asset-provider',
            file_name: 'analysis.csv',
            mime_type: 'text/csv',
            uri: '/api/files/asset-provider',
            byte_count: 18,
            kind: 'document',
            checksum_sha256: 'd'.repeat(64),
          },
        },
      ],
    });

    const output = await drain(
      runToolLoop(makeProcessed(), { approvalMode: 'auto', userId: 'user-1' }),
    );

    expect(mockPersistGeneratedFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        refs: [{ provider: 'anthropic', fileId: 'file_provider' }],
      }),
    );
    expect(output).toContain('x_generated_files');
    expect(output).toContain('/api/files/asset-provider');
    expect(output.indexOf('x_generated_files')).toBeLessThan(output.lastIndexOf('data: [DONE]'));
    expect(agentEvents(output).some((entry) => entry.event.type === 'artifact-produced')).toBe(
      true,
    );
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

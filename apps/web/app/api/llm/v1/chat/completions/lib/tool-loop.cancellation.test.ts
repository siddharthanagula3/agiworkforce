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

const mockExecuteWebMcpTool = vi.fn();
vi.mock('@/lib/mcp-tool-executor', async () => {
  const actual = await vi.importActual<ImportedModule0>('@/lib/mcp-tool-executor');
  return {
    ...actual,
    executeWebMcpTool: (...args: unknown[]) => mockExecuteWebMcpTool(...args),
    getWebMcpCatalog: vi.fn(),
  };
});

import { CREATE_FOLDER_TOOL, e2bExecutionToolDefs } from '@/lib/e2b/execution-tools';
import { connectorToolPermissionsFromEntries } from './connector-tool-permissions';
import {
  runToolLoop,
  type ConnectorToolExecutor,
  type ToolLoopProviderExecution,
} from './tool-loop';
import {
  accumulateObservedProviderUsage,
  createObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import type { ProcessedRequest } from './request-processor';

const CONNECTOR_TOOL = 'mcp__github__get_pull_request_diff';

const connectorToolDef: WebMcpToolDef = {
  qualifiedName: CONNECTOR_TOOL,
  serverId: 'github',
  toolName: 'get_pull_request_diff',
  description: 'diff',
  origin: 'connector',
  inputSchema: { type: 'object' },
};

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
    requestId: 'req-1',
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
      messages: [{ role: 'user', content: 'summarize PR 7 in acme/app' }],
      max_tokens: 1000,
      stream: true,
    },
  };
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

describe('runToolLoop, cancellation reaches connector tools', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebMcpTool.mockReset();
  });

  it('retains an estimated failed-attempt receipt after a completed provider step', async () => {
    const controller = new AbortController();
    const usage = createObservedProviderUsage();
    const receipts: unknown[] = [];
    mockBuildToolLoopStream.mockImplementationOnce(async (...args: unknown[]) => {
      const sink = args[4] as { usage: typeof usage };
      accumulateObservedProviderUsage(sink.usage, { inputTokens: 10, outputTokens: 20 });
      return sseStreamFrom([
        chunk({
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              function: {
                name: CONNECTOR_TOOL,
                arguments: JSON.stringify({ owner: 'acme', repo: 'app', pull_number: 7 }),
              },
            },
          ],
        }),
        chunk({}, 'tool_calls'),
      ]);
    });
    mockBuildToolLoopStream.mockImplementationOnce(async (...args: unknown[]) => {
      const sink = args[4] as { text: string };
      sink.text = 'Partial answer with enough text to account for the interrupted response.';
      controller.abort();
      throw controller.signal.reason;
    });
    const providerExecutor = async (input: ToolLoopProviderExecution) => {
      try {
        return await input.execute();
      } catch (error) {
        receipts.push(input.failureUsage());
        throw error;
      }
    };
    const output = await drain(
      runToolLoop(makeProcessed(), {
        signal: controller.signal,
        usage,
        providerExecutor,
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [connectorToolDef],
        connectorExecutor: async () => ({
          handled: true,
          content: 'diff context '.repeat(1000),
          isError: false,
        }),
      }),
    );
    expect(output).toContain('"state":"cancelled"');
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(receipts).toEqual([
      expect.objectContaining({
        providerCalls: 1,
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        providerCallObservations: [expect.objectContaining({ tokenSource: 'estimated' })],
      }),
    ]);
    const receipt = receipts[0] as typeof usage;
    expect(receipt.inputTokens).toBeGreaterThan(1000);
    expect(receipt.outputTokens).toBeGreaterThan(0);
    expect(usage.providerCalls).toBe(2);
    expect(usage.inputTokens).toBe(10 + receipt.inputTokens);
    expect(usage.outputTokens).toBe(20 + receipt.outputTokens);
    expect(JSON.stringify(receipt)).not.toContain('Partial answer');
    expect(JSON.stringify(receipt)).not.toContain('diff context');
  });

  it('keeps provider-reported failed usage without adding a text estimate', async () => {
    const controller = new AbortController();
    const usage = createObservedProviderUsage();
    mockBuildToolLoopStream.mockImplementationOnce(async (...args: unknown[]) => {
      const sink = args[4] as { usage: typeof usage; text: string };
      sink.text = 'partial answer '.repeat(100);
      accumulateObservedProviderUsage(sink.usage, { inputTokens: 13, outputTokens: 17 });
      controller.abort();
      throw controller.signal.reason;
    });
    await drain(runToolLoop(makeProcessed(), { signal: controller.signal, usage }));
    expect(usage).toMatchObject({ providerCalls: 1, inputTokens: 13, outputTokens: 17 });
  });

  it('discards buffered output after Stop while preserving completed provider usage', async () => {
    const controller = new AbortController();
    const usage = createObservedProviderUsage();
    mockBuildToolLoopStream.mockImplementationOnce(async (...args: unknown[]) => {
      const sink = args[4] as { usage: ReturnType<typeof createObservedProviderUsage> };
      accumulateObservedProviderUsage(
        sink.usage,
        { inputTokens: 10, outputTokens: 20 },
        {
          provider: makeProcessed().provider,
          model: makeProcessed().requestedModel,
        },
      );
      return sseStreamFrom([
        chunk({ content: 'FIRST_VISIBLE' }),
        chunk({ content: 'BUFFERED_MUST_NOT_DISPLAY' }),
        chunk({ content: 'ALSO_BUFFERED' }),
        chunk({}, 'stop'),
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n\n',
      ]);
    });
    const generator = runToolLoop(makeProcessed(), { signal: controller.signal, usage });
    let prefix = '';
    for (;;) {
      const next = await generator.next();
      if (next.done) throw new Error('Provider ended before the stop control point');
      prefix += new TextDecoder().decode(next.value);
      if (prefix.includes('FIRST_VISIBLE')) break;
    }
    controller.abort();
    const tail = await drain(generator);
    expect(tail).not.toContain('BUFFERED_MUST_NOT_DISPLAY');
    expect(tail).not.toContain('ALSO_BUFFERED');
    expect(tail).toContain('"state":"cancelled"');
    expect(tail).not.toContain('x_stream_error');
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(20);
    expect(usage.providerCalls).toBe(1);
    expect(mockBuildToolLoopStream).toHaveBeenCalledOnce();
  });

  it('emits cancellation rather than a provider failure when Stop aborts an active call', async () => {
    const controller = new AbortController();
    const usage = createObservedProviderUsage();
    mockBuildToolLoopStream.mockImplementationOnce(async () => {
      controller.abort();
      throw controller.signal.reason;
    });
    const output = await drain(runToolLoop(makeProcessed(), { signal: controller.signal, usage }));
    expect(mockBuildToolLoopStream).toHaveBeenCalledOnce();
    expect(output).toContain('"state":"cancelled"');
    expect(output).toContain('"reason":"cancelled"');
    expect(output).not.toContain('x_stream_error');
    expect(output).not.toContain('"type":"error"');
    expect(usage.providerCalls).toBe(0);
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
  });

  it("hands the turn's abort signal to the connector executor", async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([
        chunk({
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              function: {
                name: CONNECTOR_TOOL,
                arguments: JSON.stringify({ owner: 'acme', repo: 'app', pull_number: 7 }),
              },
            },
          ],
        }),
        chunk({}, 'tool_calls'),
      ]),
    );
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'done' }), chunk({}, 'stop')]),
    );

    const controller = new AbortController();
    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'diff',
      isError: false,
    }));

    await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [connectorToolDef],
        connectorExecutor,
        signal: controller.signal,
      }),
    );

    expect(connectorExecutor).toHaveBeenCalledWith(
      'github',
      'get_pull_request_diff',
      { owner: 'acme', repo: 'app', pull_number: 7 },
      { signal: expect.any(AbortSignal), allowInputRequired: true },
    );
    const handedSignal = vi.mocked(connectorExecutor).mock.calls[0]?.[3]?.signal;
    expect(handedSignal?.aborted).toBe(false);
    controller.abort();
    expect(handedSignal?.aborted).toBe(true);
  });

  it('checks for a stop again before each write in a batch', async () => {
    const writeTool: WebMcpToolDef = {
      qualifiedName: 'mcp__notes__create_note',
      serverId: 'notes',
      toolName: 'create_note',
      description: 'create a note',
      origin: 'connector',
      inputSchema: { type: 'object' },
    };
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([
        chunk({
          tool_calls: [
            {
              index: 0,
              id: 'call_note',
              function: { name: writeTool.qualifiedName, arguments: JSON.stringify({}) },
            },
            {
              index: 1,
              id: 'call_folder',
              function: { name: CREATE_FOLDER_TOOL, arguments: JSON.stringify({ path: 'notes' }) },
            },
          ],
        }),
        chunk({}, 'tool_calls'),
      ]),
    );
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'done' }), chunk({}, 'stop')]),
    );

    let stopRequested = false;
    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => {
      stopRequested = true;
      return { handled: true, content: 'saved', isError: false };
    });
    const processed = makeProcessed();
    processed.llmRequest.tools = e2bExecutionToolDefs();

    const output = await drain(
      runToolLoop(processed, {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: [writeTool],
        connectorExecutor,
        toolApprovalPolicy: 'autonomous',
        connectorPermissions: connectorToolPermissionsFromEntries([
          { connectorId: 'notes', toolName: 'create_note', level: 'allow' },
        ]),
        isCancellationRequested: async () => stopRequested,
      }),
    );

    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
    expect(output).toContain(
      `Tool \\"${CREATE_FOLDER_TOOL}\\" was not run: the user stopped this run before it started.`,
    );
  });

  it('ends a turn stopped mid-answer as cancelled, not as an interrupted failure', async () => {
    const controller = new AbortController();

    const output = await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        signal: controller.signal,
        isCancellationRequested: async () => controller.signal.aborted,
        providerExecutor: async () => {
          controller.abort();
          throw new Error('Request was aborted.');
        },
      }),
    );

    expect(output).toContain('"state":"cancelled"');
    expect(output).not.toContain('x_stream_error');
    expect(output).not.toContain('"state":"failed"');
  });
});

type ImportedModule0 = typeof import('@/lib/mcp-tool-executor');

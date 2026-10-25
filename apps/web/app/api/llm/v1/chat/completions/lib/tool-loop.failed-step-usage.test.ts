/**
 * A stopped turn is charged for what the provider measured before the stop.
 * The provider step threw on the abort and its operation recorded no usage,
 * so the turn settled at nothing although the provider had billed the input.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolLoopStepSink } from './tool-loop-anthropic';
import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';

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
  const actual =
    await vi.importActual<typeof import('@/lib/mcp-tool-executor')>('@/lib/mcp-tool-executor');
  return {
    ...actual,
    executeWebMcpTool: (...args: unknown[]) => mockExecuteWebMcpTool(...args),
    getWebMcpCatalog: vi.fn(),
  };
});

import { runToolLoop, usageOfFailedProviderStep } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

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

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<void> {
  for await (const _value of gen) void _value;
}

function stoppedStream(sink: ToolLoopStepSink, inputTokens: number): ReadableStream {
  let settle!: () => void;
  sink.settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(chunk({ content: 'Half an ans' })));
      controller.error(Object.assign(new Error('Request was aborted.'), { name: 'AbortError' }));
      setTimeout(() => {
        if (sink.usage) {
          sink.usage.providerCalls += 1;
          sink.usage.inputTokens += inputTokens;
        }
        settle();
      }, 20);
    },
  });
}

describe('runToolLoop, a provider step that stops part way', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebMcpTool.mockReset();
  });

  it('hands the usage the provider measured before the stop to its operation', async () => {
    mockBuildToolLoopStream.mockImplementation(
      async (_provider: unknown, _processed: unknown, _request: unknown, _model: unknown, sink) =>
        stoppedStream(sink as ToolLoopStepSink, 7773),
    );
    let spent: ReturnType<typeof usageOfFailedProviderStep> = null;

    await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        shouldPropagateExecutionError: () => true,
        providerExecutor: async ({ execute }) => {
          try {
            return await execute();
          } catch (error) {
            spent = usageOfFailedProviderStep(error);
            throw error;
          }
        },
      }),
    ).catch(() => undefined);

    expect(spent).toMatchObject({ providerCalls: 1, inputTokens: 7773 });
  });

  it('hands over nothing when the provider measured nothing before the stop', async () => {
    mockBuildToolLoopStream.mockImplementation(
      async (_provider: unknown, _processed: unknown, _request: unknown, _model: unknown, sink) =>
        stoppedStream(sink as ToolLoopStepSink, 0),
    );
    const seen: unknown[] = [];

    await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        shouldPropagateExecutionError: () => true,
        providerExecutor: async ({ execute }) => {
          try {
            return await execute();
          } catch (error) {
            seen.push(error);
            throw error;
          }
        },
      }),
    ).catch(() => undefined);

    expect(seen.length).toBeGreaterThan(0);
    for (const error of seen) {
      const usage = usageOfFailedProviderStep(error);
      expect(usage === null || usage.inputTokens === 0).toBe(true);
    }
  });

  it('counts what a stopped step measured in the turn usage when the loop runs inline', async () => {
    mockBuildToolLoopStream.mockImplementation(
      async (_provider: unknown, _processed: unknown, _request: unknown, _model: unknown, sink) =>
        stoppedStream(sink as ToolLoopStepSink, 7773),
    );
    const usage = createObservedProviderUsage();

    await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        usage,
        shouldPropagateExecutionError: () => true,
      }),
    ).catch(() => undefined);

    expect(usage).toMatchObject({ providerCalls: 1, inputTokens: 7773 });
  });
});

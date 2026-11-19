import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolLoopStepSink } from './tool-loop-anthropic';
import {
  createObservedProviderUsage,
  type ObservedProviderUsage,
} from '@/lib/services/managed-usage-accounting-service';

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

import { runToolLoop } from './tool-loop';
import type { ProcessedRequest } from './request-processor';

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
  return new ReadableStream({
    start(controller) {
      controller.error(Object.assign(new Error('Request was aborted.'), { name: 'AbortError' }));
      setTimeout(() => {
        if (sink.usage) {
          sink.usage.providerCalls += 1;
          sink.usage.inputTokens += inputTokens;
        }
      }, 20);
    },
  });
}

function afterLateUsage(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}

describe('runToolLoop, a provider step that stops before any output', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebMcpTool.mockReset();
  });

  it('hands its operation no usage to charge, even when the stream measures some after the stop', async () => {
    mockBuildToolLoopStream.mockImplementation(
      async (_provider: unknown, _processed: unknown, _request: unknown, _model: unknown, sink) =>
        stoppedStream(sink as ToolLoopStepSink, 7773),
    );
    const seen: (ObservedProviderUsage | null)[] = [];

    await drain(
      runToolLoop(makeProcessed(), {
        approvalMode: 'auto',
        userId: 'user-1',
        shouldPropagateExecutionError: () => true,
        providerExecutor: async ({ execute, failureUsage }) => {
          try {
            return await execute();
          } catch (error) {
            seen.push(failureUsage());
            throw error;
          }
        },
      }),
    ).catch(() => undefined);
    await afterLateUsage();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((usage) => usage === null)).toBe(true);
  });

  it('adds nothing to the turn usage when the loop runs inline', async () => {
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
    await afterLateUsage();

    expect(usage).toMatchObject({ providerCalls: 0, inputTokens: 0 });
  });
});

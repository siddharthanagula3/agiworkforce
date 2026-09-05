import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { runToolLoop, type ConnectorToolExecutor } from './tool-loop';
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
    // The executor options are asserted exactly, so pin the `input_required`
    // kill-switch to its default-off state instead of inheriting the ambient env.
    vi.stubEnv('AGI_MCP_INPUT_PAUSE', '');
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebMcpTool.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
      { signal: controller.signal },
    );
  });
});

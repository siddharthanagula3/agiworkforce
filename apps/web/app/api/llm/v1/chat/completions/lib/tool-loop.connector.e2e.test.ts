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
  const actual =
    await vi.importActual<typeof import('@/lib/mcp-tool-executor')>('@/lib/mcp-tool-executor');
  return {
    ...actual,
    executeWebMcpTool: (...args: unknown[]) => mockExecuteWebMcpTool(...args),
    getWebMcpCatalog: vi.fn(),
  };
});

import { runToolLoop, type ConnectorToolExecutor } from './tool-loop';
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

describe('runToolLoop end-to-end, user connector tool execution', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebMcpTool.mockReset();
  });

  it('routes a connector tool_call through the bound connector executor and re-invokes the model', async () => {
    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            function: { name: 'mcp__github__get_pull_request_diff', arguments: '' },
          },
        ],
      }),
      chunk({
        tool_calls: [
          {
            index: 0,
            function: {
              arguments: JSON.stringify({ owner: 'acme', repo: 'app', pull_number: 7 }),
            },
          },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]);
    const step2 = sseStreamFrom([
      chunk({ content: 'The PR renames a function.' }),
      chunk({}, 'stop'),
    ]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async (serverId, toolName, args) => {
      expect(serverId).toBe('github');
      expect(toolName).toBe('get_pull_request_diff');
      expect(args).toEqual({ owner: 'acme', repo: 'app', pull_number: 7 });
      return { handled: true, content: 'diff --git a/x b/x\n-old\n+new', isError: false };
    });

    const output = await drain(
      runToolLoop(makeProcessed(), { approvalMode: 'auto', userId: 'user-1', connectorExecutor }),
    );

    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(mockExecuteWebMcpTool).not.toHaveBeenCalled();

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    const secondCallRequest = mockBuildToolLoopStream.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    };
    const toolResultMessage = secondCallRequest.messages.find((m) => m.role === 'tool');
    expect(toolResultMessage?.content).toContain('diff --git');
    expect(toolResultMessage?.tool_call_id).toBe('call_1');

    expect(output).toContain('"name":"mcp__github__get_pull_request_diff"');
    expect(output).toContain('"status":"completed"');
    expect(output).toContain('The PR renames a function.');
    expect(output).toContain('data: [DONE]');
  });

  it('surfaces a connector execution error as a tool-result error, not a crash', async () => {
    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            function: { name: 'mcp__github__post_issue_comment', arguments: '' },
          },
        ],
      }),
      chunk({
        tool_calls: [
          {
            index: 0,
            function: {
              arguments: JSON.stringify({
                owner: 'acme',
                repo: 'app',
                issue_number: 7,
                body: 'hi',
              }),
            },
          },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]);
    const step2 = sseStreamFrom([chunk({ content: 'I could not post.' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'GitHub tool error: Failed to post comment: 403',
      isError: true,
    }));

    const output = await drain(
      runToolLoop(makeProcessed(), { approvalMode: 'auto', userId: 'user-1', connectorExecutor }),
    );

    expect(output).toContain('"status":"failed"');
    const secondCallRequest = mockBuildToolLoopStream.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const toolResultMessage = secondCallRequest.messages.find((m) => m.role === 'tool');
    expect(toolResultMessage?.content).toContain('403');
  });

  it('falls through to the operator MCP dispatcher when the executor does not own the tool', async () => {
    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            function: { name: 'mcp__operator__do_thing', arguments: '' },
          },
        ],
      }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
      chunk({}, 'tool_calls'),
    ]);
    const step2 = sseStreamFrom([chunk({ content: 'done' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);
    mockExecuteWebMcpTool.mockResolvedValue({
      isError: false,
      content: [{ type: 'text', text: 'operator result' }],
    });

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: false,
      content: '',
      isError: false,
    }));

    await drain(
      runToolLoop(makeProcessed(), { approvalMode: 'auto', userId: 'user-1', connectorExecutor }),
    );

    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(mockExecuteWebMcpTool).toHaveBeenCalledWith('operator', 'do_thing', {});
  });
});

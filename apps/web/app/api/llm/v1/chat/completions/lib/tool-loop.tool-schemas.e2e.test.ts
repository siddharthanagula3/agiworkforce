import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
vi.mock('./tool-loop-anthropic', () => ({
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
}));

vi.mock('@/lib/mcp-tool-executor', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/mcp-tool-executor')>('@/lib/mcp-tool-executor');
  return { ...actual, executeWebMcpTool: vi.fn(), getWebMcpCatalog: vi.fn() };
});

import { runToolLoop, type ConnectorToolExecutor } from './tool-loop';
import { TOOL_DIRECTORY_TOOL_NAME } from './tool-schema-loader';
import type { ProcessedRequest } from './request-processor';

const PULL_REQUEST_TOOL = 'mcp__github__get_pull_request_diff';
const SLACK_TOOL = 'mcp__slack__post_channel_message';
const JIRA_TOOL = 'mcp__jira__create_issue';

function connectorToolDefs() {
  return [
    {
      qualifiedName: PULL_REQUEST_TOOL,
      serverId: 'github',
      toolName: 'get_pull_request_diff',
      description: 'Read the diff of a pull request.',
      origin: 'connector' as const,
      inputSchema: {},
    },
    {
      qualifiedName: SLACK_TOOL,
      serverId: 'slack',
      toolName: 'post_channel_message',
      description: 'Post a message into a channel.',
      origin: 'connector' as const,
      inputSchema: {},
    },
    {
      qualifiedName: JIRA_TOOL,
      serverId: 'jira',
      toolName: 'create_issue',
      description: 'File a ticket on a board.',
      origin: 'connector' as const,
      inputSchema: {},
    },
  ];
}

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

function toolCallStream(id: string, name: string, args: unknown): ReadableStream {
  return sseStreamFrom([
    chunk({ tool_calls: [{ index: 0, id, function: { name, arguments: '' } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] }),
    chunk({}, 'tool_calls'),
  ]);
}

function makeProcessed(turnText: string): ProcessedRequest {
  const messages = [{ role: 'user' as const, content: turnText }];
  return {
    chatSurface: 'web' as const,
    requestId: 'req-schemas-1',
    chatRequest: { model: 'gpt-test', messages, stream: true } as never,
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
    llmRequest: { model: 'gpt-test', messages, max_tokens: 1000, stream: true },
  } as ProcessedRequest;
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

function offeredNames(call: number): string[] {
  const request = mockBuildToolLoopStream.mock.calls[call]?.[2] as
    { tools?: Array<{ function?: { name?: string } }> } | undefined;
  return (request?.tools ?? []).map((tool) => tool.function?.name ?? '');
}

beforeEach(() => {
  mockBuildToolLoopStream.mockReset();
});

describe('connector tool schemas are loaded against a budget, not sent whole', () => {
  it('offers every schema when nothing in the turn prefers one', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'Nothing to do.' }), chunk({}, 'stop')]),
    );

    await drain(
      runToolLoop(makeProcessed('hello'), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: connectorToolDefs(),
      }),
    );

    const names = offeredNames(0);
    expect(names).toContain(PULL_REQUEST_TOOL);
    expect(names).toContain(SLACK_TOOL);
    expect(names).toContain(JIRA_TOOL);
    expect(names).not.toContain(TOOL_DIRECTORY_TOOL_NAME);
  });

  it('defers the schemas the turn does not reach for, and names them rather than hiding them', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(
      sseStreamFrom([chunk({ content: 'Reading it now.' }), chunk({}, 'stop')]),
    );

    await drain(
      runToolLoop(makeProcessed('read the pull request diff for me'), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: connectorToolDefs(),
      }),
    );

    const names = offeredNames(0);
    expect(names).toContain(PULL_REQUEST_TOOL);
    expect(names).not.toContain(SLACK_TOOL);
    expect(names).not.toContain(JIRA_TOOL);
    expect(names).toContain(TOOL_DIRECTORY_TOOL_NAME);

    const directory = (
      mockBuildToolLoopStream.mock.calls[0]?.[2] as {
        tools: Array<{ function: { name: string; description: string } }>;
      }
    ).tools.find((tool) => tool.function.name === TOOL_DIRECTORY_TOOL_NAME);
    expect(directory?.function.description).toContain(SLACK_TOOL);
    expect(directory?.function.description).toContain(JIRA_TOOL);
  });

  it('carries a deferred schema on the next step once the model asks for it', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        toolCallStream('call_1', TOOL_DIRECTORY_TOOL_NAME, { names: [SLACK_TOOL] }),
      )
      .mockResolvedValueOnce(
        sseStreamFrom([chunk({ content: 'Posted the summary.' }), chunk({}, 'stop')]),
      );

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'never reached',
      isError: false,
    }));

    const output = await drain(
      runToolLoop(makeProcessed('read the pull request diff for me'), {
        approvalMode: 'auto',
        userId: 'user-1',
        connectorExecutor,
        mcpTools: connectorToolDefs(),
      }),
    );

    // The directory call is answered here, never routed to a connector.
    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);

    const second = offeredNames(1);
    expect(second).toContain(SLACK_TOOL);
    expect(second).toContain(PULL_REQUEST_TOOL);
    expect(second).not.toContain(JIRA_TOOL);
    // Jira is still deferred, so the directory stays on offer.
    expect(second).toContain(TOOL_DIRECTORY_TOOL_NAME);
    expect(output).toContain('Posted the summary.');
  });

  it('refuses a name no connected tool carries instead of silently loading nothing', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        toolCallStream('call_1', TOOL_DIRECTORY_TOOL_NAME, { names: ['mcp__nope__nothing'] }),
      )
      .mockResolvedValueOnce(sseStreamFrom([chunk({ content: 'Sorry.' }), chunk({}, 'stop')]));

    await drain(
      runToolLoop(makeProcessed('read the pull request diff for me'), {
        approvalMode: 'auto',
        userId: 'user-1',
        mcpTools: connectorToolDefs(),
      }),
    );

    const second = mockBuildToolLoopStream.mock.calls[1]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    const result = second.messages.find((message) => message.role === 'tool');
    expect(result?.content).toContain('No connected tool matched those names');
    expect(offeredNames(1)).not.toContain(SLACK_TOOL);
  });
});

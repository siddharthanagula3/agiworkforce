import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBuildToolLoopStream = vi.fn();
type ToolLoopAnthropicModule = typeof import('./tool-loop-anthropic');
type RuntimeModule = typeof import('@/lib/e2b/runtime');

vi.mock('./tool-loop-anthropic', async (importOriginal) => ({
  ...(await importOriginal<ToolLoopAnthropicModule>()),
  buildToolLoopStream: (...args: unknown[]) => mockBuildToolLoopStream(...args),
  buildServingRouteId: (...args: unknown[]) => args.join(':'),
}));

vi.mock('@/lib/e2b/runtime', async (importOriginal) => ({
  ...(await importOriginal<RuntimeModule>()),
  getE2BExecutor: vi.fn(),
  pauseE2BSession: vi.fn(),
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

const mockRecordCapabilityObservation = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/services/free-lane/capability-health-service', async () => {
  const actual = await vi.importActual<ImportedModule1>(
    '@/lib/services/free-lane/capability-health-service',
  );
  return {
    ...actual,
    recordCapabilityObservation: (...args: unknown[]) => mockRecordCapabilityObservation(...args),
  };
});

import {
  runToolLoop,
  trimToolResultHistoryKeepingReferences,
  type ConnectorToolExecutor,
} from './tool-loop';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  createMapSearchToolDefinition,
  executeMapSearchTool,
  MAP_SEARCH_TOOL_NAME,
} from '@/lib/services/map-search-tool-service';
import type { ProcessedRequest } from './request-processor';

const MAP_TOOL = 'mcp__maps__search_places';
const OTHER_TOOL = 'mcp__maps__get_directions';

function connectorTool(qualifiedName: string, toolName: string): WebMcpToolDef {
  return {
    qualifiedName,
    serverId: 'maps',
    toolName,
    description: toolName,
    origin: 'connector',
    inputSchema: { type: 'object' },
  };
}

const MCP_TOOLS = [
  connectorTool(MAP_TOOL, 'search_places'),
  connectorTool(OTHER_TOOL, 'get_directions'),
];

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

function toolCallStep(id: string, name: string): ReadableStream {
  return sseStreamFrom([
    chunk({
      tool_calls: [
        {
          index: 0,
          id,
          function: { name, arguments: JSON.stringify({ query: 'coffee near Union Square' }) },
        },
      ],
    }),
    chunk({}, 'tool_calls'),
  ]);
}

function answerStep(text: string): ReadableStream {
  return sseStreamFrom([chunk({ content: text }), chunk({}, 'stop')]);
}

function assistantCall(id: string, name: string) {
  return {
    role: 'assistant' as const,
    content: '',
    tool_calls: [
      {
        id,
        type: 'function',
        function: { name, arguments: JSON.stringify({ query: 'coffee near Union Square' }) },
      },
    ],
  };
}

function processedWith(messages: ProcessedRequest['llmRequest']['messages']): ProcessedRequest {
  return {
    chatSurface: 'mobile' as const,
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
    llmRequest: { model: 'gpt-test', messages, max_tokens: 1000, stream: true },
  };
}

const USER_PROMPT = { role: 'user' as const, content: 'coffee shops near Union Square' };

const FORCED_MAP_CHOICE = { type: 'function' as const, function: { name: MAP_SEARCH_TOOL_NAME } };

function processedForcingMapSearch(
  messages: ProcessedRequest['llmRequest']['messages'],
): ProcessedRequest {
  const processed = processedWith(messages);
  return {
    ...processed,
    chatRequest: { ...processed.chatRequest, tool_choice: FORCED_MAP_CHOICE } as never,
    llmRequest: {
      ...processed.llmRequest,
      tools: [createMapSearchToolDefinition()],
      tool_choice: FORCED_MAP_CHOICE,
    },
  };
}

function stepToolChoice(callIndex: number): unknown {
  return (mockBuildToolLoopStream.mock.calls[callIndex]?.[2] as { tool_choice?: unknown })
    .tool_choice;
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
  return out;
}

function offeredToolNames(callIndex: number): string[] {
  const request = mockBuildToolLoopStream.mock.calls[callIndex]?.[2] as
    { tools?: Array<{ function?: { name?: string } }> } | undefined;
  return (request?.tools ?? []).map((tool) => tool.function?.name ?? '');
}

function stepMessages(callIndex: number) {
  return (
    mockBuildToolLoopStream.mock.calls[callIndex]?.[2] as {
      messages: Array<{ role: string; content: unknown; tool_call_id?: string }>;
    }
  ).messages;
}

const DECLINED_ACTION_ANSWER = 'You declined the action, so I did not run it.';

function emptyStep(): ReadableStream {
  return sseStreamFrom([chunk({}, 'stop')]);
}

function wireDeltas(output: string): Array<Record<string, unknown>> {
  return output
    .split('\n')
    .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map((line) => JSON.parse(line.slice('data: '.length)) as Record<string, unknown>)
    .map(
      (payload) =>
        ((payload['choices'] as Array<{ delta?: Record<string, unknown> }> | undefined)?.[0]
          ?.delta ?? {}) as Record<string, unknown>,
    );
}

function agentEventsOf(output: string): Array<Record<string, unknown>> {
  return wireDeltas(output)
    .map(
      (delta) => (delta['x_agent_event'] as { event?: Record<string, unknown> } | undefined)?.event,
    )
    .filter((event): event is Record<string, unknown> => event !== undefined);
}

function streamErrorCodeOf(output: string): string | undefined {
  return (
    wireDeltas(output).find((delta) => delta['x_stream_error'] !== undefined)?.[
      'x_stream_error'
    ] as { code?: string } | undefined
  )?.code;
}

const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
  handled: true,
  content: 'Union Square Coffee, 1 Main St',
  isError: false,
}));

describe('runToolLoop, a tool the person declined', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockExecuteWebMcpTool.mockReset();
    mockRecordCapabilityObservation.mockClear();
    vi.mocked(connectorExecutor).mockClear();
  });

  it('is not offered on the next step, which answers and ends the turn', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('I will answer without map results.'));

    const output = await drain(
      runToolLoop(processedWith([USER_PROMPT, assistantCall('call_1', MAP_TOOL)]), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: MCP_TOOLS,
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'rejected' }] },
      }),
    );

    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(offeredToolNames(0)).not.toContain(MAP_TOOL);
    expect(offeredToolNames(0)).toContain(OTHER_TOOL);
    const denial = stepMessages(0).find((message) => message.tool_call_id === 'call_1');
    expect(denial?.content).toContain('denied permission');
    expect(denial?.content).toContain('do not ask for it again');
    expect(output).toContain('I will answer without map results.');
    expect(output).not.toContain('x_tool_approval_request');
    expect(output).toContain('data: [DONE]');
  });

  it('refuses a repeat request for it without asking for approval again', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(toolCallStep('call_2', MAP_TOOL))
      .mockResolvedValueOnce(answerStep('Here is what I know without the map.'));
    const onApprovalCheckpoint = vi.fn(async () => undefined);

    const output = await drain(
      runToolLoop(processedWith([USER_PROMPT, assistantCall('call_1', MAP_TOOL)]), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: MCP_TOOLS,
        connectorExecutor,
        onApprovalCheckpoint,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'rejected' }] },
      }),
    );

    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(onApprovalCheckpoint).not.toHaveBeenCalled();
    expect(output).not.toContain('x_tool_approval_request');
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(2);
    expect(offeredToolNames(1)).not.toContain(MAP_TOOL);
    const refusal = stepMessages(1).find((message) => message.tool_call_id === 'call_2');
    expect(refusal?.content).toContain('was not run');
    expect(output).toContain('Here is what I know without the map.');
    expect(output).toContain('data: [DONE]');
  });

  it('stays closed when a later approval in the same turn resumes the run', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Directions are below.'));
    const first = drain(
      runToolLoop(processedWith([USER_PROMPT, assistantCall('call_1', MAP_TOOL)]), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: MCP_TOOLS,
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'rejected' }] },
      }),
    );
    await first;
    const declinedResult = stepMessages(0).find((message) => message.tool_call_id === 'call_1');
    mockBuildToolLoopStream.mockReset();
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Directions are below.'));

    await drain(
      runToolLoop(
        processedWith([
          USER_PROMPT,
          assistantCall('call_1', MAP_TOOL),
          { role: 'tool', content: declinedResult?.content as string, tool_call_id: 'call_1' },
          assistantCall('call_3', OTHER_TOOL),
        ]),
        {
          approvalMode: 'manual',
          userId: 'user-1',
          mcpTools: MCP_TOOLS,
          connectorExecutor,
          resume: { approvals: [{ toolCallId: 'call_3', decision: 'approved' }] },
        },
      ),
    );

    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(offeredToolNames(0)).not.toContain(MAP_TOOL);
    expect(offeredToolNames(0)).toContain(OTHER_TOOL);
  });

  it('releases a forced choice of the declined tool so the next step can answer', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('I will answer without the map.'));

    const output = await drain(
      runToolLoop(
        processedForcingMapSearch([USER_PROMPT, assistantCall('call_1', MAP_SEARCH_TOOL_NAME)]),
        {
          approvalMode: 'manual',
          userId: 'user-1',
          mcpTools: MCP_TOOLS,
          connectorExecutor,
          resume: { approvals: [{ toolCallId: 'call_1', decision: 'rejected' }] },
        },
      ),
    );

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(offeredToolNames(0)).not.toContain(MAP_SEARCH_TOOL_NAME);
    expect(offeredToolNames(0)).toContain(OTHER_TOOL);
    expect(stepToolChoice(0)).toBe('auto');
    expect(output).toContain('I will answer without the map.');
    expect(output).toContain('data: [DONE]');
  });

  it('keeps the tool on offer when the person declines with guidance, without forcing it', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(answerStep('Searching for tea instead.'));

    await drain(
      runToolLoop(
        processedForcingMapSearch([USER_PROMPT, assistantCall('call_1', MAP_SEARCH_TOOL_NAME)]),
        {
          approvalMode: 'manual',
          userId: 'user-1',
          mcpTools: MCP_TOOLS,
          connectorExecutor,
          resume: {
            approvals: [{ toolCallId: 'call_1', decision: 'rejected' }],
            guidance: 'Look for tea shops instead',
          },
        },
      ),
    );

    expect(offeredToolNames(0)).toContain(MAP_SEARCH_TOOL_NAME);
    expect(stepToolChoice(0)).toBe('auto');
    const denial = stepMessages(0).find((message) => message.tool_call_id === 'call_1');
    expect(denial?.content).toContain('denied permission');
    expect(denial?.content).not.toContain('do not ask for it again');
    expect(stepMessages(0).at(-1)).toMatchObject({
      role: 'user',
      content: 'Look for tea shops instead',
    });
  });

  it('asks under a fresh id when a later step reuses the id of the declined call', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(toolCallStep('call_1', OTHER_TOOL));
    const onApprovalCheckpoint = vi.fn(async (_checkpoint: unknown) => undefined);

    const output = await drain(
      runToolLoop(processedWith([USER_PROMPT, assistantCall('call_1', MAP_TOOL)]), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: MCP_TOOLS,
        connectorExecutor,
        onApprovalCheckpoint,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'rejected' }] },
      }),
    );

    const deltas = wireDeltas(output);
    const request = deltas.find((delta) => delta['x_tool_approval_request'] !== undefined)?.[
      'x_tool_approval_request'
    ] as { tool_call_id?: string; name?: string } | undefined;
    expect(request?.name).toBe(OTHER_TOOL);
    const freshId = request?.tool_call_id;
    expect(freshId).toBeTruthy();
    expect(freshId).not.toBe('call_1');
    const forwardedIds = deltas
      .flatMap((delta) => (delta['tool_calls'] as Array<{ id?: string }> | undefined) ?? [])
      .map((call) => call.id)
      .filter((id): id is string => typeof id === 'string');
    expect(forwardedIds).toEqual([freshId]);
    const requested = agentEventsOf(output).find((event) => event['type'] === 'approval-requested');
    expect(requested).toMatchObject({ approvalId: freshId, toolCallId: freshId, name: OTHER_TOOL });
    const checkpoint = onApprovalCheckpoint.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; tool_calls?: Array<{ id: string }>; tool_call_id?: string }>;
      pendingToolCalls: Array<{ id: string }>;
    };
    expect(checkpoint.pendingToolCalls.map((call) => call.id)).toEqual([freshId]);
    expect(checkpoint.messages.at(-1)?.tool_calls?.map((call) => call.id)).toEqual([freshId]);
    expect(checkpoint.messages.filter((message) => message.tool_call_id === 'call_1')).toHaveLength(
      1,
    );
  });

  it('ends a turn whose step after the decline returns nothing as a completed answer', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(emptyStep());

    const output = await drain(
      runToolLoop(processedWith([USER_PROMPT, assistantCall('call_1', MAP_TOOL)]), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: MCP_TOOLS,
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'rejected' }] },
      }),
    );

    const deltas = wireDeltas(output);
    const events = agentEventsOf(output);
    const answer = deltas
      .map((delta) => (typeof delta['content'] === 'string' ? delta['content'] : ''))
      .join('');
    expect(answer).toBe(DECLINED_ACTION_ANSWER);
    expect(
      events.filter((event) => event['type'] === 'text-delta').map((event) => event['delta']),
    ).toEqual([DECLINED_ACTION_ANSWER]);
    expect(deltas.some((delta) => delta['x_stream_error'] !== undefined)).toBe(false);
    expect(events.some((event) => event['type'] === 'error')).toBe(false);
    expect(
      events.some((event) => event['type'] === 'task-state-changed' && event['state'] === 'failed'),
    ).toBe(false);
    expect(output).toContain('data: [DONE]');
  });

  it('keeps the error for a step that returns nothing when nothing was declined', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(emptyStep());

    const output = await drain(
      runToolLoop(processedWith([USER_PROMPT, assistantCall('call_1', MAP_TOOL)]), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: MCP_TOOLS,
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'approved' }] },
      }),
    );

    const deltas = wireDeltas(output);
    const streamError = deltas.find((delta) => delta['x_stream_error'] !== undefined)?.[
      'x_stream_error'
    ] as { code?: string } | undefined;
    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(streamError?.code).toBe('empty_response');
    expect(output).not.toContain(DECLINED_ACTION_ANSWER);
    expect(
      agentEventsOf(output).some(
        (event) => event['type'] === 'task-state-changed' && event['state'] === 'failed',
      ),
    ).toBe(true);
  });

  it('keeps the error for a step that returns nothing after a call that came back undecided', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(emptyStep());

    const output = await drain(
      runToolLoop(processedWith([USER_PROMPT, assistantCall('call_1', MAP_TOOL)]), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: MCP_TOOLS,
        connectorExecutor,
        resume: { approvals: [] },
      }),
    );

    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(output).not.toContain(DECLINED_ACTION_ANSWER);
    expect(streamErrorCodeOf(output)).toBe('empty_response');
  });

  it('keeps the error for a step that returns nothing after an approved call ran', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(emptyStep());
    const twoCalls = {
      ...assistantCall('call_1', MAP_TOOL),
      tool_calls: [
        ...assistantCall('call_1', MAP_TOOL).tool_calls,
        ...assistantCall('call_2', OTHER_TOOL).tool_calls,
      ],
    };

    const output = await drain(
      runToolLoop(processedWith([USER_PROMPT, twoCalls]), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: MCP_TOOLS,
        connectorExecutor,
        resume: {
          approvals: [
            { toolCallId: 'call_1', decision: 'rejected' },
            { toolCallId: 'call_2', decision: 'approved' },
          ],
        },
      }),
    );

    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(output).not.toContain(DECLINED_ACTION_ANSWER);
    expect(streamErrorCodeOf(output)).toBe('empty_response');
  });

  it('starts the declined sentence on a new paragraph after text already delivered', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(
        sseStreamFrom([
          chunk({ content: 'Let me check the map.' }),
          chunk({
            tool_calls: [
              {
                index: 0,
                id: 'call_2',
                function: {
                  name: MAP_TOOL,
                  arguments: JSON.stringify({ query: 'coffee near Union Square' }),
                },
              },
            ],
          }),
          chunk({}, 'tool_calls'),
        ]),
      )
      .mockResolvedValueOnce(emptyStep());

    const output = await drain(
      runToolLoop(processedWith([USER_PROMPT, assistantCall('call_1', MAP_TOOL)]), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: MCP_TOOLS,
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'rejected' }] },
      }),
    );

    const answer = wireDeltas(output)
      .map((delta) => (typeof delta['content'] === 'string' ? delta['content'] : ''))
      .join('');
    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(answer).toBe(`Let me check the map.\n\n${DECLINED_ACTION_ANSWER}`);
    expect(streamErrorCodeOf(output)).toBeUndefined();
  });

  it('records no tool capability observation for a turn the decline ended', async () => {
    mockBuildToolLoopStream.mockResolvedValueOnce(emptyStep());
    const processed = {
      ...processedWith([USER_PROMPT, assistantCall('call_1', MAP_TOOL)]),
      executionRequirement: { required: true, source: 'explicit_intent' as const },
    };

    const output = await drain(
      runToolLoop(processed, {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: MCP_TOOLS,
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'rejected' }] },
      }),
    );

    expect(output).toContain(DECLINED_ACTION_ANSWER);
    expect(mockRecordCapabilityObservation).not.toHaveBeenCalled();
  });

  it('keeps declines and a place-less map result when older tool results are trimmed', async () => {
    mockBuildToolLoopStream
      .mockResolvedValueOnce(answerStep('Answered.'))
      .mockResolvedValueOnce(answerStep('Answered.'));
    const declineOnce = (guidance?: string) =>
      drain(
        runToolLoop(processedWith([USER_PROMPT, assistantCall('call_1', MAP_TOOL)]), {
          approvalMode: 'manual',
          userId: 'user-1',
          mcpTools: MCP_TOOLS,
          connectorExecutor,
          resume: {
            approvals: [{ toolCallId: 'call_1', decision: 'rejected' }],
            ...(guidance ? { guidance } : {}),
          },
        }),
      );
    await declineOnce();
    await declineOnce('Try the other tool');
    const resultFor = (callIndex: number) =>
      stepMessages(callIndex).find((message) => message.tool_call_id === 'call_1')
        ?.content as string;
    const noPlaces = await executeMapSearchTool(
      { query: 'coffee near Union Square' },
      { toolCallId: 'call_m', resolveView: async () => null },
    );
    const kept = [resultFor(0), resultFor(1), noPlaces.content];
    const messages = [
      ...kept.map((content, index) => ({ role: 'tool', content, tool_call_id: `kept_${index}` })),
      { role: 'tool', content: 'x'.repeat(2_000), tool_call_id: 'call_2' },
      { role: 'tool', content: 'recent', tool_call_id: 'call_3' },
    ];

    await trimToolResultHistoryKeepingReferences(messages, { userId: undefined }, 100, 1);

    expect(messages.slice(0, 3).map((message) => message.content)).toEqual(kept);
    expect(messages[3]?.content).not.toBe('x'.repeat(2_000));
  });
});

type ImportedModule0 = typeof import('@/lib/mcp-tool-executor');
type ImportedModule1 = typeof import('@/lib/services/free-lane/capability-health-service');

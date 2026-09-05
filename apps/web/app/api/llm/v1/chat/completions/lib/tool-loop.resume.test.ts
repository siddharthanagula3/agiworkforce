import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAgentEventDelta } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

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

import { isToolOffered, runToolLoop, type ConnectorToolExecutor } from './tool-loop';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
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

const GITHUB_TOOL = 'mcp__github__get_pull_request_diff';

const githubToolDef: WebMcpToolDef = {
  qualifiedName: GITHUB_TOOL,
  serverId: 'github',
  toolName: 'get_pull_request_diff',
  description: 'diff',
  origin: 'connector',
  inputSchema: { type: 'object' },
};

describe('isToolOffered, resume authorization boundary', () => {
  it.each(['execute_code', 'write_file', 'create_folder', 'url_fetch', 'web_search'])(
    'requires %s to be present in the current request offerings',
    (toolName) => {
      expect(isToolOffered(toolName, [], new Set())).toBe(false);
      expect(isToolOffered(toolName, [], new Set([toolName]))).toBe(true);
    },
  );
});

function makeFreshProcessed(
  overrides: Partial<ProcessedRequest['chatRequest']> = {},
): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'req-1',
    chatRequest: { model: 'gpt-test', messages: [], stream: true, ...overrides } as never,
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

function makeResumeProcessed(
  provider = 'openai',
  chatOverrides: Partial<ProcessedRequest['chatRequest']> = {},
): ProcessedRequest {
  const base = makeFreshProcessed(chatOverrides);
  return {
    ...base,
    provider,
    llmRequest: {
      ...base.llmRequest,
      messages: [
        { role: 'user', content: 'summarize PR 7 in acme/app' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: GITHUB_TOOL,
                arguments: JSON.stringify({ owner: 'acme', repo: 'app', pull_number: 7 }),
              },
            },
          ],
        },
      ],
    },
  };
}

async function drain(gen: AsyncGenerator<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = '';
  for await (const value of gen) out += decoder.decode(value);
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

describe('runToolLoop, manual approval suspend', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebMcpTool.mockReset();
  });

  it('suspends on the first tool_call, surfacing an approval event and executing nothing', async () => {
    const step1 = sseStreamFrom([
      chunk({
        tool_calls: [{ index: 0, id: 'call_1', function: { name: GITHUB_TOOL, arguments: '' } }],
      }),
      chunk({
        tool_calls: [
          {
            index: 0,
            function: { arguments: JSON.stringify({ owner: 'acme', repo: 'app', pull_number: 7 }) },
          },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]);
    mockBuildToolLoopStream.mockResolvedValueOnce(step1);

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'should not run',
      isError: false,
    }));
    const onApprovalCheckpoint = vi.fn(async () => undefined);

    const output = await drain(
      runToolLoop(makeFreshProcessed(), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: [githubToolDef],
        connectorExecutor,
        onApprovalCheckpoint,
      }),
    );

    expect(output).toContain('x_tool_approval_request');
    expect(output).toContain('"tool_call_id":"call_1"');
    expect(output).toContain(`"name":"${GITHUB_TOOL}"`);
    expect(output).toContain('data: [DONE]');
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(mockExecuteWebMcpTool).not.toHaveBeenCalled();
    expect(onApprovalCheckpoint).toHaveBeenCalledWith({
      sessionId: 'req-1',
      turnId: 'req-1',
      nextEventSequence: 6,
      completedSteps: 1,
      events: expect.arrayContaining([
        expect.objectContaining({
          sequence: 3,
          event: expect.objectContaining({ type: 'approval-requested', toolCallId: 'call_1' }),
        }),
        expect.objectContaining({
          sequence: 4,
          event: expect.objectContaining({ type: 'task-state-changed', state: 'awaiting_input' }),
        }),
        expect.objectContaining({
          sequence: 5,
          event: expect.objectContaining({ type: 'lifecycle', phase: 'paused' }),
        }),
      ]),
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'assistant', tool_calls: expect.any(Array) }),
      ]),
      pendingToolCalls: [
        {
          id: 'call_1',
          qualifiedName: GITHUB_TOOL,
          args: { owner: 'acme', repo: 'app', pull_number: 7 },
        },
      ],
    });

    expect(agentEvents(output).map((entry) => entry.event)).toEqual([
      {
        type: 'task-state-changed',
        taskId: 'req-1',
        state: 'queued',
        summary: 'Task accepted by the agent engine.',
      },
      {
        type: 'task-state-changed',
        taskId: 'req-1',
        previousState: 'queued',
        state: 'running',
        summary: 'Agent started working.',
      },
      { type: 'lifecycle', phase: 'started' },
      {
        type: 'approval-requested',
        approvalId: 'call_1',
        toolCallId: 'call_1',
        name: GITHUB_TOOL,
        category: 'connector',
        summary: 'Review GitHub action',
        input: { owner: 'acme', repo: 'app', pull_number: 7 },
      },
      {
        type: 'task-state-changed',
        taskId: 'req-1',
        previousState: 'running',
        state: 'awaiting_input',
        summary: 'The agent needs approval before it can continue.',
      },
      { type: 'lifecycle', phase: 'paused' },
    ]);
  });
});

describe('runToolLoop, manual approval resume', () => {
  beforeEach(() => {
    mockBuildToolLoopStream.mockReset();
    mockGetE2BExecutor.mockReset();
    mockPauseE2BSession.mockReset();
    mockExecuteWebMcpTool.mockReset();
  });

  it('executes the approved+pending tool and continues to a final answer', async () => {
    const continuation = sseStreamFrom([
      chunk({ content: 'The PR renames a function.' }),
      chunk({}, 'stop'),
    ]);
    mockBuildToolLoopStream.mockResolvedValueOnce(continuation);

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async (serverId, toolName, args) => {
      expect(serverId).toBe('github');
      expect(toolName).toBe('get_pull_request_diff');
      expect(args).toEqual({ owner: 'acme', repo: 'app', pull_number: 7 });
      return { handled: true, content: 'diff --git a/x b/x\n-old\n+new', isError: false };
    });

    const output = await drain(
      runToolLoop(makeResumeProcessed(), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: [githubToolDef],
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'approved' }] },
        eventSessionId: 'conversation-1',
        eventTurnId: 'original-turn-1',
        initialEventSequence: 6,
      }),
    );

    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(mockExecuteWebMcpTool).not.toHaveBeenCalled();
    expect(agentEvents(output)[0]).toMatchObject({
      sessionId: 'conversation-1',
      turnId: 'original-turn-1',
      sequence: 6,
    });

    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    const contRequest = mockBuildToolLoopStream.mock.calls[0]?.[2] as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    };
    const toolResult = contRequest.messages.find((m) => m.role === 'tool');
    expect(toolResult?.content).toContain('diff --git');
    expect(toolResult?.tool_call_id).toBe('call_1');

    expect(output).toContain('"status":"completed"');
    expect(output).toContain('The PR renames a function.');
    expect(output).toContain('data: [DONE]');

    const activity = agentEvents(output);
    expect(activity.map((entry) => entry.event.type)).toEqual([
      'task-state-changed',
      'lifecycle',
      'approval-resolved',
      'tool-execution-start',
      'tool-execution-end',
      'text-delta',
      'task-state-changed',
      'stop',
    ]);
    expect(activity[0]?.event).toEqual({
      type: 'task-state-changed',
      taskId: 'original-turn-1',
      previousState: 'awaiting_input',
      state: 'running',
      summary: 'Agent resumed after user input.',
    });
    expect(activity[1]?.event).toEqual({ type: 'lifecycle', phase: 'resumed' });
    expect(activity[2]?.event).toEqual({
      type: 'approval-resolved',
      approvalId: 'call_1',
      decision: 'approved',
    });
    expect(activity[5]?.event).toEqual({
      type: 'text-delta',
      delta: 'The PR renames a function.',
    });
    expect(activity[6]?.event).toMatchObject({
      type: 'task-state-changed',
      taskId: 'original-turn-1',
      previousState: 'running',
      state: 'ready_for_review',
    });
  });

  it('rejects a mismatched/forged tool_call_id and executes nothing', async () => {
    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'should not run',
      isError: false,
    }));

    const output = await drain(
      runToolLoop(makeResumeProcessed(), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: [githubToolDef],
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_FORGED', decision: 'approved' }] },
      }),
    );

    expect(mockBuildToolLoopStream).not.toHaveBeenCalled();
    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(mockExecuteWebMcpTool).not.toHaveBeenCalled();
    expect(output).toContain('unknown tool call');
    expect(output).toContain('data: [DONE]');
  });

  it('appends a denial result on reject and continues the model without executing', async () => {
    const continuation = sseStreamFrom([
      chunk({ content: 'Understood, I will not run that tool.' }),
      chunk({}, 'stop'),
    ]);
    mockBuildToolLoopStream.mockResolvedValueOnce(continuation);

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'should not run',
      isError: false,
    }));

    const output = await drain(
      runToolLoop(makeResumeProcessed(), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: [githubToolDef],
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'rejected' }] },
      }),
    );

    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    const contRequest = mockBuildToolLoopStream.mock.calls[0]?.[2] as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    };
    const toolResult = contRequest.messages.find((m) => m.role === 'tool');
    expect(toolResult?.tool_call_id).toBe('call_1');
    expect(toolResult?.content).toContain('denied permission');
    expect(output).toContain('Understood');
  });

  it('fails closed when an approved tool is not in the offered catalog', async () => {
    const continuation = sseStreamFrom([chunk({ content: 'ok' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(continuation);

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'should not run',
      isError: false,
    }));

    const output = await drain(
      runToolLoop(makeResumeProcessed(), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: [],
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'approved' }] },
      }),
    );

    expect(connectorExecutor).not.toHaveBeenCalled();
    expect(mockExecuteWebMcpTool).not.toHaveBeenCalled();
    expect(output).toContain('is not available and was not executed');
    const contRequest = mockBuildToolLoopStream.mock.calls[0]?.[2] as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    };
    const toolResult = contRequest.messages.find((m) => m.role === 'tool');
    expect(toolResult?.content).toContain('is not available');
  });

  it('resumes an Anthropic turn normally (approve endpoint drops thinking; no special case)', async () => {
    const continuation = sseStreamFrom([
      chunk({ content: 'The PR renames a function.' }),
      chunk({}, 'stop'),
    ]);
    mockBuildToolLoopStream.mockResolvedValueOnce(continuation);

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'diff --git a/x b/x',
      isError: false,
    }));

    const output = await drain(
      runToolLoop(makeResumeProcessed('anthropic'), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: [githubToolDef],
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'approved' }] },
      }),
    );

    expect(connectorExecutor).toHaveBeenCalledTimes(1);
    expect(mockBuildToolLoopStream).toHaveBeenCalledTimes(1);
    expect(output).toContain('The PR renames a function.');
    expect(output).toContain('data: [DONE]');
  });

  it('steers the run with resume guidance, appended after every tool result', async () => {
    const continuation = sseStreamFrom([
      chunk({ content: 'Focusing on the migration file only.' }),
      chunk({}, 'stop'),
    ]);
    mockBuildToolLoopStream.mockResolvedValueOnce(continuation);

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'diff --git a/x b/x',
      isError: false,
    }));

    const output = await drain(
      runToolLoop(makeResumeProcessed(), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: [githubToolDef],
        connectorExecutor,
        resume: {
          approvals: [{ toolCallId: 'call_1', decision: 'approved' }],
          guidance: '  Only review the migration file.  ',
        },
      }),
    );

    const contRequest = mockBuildToolLoopStream.mock.calls[0]?.[2] as {
      messages: Array<{ role: string; content: string; tool_call_id?: string }>;
    };
    const roles = contRequest.messages.map((message) => message.role);
    const lastMessage = contRequest.messages.at(-1);
    expect(lastMessage).toEqual({ role: 'user', content: 'Only review the migration file.' });
    expect(roles.lastIndexOf('tool')).toBeLessThan(roles.lastIndexOf('user'));

    const guidanceEvent = agentEvents(output).find(
      (entry) => entry.event.type === 'progress-update',
    );
    expect(guidanceEvent?.event).toMatchObject({
      summary: 'Applied your guidance',
      detail: 'Only review the migration file.',
      status: 'completed',
    });
    expect(output).toContain('Focusing on the migration file only.');
  });

  it('leaves the resumed thread untouched when no guidance is supplied', async () => {
    const continuation = sseStreamFrom([chunk({ content: 'done' }), chunk({}, 'stop')]);
    mockBuildToolLoopStream.mockResolvedValueOnce(continuation);

    const connectorExecutor: ConnectorToolExecutor = vi.fn(async () => ({
      handled: true,
      content: 'diff --git a/x b/x',
      isError: false,
    }));

    await drain(
      runToolLoop(makeResumeProcessed(), {
        approvalMode: 'manual',
        userId: 'user-1',
        mcpTools: [githubToolDef],
        connectorExecutor,
        resume: { approvals: [{ toolCallId: 'call_1', decision: 'approved' }] },
      }),
    );

    const contRequest = mockBuildToolLoopStream.mock.calls[0]?.[2] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(contRequest.messages.at(-1)?.role).toBe('tool');
  });
});
